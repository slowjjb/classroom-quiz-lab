import { auth, db, isConfigured, formatError } from './firebase.js';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { onValue, ref, push, set, remove } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import { parseCSV, makeDraftRows, validateRows, questionToDraft, decodeFile, toCSV } from './csv.js?v=3.2';
import { makeRulesV3 } from './rules-v3.js';
import { normalizeQuestionImage, siteRootFromPage } from './image-utils.js?v=3.2';

const $ = id => document.getElementById(id);
let user = null, unsubscribe = null, authorized = false, savedSets = {};
let draftRows = [], draftId = null, createdAt = null, sourceName = '', dirty = false;
const q = sel => document.querySelector(sel);
function text(id, value, kind = '') { $(id).textContent = value; $(id).dataset.kind = kind; }
function badge(textValue, kind = 'neutral') { $('sets-auth-badge').textContent = textValue; $('sets-auth-badge').className = `pill pill-${kind}`; }
function draftBadge(value, kind='neutral') { $('draft-badge').textContent = value; $('draft-badge').className = `pill pill-${kind}`; }
const rootUrl=siteRootFromPage(location.href);
function warnDiscard() { return !dirty || confirm('저장하지 않은 수정 내용이 있습니다. 현재 초안을 버릴까요?'); }
function formBlock(tag, label, value, onChange, attrs = {}) {
  const box = document.createElement('label'); box.className = 'edit-field';
  const heading = document.createElement('span'); heading.className = 'field-mini'; heading.textContent = label;
  const input = document.createElement(tag); input.value = value; input.className = 'edit-input';
  for (const [key, v] of Object.entries(attrs)) input[key] = v;
  input.addEventListener('input', () => onChange(input.value));
  box.append(heading, input); return box;
}
function makeButton(label, fn, className = 'btn btn-outline btn-small') {
  const button = document.createElement('button'); button.type = 'button'; button.className = className; button.textContent = label;
  button.addEventListener('click', fn); return button;
}
function downloadText(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const href = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = href; a.download = filename;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(href), 2000);
}
function setWorkspace(enabled) {
  authorized = enabled;
  $('sets-workspace').classList.toggle('workspace-locked', !enabled);
  $('sets-workspace').setAttribute('aria-disabled', String(!enabled));
  refreshSaveState();
}
function refreshSaveState() { $('save-set').disabled = !authorized || draftRows.length === 0; $('download-draft').disabled = draftRows.length === 0; }
function handleAuth(next) {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  user = next?.providerData?.some(v => v.providerId === 'google.com') ? next : null;
  savedSets = {}; renderSaved(); setWorkspace(false);
  $('sets-login').hidden = Boolean(user); $('sets-logout').hidden = !user; $('sets-retry').hidden = !user;
  $('rules-guide').hidden = !user;
  if (!user) {
    badge('로그인 필요'); text('sets-auth-message', '교사 Google 계정으로 로그인해 주세요.');
    $('saved-list').textContent = '로그인이 필요합니다.'; return;
  }
  badge('연결 확인 중'); text('sets-auth-message', 'Google 로그인 성공. v1 데이터베이스 접근 권한을 확인합니다.');
  listenSets();
}
function listenSets() {
  if (!user) return;
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  $('sets-retry').disabled = true;
  unsubscribe = onValue(ref(db, 'v1/questionSets'), snapshot => {
    $('sets-retry').disabled = false;
    savedSets = snapshot.val() || {};
    setWorkspace(true);
    badge('교사 권한 확인', 'success');
    text('sets-auth-message', '인증 및 문제 세트 읽기 권한 확인 완료. 정답은 교사용 경로에만 저장됩니다.', 'success');
    $('rules-guide').hidden = true;
    renderSaved();
  }, error => {
    $('sets-retry').disabled = false;
    badge('v1 규칙 필요', 'error');
    text('sets-auth-message', `데이터베이스 접근이 거부되었습니다. v1 규칙을 게시한 뒤 '권한 다시 확인'을 눌러주세요. (${formatError(error)})`, 'error');
    $('rules-guide').hidden = false;
    setWorkspace(false);
  });
}
function renderSaved() {
  const list = $('saved-list'); list.replaceChildren();
  const entries = Object.entries(savedSets).sort((a,b) => (b[1].updatedAt || 0)-(a[1].updatedAt || 0));
  $('saved-count').textContent = `${entries.length}개`;
  if (!entries.length) { const empty = document.createElement('p'); empty.className='empty-state'; empty.textContent='저장된 문제 세트가 없습니다.'; list.append(empty); return; }
  for (const [id, record] of entries) {
    const row = document.createElement('div'); row.className = 'saved-set';
    const label = document.createElement('div'); label.className = 'saved-description';
    const title = document.createElement('strong'); title.textContent = record.title || '(제목 없음)';
    const meta = document.createElement('span'); meta.className='helper';
    meta.textContent = `${Object.keys(record.questions || {}).length}문항 · 수정 ${new Date(record.updatedAt).toLocaleString('ko-KR')}`;
    label.append(title, meta);
    const actions = document.createElement('div'); actions.className='button-row';
    actions.append(makeButton('불러오기', () => loadSet(id)));
    actions.append(makeButton('CSV', () => {
      const rec = savedSets[id]; const qs = Object.values(rec.questions || {}).sort((a,b)=>a.number-b.number);
      if(confirmImageLoss(qs))downloadText(safeFileName(rec.title)+'.csv', toCSV(qs.map(questionToDraft)), 'text/csv;charset=utf-8');
    }));
    actions.append(makeButton('삭제', () => deleteSet(id), 'btn btn-danger btn-small'));
    row.append(label, actions); list.append(row);
  }
}
function confirmImageLoss(rows){
  return !rows.some(q=>Boolean(q.imageUrl)) || confirm('블루킷 CSV에는 이미지 열이 없어 이미지 연결이 내보내지지 않습니다. 이미지는 Firebase 문제 세트에만 보존됩니다. CSV를 저장할까요?');
}
function safeFileName(name) { return String(name || 'quiz-questions').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0, 70); }
function loadSet(id) {
  if (!warnDiscard()) return;
  const record = savedSets[id]; if (!record) return;
  draftId = id; createdAt = record.createdAt || Date.now(); sourceName = record.sourceName || '';
  draftRows = Object.values(record.questions || {}).sort((a,b)=>a.number-b.number).map(questionToDraft);
  $('set-title').value = record.title; dirty = false;
  renderEditor(); validateAndDisplay();
  text('editor-status', `저장된 '${record.title}' 문제 세트를 불러왔습니다.`);
  q('#questions-editor')?.scrollIntoView({behavior:'smooth', block:'start'});
}
async function deleteSet(id) {
  const record = savedSets[id]; if (!record || !confirm(`'${record.title}' 문제 세트를 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
  try { await remove(ref(db, `v1/questionSets/${id}`)); if (draftId === id) { draftId=null; createdAt=null; dirty=true; }
    text('editor-status', `'${record.title}' 세트가 삭제되었습니다.`, 'success');
  } catch(error) { text('editor-status', '삭제 실패: '+formatError(error), 'error'); }
}
function newDraft() {
  if (!warnDiscard()) return;
  draftRows=[]; draftId=null; createdAt=null; sourceName=''; dirty=false; $('set-title').value=''; $('csv-file').value='';
  renderEditor(); validateAndDisplay(); text('editor-status', '새 세트입니다. CSV를 업로드해 주세요.');
}
function markEdited() { dirty = true; draftBadge(draftId ? '수정 중' : '미저장 초안'); }
function changeField(row, pos, value) { row.fields[pos] = value; markEdited(); }
function renderEditor() {
  const list = $('questions-editor'); list.replaceChildren(); refreshSaveState();
  draftBadge(draftRows.length ? (draftId ? '저장본 편집 중' : 'CSV 불러옴') : '초안 없음');
  draftRows.forEach((row, idx) => {
    const card = document.createElement('details');
    card.className='question-card';
    card.dataset.questionNumber = String(idx + 1);
    if (idx < 3) card.open=true;
    const summary = document.createElement('summary'); summary.textContent=`${idx+1}번 · ${row.fields[1]?.trim().slice(0, 75) || '문제 입력 필요'}`;
    card.append(summary);
    const grid = document.createElement('div'); grid.className='editor-grid editor-grid-meta';
    grid.append(formBlock('input', 'A · 원본 문항 번호',row.fields[0], v=>changeField(row,0,v),{inputMode:'numeric'}));
    grid.append(formBlock('input', 'G · 제한 시간(초)',row.fields[6], v=>changeField(row,6,v),{inputMode:'numeric'}));
    card.append(grid);
    const questionField = formBlock('textarea','B · 문제',row.fields[1],v=>{changeField(row,1,v);summary.textContent=`${idx+1}번 · ${v.slice(0,75)}`;},{rows:4});
    questionField.classList.add('edit-field-wide');
    questionField.querySelector('.edit-input')?.classList.add('question-textarea');
    card.append(questionField);
    const typeWrap = document.createElement('label'); typeWrap.className='edit-field';
    const label = document.createElement('span'); label.className='field-mini'; label.textContent='문제 유형 (J열)';
    const selector = document.createElement('select'); selector.className='edit-input';
    [['','객관식'],['typing','주관식 (typing)']].forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;selector.append(o);});
    selector.value=row.fields[9].trim() === 'typing' ? 'typing' : '';
    selector.addEventListener('change',()=>{row.fields[9]=selector.value;row.fields[7]=selector.value ? '' : '1';markEdited();renderEditor();validateAndDisplay();});
    typeWrap.append(label,selector);card.append(typeWrap);
    const answers = document.createElement('div'); answers.className='answer-grid';
    for (let i=0;i<4;i++) {
      const answerField = formBlock('textarea',`${'CDEF'[i]} · ${row.fields[9] === 'typing' ? '허용 정답 '+(i+1) : '보기 '+(i+1)}`,row.fields[i+2],v=>changeField(row,i+2,v),{rows:3});
      answerField.querySelector('.edit-input')?.classList.add('answer-textarea');
      answers.append(answerField);
    }
    card.append(answers);
    if (row.fields[9] !== 'typing') {
      const correct = document.createElement('label'); correct.className='edit-field';
      const lab = document.createElement('span');lab.className='field-mini';lab.textContent='H · 정답 보기 번호';
      const pick = document.createElement('select');pick.className='edit-input';
      [['','정답 번호 선택'],['1','1'],['2','2'],['3','3'],['4','4']].forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;pick.append(o);});
      pick.value=row.fields[7].trim(); pick.addEventListener('change',()=>changeField(row,7,pick.value));correct.append(lab,pick);card.append(correct);
    }
    // 이미지 정보는 블루킷 10열 CSV가 아닌 문제 세트의 부가 정보로 관리합니다.
    const imageField=formBlock('input', '문제 이미지 (GitHub images/questions 폴더의 파일명 또는 주소)',row.imageUrl||'',value=>{
      row.imageUrl=value;markEdited();
      const warning=card.querySelector('.question-image-warning');
      const preview=card.querySelector('.question-image-preview');
      try{
        const safe=normalizeQuestionImage(value,rootUrl);
        warning.textContent='';
        preview.hidden=!safe;
        if(safe)preview.src=new URL(safe,rootUrl).href;
      }catch(e){warning.textContent=e.message;preview.hidden=true;}
    },{placeholder:'예: 도형_05.png 또는 images/questions/도형_05.png'});
    card.append(imageField);
    const imagePreview=document.createElement('img');imagePreview.className='question-image-preview';imagePreview.alt=`${idx+1}번 문제 이미지 미리보기`;imagePreview.loading='lazy';
    const imageWarning=document.createElement('p');imageWarning.className='helper question-image-warning';
    imagePreview.addEventListener('error',()=>{imageWarning.textContent='이미지를 불러오지 못했습니다. GitHub에 파일을 올렸는지, 파일 이름과 대소문자가 일치하는지 확인하세요.';});
    try{const safe=normalizeQuestionImage(row.imageUrl,rootUrl);imagePreview.hidden=!safe;if(safe)imagePreview.src=new URL(safe,rootUrl).href;}
    catch(e){imagePreview.hidden=true;imageWarning.textContent=e.message;}
    card.append(imagePreview,imageWarning);
    if (row.columnCount !== 10 && !row.acknowledged && row.columnCount < 10) {
      card.append(makeButton(`${row.columnCount}열 → 10열 보정 승인`,()=>{row.acknowledged=true;markEdited();validateAndDisplay();}));
    }
    if (row.columnCount > 10) { const note=document.createElement('p');note.className='helper';note.textContent='원본이 10열을 초과했습니다. 데이터 유실을 방지하려면 CSV 파일을 수정하여 다시 업로드하세요.';card.append(note); }
    list.append(card);
  });
}
function validateAndDisplay() {
  const result=validateRows(draftRows);const holder=$('validation-results');holder.replaceChildren();
  // 오류 있는 이미지 링크도 명확히 알려줍니다. 정상 문항에는 이미지 주소만 보존합니다.
  draftRows.forEach((row,i)=>{
    try{
      const safe=normalizeQuestionImage(row.imageUrl||'',rootUrl);
      if(result.problems&&safe)result.problems[i].imageUrl=safe;
    }catch(e){result.issues.push({line:row.line,message:`문제 이미지: ${e.message}`});}
  });
  if(result.issues.length)result.problems=null;
  const title=$('set-title').value.trim();
  if (!title) result.issues.push({line:0,message:'세트 이름을 입력해 주세요.'});
  if (title.length > 80) result.issues.push({line:0,message:'세트 이름은 최대 80자입니다.'});
  if (!result.issues.length) {
    const ok=document.createElement('p');ok.className='validation-ok';ok.textContent=`검증 통과 · 총 ${draftRows.length}문항 · 객관식 ${result.problems.filter(p=>p.type==='multiple_choice').length}개 / 주관식 ${result.problems.filter(p=>p.type==='typing').length}개`;holder.append(ok);
    draftBadge(`${draftRows.length}문항 정상`, 'success');
  } else {
    const top=document.createElement('strong');top.textContent=`검증할 항목 ${result.issues.length}개`;holder.append(top);
    const list=document.createElement('ul');list.className='error-list';
    result.issues.slice(0,100).forEach(issue=>{const li=document.createElement('li');li.textContent=`${issue.line ? `CSV ${issue.line}행` : '세트'}: ${issue.message}`;list.append(li);});holder.append(list);
    if(result.issues.length>100){const p=document.createElement('p');p.textContent=`추가 오류 ${result.issues.length-100}개가 있습니다.`;holder.append(p);}
    draftBadge('수정 필요','error');
  }
  return result;
}
async function importFile(file) {
  if (!file) return;
  if (!warnDiscard()) { $('csv-file').value='';return; }
  if (file.size > 2*1024*1024) {text('editor-status','CSV 최대 크기는 v1에서 2MB입니다.','error');return;}
  try {
    const {text:content, encoding}=await decodeFile(file);
    const parsed=parseCSV(content);
    draftRows=makeDraftRows(parsed); draftId=null; createdAt=null; sourceName=file.name; dirty=true;
    $('set-title').value=file.name.replace(/\.csv$/i,'').slice(0,80);
    renderEditor(); const result=validateAndDisplay();
    text('editor-status',`${file.name} · ${encoding} · ${draftRows.length}문항 파싱 완료 · 검증 오류 ${result.issues.length}개`,result.issues.length?'error':'success');
  } catch(error) {
    text('editor-status',`CSV 분석 실패: ${error.message}`, 'error');
  }
}
async function saveSet() {
  if (!authorized || !user) return;
  const result=validateAndDisplay();if(result.issues.length){text('editor-status','오류를 모두 고친 뒤 저장해 주세요.','error');return;}
  const btn=$('save-set');btn.disabled=true;
  try {
    const id=draftId || push(ref(db,'v1/questionSets')).key;
    const qs={};
    result.problems.forEach(p=>{qs['q'+String(p.number).padStart(4,'0')]=p;});
    const now=Date.now();
    await set(ref(db,`v1/questionSets/${id}`),{
      title:$('set-title').value.trim(), sourceName:sourceName.slice(0,200), createdAt:createdAt || now, updatedAt:now, questions:qs
    });
    draftId=id;createdAt=createdAt || now;dirty=false;
    draftBadge('저장 완료','success');
    text('editor-status',`Firebase 저장 완료 · ${result.problems.length}문항 · 정답 정보는 교사에게만 읽기 허용됩니다.`,'success');
  } catch(error) {text('editor-status','저장 실패: '+formatError(error),'error');}
  finally {refreshSaveState();}
}
$('set-title').addEventListener('input',()=>{markEdited();});
$('csv-file').addEventListener('change',e=>importFile(e.target.files?.[0]));
$('new-draft').addEventListener('click',newDraft);
$('check-draft').addEventListener('click',()=>{const r=validateAndDisplay();text('editor-status',r.issues.length?`수정할 오류 ${r.issues.length}개가 있습니다.`:'모든 문항 검증을 통과했습니다.',r.issues.length?'error':'success');});
$('save-set').addEventListener('click',saveSet);
$('download-draft').addEventListener('click',()=>{if(confirmImageLoss(draftRows))downloadText(safeFileName($('set-title').value || 'quiz-v1-draft')+'.csv',toCSV(draftRows),'text/csv;charset=utf-8');});
$('sets-retry').addEventListener('click',listenSets);
$('rules-copy').addEventListener('click',async()=>{
  if(!user)return;
  try {await navigator.clipboard.writeText(makeRulesV3(user.uid));text('rules-status','v0~v3 통합 규칙을 복사했습니다. Firebase Realtime Database > 규칙에 붙여넣고 게시하세요. GitHub database.rules.json도 같은 내용으로 변경해야 합니다.','success');}
  catch(error){text('rules-status','복사에 실패했습니다. JSON 파일 다운로드를 이용하세요. '+error.message,'error');}
});
$('rules-download').addEventListener('click',()=>{if(user)downloadText('database.rules.json',makeRulesV3(user.uid),'application/json;charset=utf-8');});
if(!isConfigured){badge('Firebase 설정 필요','error');text('sets-auth-message','firebase-config.js 설정을 확인해 주세요.','error');}
else {
  $('sets-login').disabled=false;
  $('sets-login').addEventListener('click',async()=>{
    try{await signInWithPopup(auth,new GoogleAuthProvider());}
    catch(error){text('sets-auth-message',formatError(error),'error');}
  });
  $('sets-logout').addEventListener('click',async()=>{try{await signOut(auth);}catch(error){text('sets-auth-message',formatError(error),'error');}});
  onAuthStateChanged(auth,handleAuth,error=>text('sets-auth-message',formatError(error),'error'));
}
