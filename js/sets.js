import { auth, db, isConfigured, formatError } from './firebase.js';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { onValue, ref, push, set, remove } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import { parseCSV, makeDraftRows, validateRows, questionToDraft, decodeFile, toCSV } from './csv.js?v=4.4';
import { makeRulesV4 } from './rules-v4.js';
import { normalizeQuestionImage, siteRootFromPage, scanQuestionImages } from './image-utils.js?v=4.4';

const $ = id => document.getElementById(id);
let user = null, unsubscribe = null, authorized = false, savedSets = {};
let draftRows = [], draftId = null, createdAt = null, sourceName = '', dirty = false;
let imageAuditSeq = 0;
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
// 내용이 짧을 때는 빈 공간을 줄이고, 긴 지문은 입력 중 자연스럽게 확장합니다.
function autoSizeTextarea(input) {
  const minHeight = input.classList.contains('question-textarea') ? 58 : 54;
  const maxHeight = input.classList.contains('question-textarea') ? 460 : 230;
  input.style.height = 'auto';
  const wanted = Math.max(minHeight, Math.min(maxHeight, input.scrollHeight + 2));
  input.style.height = wanted + 'px';
  input.style.overflowY = input.scrollHeight + 2 > maxHeight ? 'auto' : 'hidden';
}
function activateAutoSize(card) {
  card.querySelectorAll('textarea.question-textarea, textarea.answer-textarea').forEach(input => {
    autoSizeTextarea(input);
    input.addEventListener('input', () => autoSizeTextarea(input));
  });
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
function refreshSaveState() { $('save-set').disabled = !authorized || draftRows.length === 0; $('download-draft').disabled = draftRows.length === 0; $('check-images').disabled = draftRows.length === 0; }
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
    actions.append(makeButton('퍼플킷 CSV', () => downloadSavedCSV(id, 'purplekit')));
    actions.append(makeButton('블루킷 CSV', () => downloadSavedCSV(id, 'blooket')));
    actions.append(makeButton('삭제', () => deleteSet(id), 'btn btn-danger btn-small'));
    row.append(label, actions); list.append(row);
  }
}
function downloadSavedCSV(id, format) {
  const rec = savedSets[id]; if (!rec) return;
  const questions = Object.values(rec.questions || {}).sort((a,b)=>a.number-b.number);
  if (format === 'blooket' && !confirmImageLoss(questions)) return;
  const basename = safeFileName(rec.title);
  downloadText(basename + (format === 'blooket' ? '_블루킷' : '_퍼플킷') + '.csv', toCSV(questions.map(questionToDraft), { format }), 'text/csv;charset=utf-8');
}
function confirmImageLoss(rows){
  return !rows.some(q=>Boolean(q.imageUrl)) || confirm('블루킷 CSV는 10열이므로 K열 이미지 파일명이 제외됩니다. 이미지 연결은 Firebase와 퍼플킷 CSV에 보존됩니다. 블루킷용으로 내보낼까요?');
}
function safeFileName(name) { return String(name || 'quiz-questions').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0, 70); }
function loadSet(id) {
  if (!warnDiscard()) return;
  const record = savedSets[id]; if (!record) return;
  draftId = id; createdAt = record.createdAt || Date.now(); sourceName = record.sourceName || '';
  draftRows = Object.values(record.questions || {}).sort((a,b)=>a.number-b.number).map(questionToDraft);
  $('set-title').value = record.title; dirty = false;
  invalidateImageAudit(); renderEditor(); validateAndDisplay();
  void auditImages();
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
  invalidateImageAudit(); renderEditor(); validateAndDisplay(); text('editor-status', '새 세트입니다. CSV를 업로드해 주세요.');
}
function markEdited() { dirty = true; draftBadge(draftId ? '수정 중' : '미저장 초안'); }
function changeField(row, pos, value) { row.fields[pos] = value; markEdited(); }
function renderEditor(expandIndex = null) {
  const list = $('questions-editor'); list.replaceChildren(); refreshSaveState();
  draftBadge(draftRows.length ? (draftId ? '저장본 편집 중' : 'CSV 불러옴') : '초안 없음');
  draftRows.forEach((row, idx) => {
    const card = document.createElement('details');
    card.className='question-card';
    card.dataset.questionNumber = String(idx + 1);
    if (idx < 3 || idx === expandIndex) card.open=true;
    const summary = document.createElement('summary'); summary.textContent=`${idx+1}번 · ${row.fields[1]?.trim().slice(0, 75) || '문제 입력 필요'}`;
    card.append(summary);
    const grid = document.createElement('div'); grid.className='editor-grid editor-grid-meta';
    grid.append(formBlock('input', 'A · 원본 문항 번호',row.fields[0], v=>changeField(row,0,v),{inputMode:'numeric'}));
    const typeWrap = document.createElement('label'); typeWrap.className='edit-field';
    const label = document.createElement('span'); label.className='field-mini'; label.textContent='문제 유형 (J열)';
    const selector = document.createElement('select'); selector.className='edit-input';
    [['','객관식'],['typing','주관식 (typing)']].forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;selector.append(o);});
    selector.value=row.fields[9].trim() === 'typing' ? 'typing' : '';
    selector.addEventListener('change',()=>{
      row.fields[9]=selector.value;
      row.fields[7]=selector.value ? '' : '1';
      markEdited();renderEditor(idx);validateAndDisplay();
    });
    typeWrap.append(label,selector);
    grid.append(typeWrap);
    grid.append(formBlock('input', 'G · 제한 시간(초)',row.fields[6], v=>changeField(row,6,v),{inputMode:'numeric'}));
    card.append(grid);
    const questionField = formBlock('textarea','B · 문제',row.fields[1],v=>{
      changeField(row,1,v);
      summary.textContent=`${idx+1}번 · ${v.slice(0,75)}`;
    },{rows:1});
    questionField.classList.add('edit-field-wide');
    questionField.querySelector('.edit-input')?.classList.add('question-textarea');
    card.append(questionField);
    const answers = document.createElement('div'); answers.className='answer-grid';
    for (let i=0;i<4;i++) {
      const answerField = formBlock('textarea',`${'CDEF'[i]} · ${row.fields[9] === 'typing' ? '허용 정답 '+(i+1) : '보기 '+(i+1)}`,row.fields[i+2],v=>changeField(row,i+2,v),{rows:1});
      answerField.querySelector('.edit-input')?.classList.add('answer-textarea');
      answers.append(answerField);
    }
    card.append(answers);
    if (row.fields[9] !== 'typing') {
      const correct = document.createElement('label'); correct.className='edit-field';
      const lab = document.createElement('span');lab.className='field-mini';lab.textContent='H · 정답 보기 번호';
      const pick = document.createElement('select');pick.className='edit-input';
      [['','정답 번호 선택'],['1','1'],['2','2'],['3','3'],['4','4']].forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;pick.append(o);});
      pick.value=row.fields[7].trim(); pick.addEventListener('change',()=>changeField(row,7,pick.value));correct.classList.add('correct-field');correct.append(lab,pick);card.append(correct);
    }
    // 이미지 정보는 블루킷 10열 CSV가 아닌 문제 세트의 부가 정보로 관리합니다.
    const imageDetails=document.createElement('details');
    imageDetails.className='question-image-details';
    imageDetails.open=Boolean(row.imageUrl);
    const imageSummary=document.createElement('summary');
    imageSummary.textContent=row.imageUrl?'문제 이미지 · 등록됨':'문제 이미지 추가 (선택 사항)';
    imageDetails.append(imageSummary);
    const imageField=formBlock('input', 'GitHub images/questions 폴더의 파일명 또는 주소',row.imageUrl||'',value=>{
      imageSummary.textContent=value.trim()?'문제 이미지 · 등록됨':'문제 이미지 추가 (선택 사항)';
      row.imageUrl=value;markEdited();invalidateImageAudit();
      const auditStatus=card.querySelector('.question-image-check');
      if(auditStatus)auditStatus.textContent=value.trim()?'이미지를 수정했습니다. 「이미지 파일 다시 확인」을 눌러주세요.':'이미지 없음';
      const warning=card.querySelector('.question-image-warning');
      const preview=card.querySelector('.question-image-preview');
      try{
        const safe=normalizeQuestionImage(value,rootUrl);
        warning.textContent='';
        preview.hidden=!safe;
        if(safe)preview.src=new URL(safe,rootUrl).href;
      }catch(e){warning.textContent=e.message;preview.hidden=true;}
    },{placeholder:'예: 도형_05.png 또는 images/questions/도형_05.png'});
    imageDetails.append(imageField);
    const imagePreview=document.createElement('img');imagePreview.className='question-image-preview';imagePreview.alt=`${idx+1}번 문제 이미지 미리보기`;imagePreview.loading='lazy';
    const imageWarning=document.createElement('p');imageWarning.className='helper question-image-warning';
    imagePreview.addEventListener('error',()=>{imageWarning.textContent='이미지를 불러오지 못했습니다. GitHub에 파일을 올렸는지, 파일 이름과 대소문자가 일치하는지 확인하세요.';});
    try{const safe=normalizeQuestionImage(row.imageUrl,rootUrl);imagePreview.hidden=!safe;if(safe)imagePreview.src=new URL(safe,rootUrl).href;}
    catch(e){imagePreview.hidden=true;imageWarning.textContent=e.message;}
    const imageCheck=document.createElement('p'); imageCheck.className='helper question-image-check'; imageCheck.textContent=row.imageUrl?'CSV 이미지 연결 · 존재 여부 확인 전':'이미지 없음';
    imageDetails.append(imagePreview,imageWarning,imageCheck);
    card.append(imageDetails);
    if (row.columnCount !== 10 && !row.acknowledged && row.columnCount < 10) {
      card.append(makeButton(`${row.columnCount}열 → 10열 보정 승인`,()=>{row.acknowledged=true;markEdited();validateAndDisplay();}));
    }
    if (row.columnCount > 11) { const note=document.createElement('p');note.className='helper';note.textContent='원본이 11열을 초과했습니다. A~K열만 사용하므로 원본 CSV를 확인해 주세요.';card.append(note); }
    list.append(card);
    if (card.open) activateAutoSize(card);
    else card.addEventListener('toggle', () => { if (card.open) activateAutoSize(card); }, {once:true});
  });
}
// 파일 존재 확인은 저장 가능 여부(문항 검증)와 별개로 안내합니다.
// 파일 누락은 경고로 표시하고, 오프라인/403/시간 초과는 '확인 불가'로 구별합니다.
function invalidateImageAudit() {
  imageAuditSeq++;
  const holder = $('image-check-results');
  holder.hidden = true;
  holder.replaceChildren();
  refreshSaveState();
}
function setImageAuditLine(index, status, reason = '') {
  const card = $('questions-editor').querySelector(`.question-card[data-question-number="${index + 1}"]`);
  if (!card) return;
  const line = card.querySelector('.question-image-check');
  const summary = card.querySelector('.question-image-details > summary');
  const label = { exists: '이미지 연결 성공', missing: '이미지 파일 없음', unverified: '이미지 확인 불가', invalid: '이미지 주소 오류', none: '이미지 없음' }[status] || '이미지 확인 전';
  if (line) {line.dataset.kind=status;line.textContent=reason ? `${label} · ${reason}` : label;}
  if (summary) summary.textContent=status==='none'?'문제 이미지 추가 (선택 사항)':`문제 이미지 · ${label}`;
}
function imageAuditReport(scan) {
  const holder = $('image-check-results');
  holder.hidden = false; holder.replaceChildren();
  const {counts, checked, total, results} = scan;
  const strong = document.createElement('strong');
  strong.textContent = checked
    ? `이미지 검사 완료 · 연결 성공 ${counts.exists}개 / 파일 없음 ${counts.missing}개 / 확인 불가 ${counts.unverified}개 / 형식 오류 ${counts.invalid}개 / 이미지 없는 문제 ${counts.none}개`
    : `${total}문항 · 이미지 없는 문제 ${counts.none}개 (정상)`;
  holder.append(strong);
  const problemRows = results.filter(x => ['missing','unverified','invalid'].includes(x.status));
  if (problemRows.length) {
    const list = document.createElement('ul');list.className='image-check-list';
    for(const entry of problemRows.slice(0,60)) {
      const li=document.createElement('li');
      const kind=entry.status==='missing'?'파일 없음':entry.status==='invalid'?'주소 오류':'확인 불가';
      li.textContent=`${entry.index+1}번 · ${entry.input} — ${kind}${entry.reason?' ('+entry.reason+')':''}`;
      list.append(li);
    }
    holder.append(list);
    const note=document.createElement('p');note.className='helper';
    note.textContent='파일 없음은 GitHub 업로드·파일명·대소문자를 확인하세요. 확인 불가는 네트워크 문제일 수 있습니다. 이미지 누락 경고만으로 문제 저장을 막지는 않습니다.';
    holder.append(note);
  } else if(checked) {
    const note=document.createElement('p');note.className='helper';note.textContent='이미지가 지정된 문항의 공개 파일을 모두 확인했습니다. 이 검사 결과는 Firebase에 저장되지 않습니다.';holder.append(note);
  }
  for(const entry of results) setImageAuditLine(entry.index,entry.status,entry.reason);
}
async function auditImages() {
  const sequence=++imageAuditSeq;
  const snapshot=draftRows.map(row=>({line:row.line,imageUrl:row.imageUrl||''}));
  const holder=$('image-check-results'); holder.replaceChildren();
  holder.hidden=!snapshot.length;
  if (!snapshot.length) return;
  holder.textContent=snapshot.some(row=>row.imageUrl.trim())?'GitHub Pages의 이미지 파일을 확인하는 중입니다…':'이미지 없는 문제입니다. 확인할 파일이 없습니다.';
  $('check-images').disabled=true;
  try {
    const scan=await scanQuestionImages(snapshot,rootUrl);
    if(sequence!==imageAuditSeq)return;
    imageAuditReport(scan);
  } catch(error) {
    if(sequence!==imageAuditSeq)return;
    holder.textContent='이미지 검사 실패: '+error.message+' · 다시 확인 버튼을 이용하세요.';
  } finally {if(sequence===imageAuditSeq) refreshSaveState();}
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
    invalidateImageAudit();renderEditor(); const result=validateAndDisplay();
    const imageCount=draftRows.filter(row=>Boolean(row.imageUrl.trim())).length;
    text('editor-status',`${file.name} · ${encoding} · ${draftRows.length}문항 파싱 완료 · K열 이미지 ${imageCount}개 · 검증 오류 ${result.issues.length}개`,result.issues.length?'error':'success');
    void auditImages();
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
$('check-images').addEventListener('click',()=>{void auditImages();});
$('save-set').addEventListener('click',saveSet);
$('download-draft').addEventListener('click',()=>{
  const format=$('export-format').value === 'blooket'?'blooket':'purplekit';
  if(format==='blooket'&&!confirmImageLoss(draftRows))return;
  const basename=safeFileName($('set-title').value || 'quiz-v1-draft');
  downloadText(basename+(format==='blooket'?'_블루킷':'_퍼플킷')+'.csv',toCSV(draftRows,{format}),'text/csv;charset=utf-8');
});
$('sets-retry').addEventListener('click',listenSets);
$('rules-copy').addEventListener('click',async()=>{
  if(!user)return;
  try {await navigator.clipboard.writeText(makeRulesV4(user.uid));text('rules-status','v0~v4 통합 규칙을 복사했습니다. Firebase Realtime Database > 규칙에 붙여넣고 게시하세요. GitHub database.rules.json도 같은 내용으로 변경해야 합니다.','success');}
  catch(error){text('rules-status','복사에 실패했습니다. JSON 파일 다운로드를 이용하세요. '+error.message,'error');}
});
$('rules-download').addEventListener('click',()=>{if(user)downloadText('database.rules.json',makeRulesV4(user.uid),'application/json;charset=utf-8');});
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
