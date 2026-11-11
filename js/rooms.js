import { auth, db, isConfigured, formatError } from './firebase.js';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { ref, set, get, onValue, remove, update, runTransaction } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import { makeRulesV2 } from './rules-v2.js';

const $ = id => document.getElementById(id);
const modeNames = {classic:'클래식',gold:'골드 퀘스트',fishing:'피싱 프렌지',racing:'레이싱'};
let teacher = null, authorized = false, hostRooms = {}, questionSets = {};
let unsubscribeHost = null, unsubscribeRoom = null, unsubscribeSets = null;
let selectedCode = '', currentRoom = null, creating = false;
const LAST_ROOM_KEY = 'quizlab-v2-last-host-room';
function info(id, message, kind = '') { $(id).textContent = message; $(id).dataset.kind = kind; }
function authBadge(message, kind = 'neutral') { $('room-auth-badge').textContent = message; $('room-auth-badge').className = `pill pill-${kind}`; }
function stateText(state) {return ({lobby:'입장 가능',locked:'입장 마감',ended:'종료됨'})[state] || '상태 확인 중';}
function clean(text, fallback = '') { return String(text || '').trim() || fallback; }
function joinLink(code) {return new URL(`join.html?code=${encodeURIComponent(code)}`, location.href).href;}
async function copyText(value) {
  try { await navigator.clipboard.writeText(value); return true; }
  catch (_) {return false;}
}
function downloadRules() {
  if (!teacher) return;
  const b = new Blob([makeRulesV2(teacher.uid)], {type:'application/json;charset=utf-8'});
  const url = URL.createObjectURL(b); const a = document.createElement('a');
  a.href = url; a.download = 'database.rules.v2-1.json'; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function stopListeners() {
  for (const fn of [unsubscribeHost, unsubscribeRoom, unsubscribeSets]) if (fn) fn();
  unsubscribeHost = null; unsubscribeRoom = null; unsubscribeSets = null;
}
function setAuthorized(next) {
  authorized = next;
  $('room-workspace').classList.toggle('workspace-locked', !next);
  $('room-workspace').setAttribute('aria-disabled', String(!next));
}
function renderSavedRooms() {
  const entries = Object.entries(hostRooms).sort((a,b) => (b[1].createdAt||0) - (a[1].createdAt||0));
  $('room-saved-count').textContent = `${entries.length}개`;
  const list = $('room-saved-list'); list.replaceChildren();
  if (!entries.length) {const p = document.createElement('p'); p.className='empty-state';p.textContent='아직 만든 방이 없습니다.';list.append(p);return;}
  for (const [code, record] of entries) {
    const row = document.createElement('div'); row.className='saved-set';
    const box = document.createElement('div');box.className='saved-description';
    const label = document.createElement('strong');label.textContent=`${code} · ${record.title || '테스트 방'}`;
    const meta = document.createElement('span'); meta.className='helper';meta.textContent=`${stateText(record.state)} · ${new Date(record.createdAt).toLocaleString('ko-KR')}`;
    const actions = document.createElement('div');actions.className='button-row';
    const button = document.createElement('button');button.className='btn btn-outline btn-small';button.textContent='방 열기';
    button.addEventListener('click',()=>openRoom(code));actions.append(button);box.append(label,meta);row.append(box,actions);list.append(row);
  }
}
function renderSetOptions() {
  const select = $('room-set');const oldValue = select.value;select.replaceChildren();
  const none = document.createElement('option');none.value='';none.textContent='연결 시험용 — 문제 선택 안 함';select.append(none);
  Object.entries(questionSets).sort((a,b)=> (b[1]?.updatedAt||0)-(a[1]?.updatedAt||0)).forEach(([id,s])=>{
    const option = document.createElement('option'); option.value=id;option.textContent=`${s.title || '제목 없음'} (${Object.keys(s.questions||{}).length}문항)`;select.append(option);
  });
  if ([...select.options].some(o=>o.value===oldValue)) select.value=oldValue;
}
function makeQR(link) {
  const output=$('room-qr-output');output.replaceChildren();
  if (typeof window.qrcode !== 'function') {output.textContent='QR 이미지 생성 모듈을 불러오지 못했습니다. 참여 링크 복사를 사용해 주세요.';return;}
  try {
    const qr=window.qrcode(0,'M');qr.addData(link);qr.make();
    const image=document.createElement('img');image.src=qr.createDataURL(5,5);image.alt='이 방의 학생 참여용 QR 코드'; image.width=205;image.height=205;
    output.append(image);
  } catch (error) {output.textContent='QR 생성에 실패했습니다. 참여 링크를 복사해 주세요.';}
}
async function releaseOfflineName(uid,name){
  if(!authorized||!selectedCode||!currentRoom||currentRoom.meta?.state==='ended')return;
  const member=currentRoom.members?.[uid];
  if(Object.keys(member?.connections||{}).length>0){info('room-live-message','접속 중인 참가자의 이름은 해제할 수 없습니다.','error');return;}
  const claimOwner=currentRoom.nameClaims?.[name];
  if(claimOwner&&claimOwner!==uid){info('room-live-message','이름 소유자가 변경됐습니다. 다시 확인해 주세요.','error');return;}
  if(!confirm(`오프라인 학생 '${name}'의 이름 예약을 해제할까요? 해당 기기에서 다시 참여하려면 재입장해야 합니다.`))return;
  try{
    const paths={[`members/${uid}`]:null};
    if(claimOwner===uid)paths[`nameClaims/${name}`]=null;
    await update(ref(db,`v2/rooms/${selectedCode}`),paths);
    info('room-live-message',`'${name}'의 오프라인 예약을 해제했습니다.`,'success');
  }catch(err){info('room-live-message',`이름 해제 실패: ${formatError(err)}`,'error');}
}
function renderMembers(record) {
  const members=record?.members||{};
  const all=Object.entries(members).filter(([,v])=>v?.profile?.name).map(([uid,value])=>({
    uid,name:value.profile.name,at:value.profile.joinedAt||0,
    sessions:Object.keys(value.connections||{}).length
  })).sort((a,b)=>a.at-b.at);
  const online=all.filter(x=>x.sessions>0);
  const activeClaims=record?.nameClaims||{};
  const orphanClaims=Object.entries(activeClaims).filter(([name,uid])=>members[uid]?.profile?.name!==name).map(([name,uid])=>({uid,name,sessions:0,at:0,orphan:true}));
  const offline=[...all.filter(x=>x.sessions===0),...orphanClaims];
  const target=Number(record?.meta?.target)||25;
  $('room-member-count').textContent=`${online.length} / ${target}명`;
  info('room-live-message', `현재 접속 ${online.length}명 · 총 ${online.reduce((n,v)=>n+v.sessions,0)}개 세션 · 오프라인 이름 ${offline.length}개 · ${stateText(record?.meta?.state)}`,'success');
  const list=$('room-members');list.replaceChildren();
  if(!online.length){const div=document.createElement('div');div.className='empty-state';div.textContent='현재 접속 중인 학생이 없습니다.';list.append(div);}
  online.forEach((item,i)=>{
    const el=document.createElement('div');el.className='student-item';
    const num=document.createElement('span');num.className='student-avatar';num.textContent=String(i+1);
    const name=document.createElement('span');name.textContent=item.name;
    const more=document.createElement('small');more.textContent=item.sessions>1?`(${item.sessions}개 창)`:'';
    el.append(num,name,more);list.append(el);
  });
  // 이전 기기에서 나간 학생은 재접속을 위해 이름을 유지합니다. 교사가 오프라인인 경우에만 해제할 수 있습니다.
  if(offline.length){
    const title=document.createElement('div');title.className='helper';title.style.gridColumn='1/-1';
    title.textContent=`오프라인 · 이름 예약 ${offline.length}개 (기기 변경 시 교사가 해제)`;list.append(title);
    offline.forEach(item=>{
      const el=document.createElement('div');el.className='student-item';
      const text=document.createElement('span');text.textContent=`${item.name} · 오프라인`;
      const btn=document.createElement('button');btn.type='button';btn.className='btn btn-outline btn-small';btn.textContent='이름 해제';
      btn.disabled=record?.meta?.state==='ended';btn.addEventListener('click',()=>releaseOfflineName(item.uid,item.name));
      el.append(text,btn);list.append(el);
    });
  }
}

function renderRoom(record) {
  currentRoom=record;
  const meta=record?.meta;
  if(!meta) {info('room-live-message','방 기록이 삭제되었거나 존재하지 않습니다.','error');$('room-detail').hidden=true;return;}
  $('room-code').textContent=selectedCode;
  $('room-state').textContent=stateText(meta.state);
  $('room-state').className=`pill pill-${meta.state==='ended'?'error':meta.state==='lobby'?'success':'neutral'}`;
  $('room-meta-text').textContent=`${meta.title} · ${modeNames[meta.mode]||meta.mode} · ${meta.setTitle||'문제 미선택'} (${meta.mode==='classic'&&meta.setId?'v3.1 클래식':'v2 대기실'})`;
  $('room-toggle-lock').disabled = meta.state==='ended';
  $('room-toggle-lock').textContent = meta.state==='locked'?'입장 다시 허용':'입장 마감';
  $('room-end').disabled = meta.state==='ended';
  $('room-delete').disabled = meta.state!=='ended';
  renderMembers(record);
}
function openRoom(code) {
  if (!authorized || !teacher || !/^\d{6}$/.test(code)) return;
  if (unsubscribeRoom) unsubscribeRoom();
  selectedCode=code;localStorage.setItem(LAST_ROOM_KEY,code);
  window.dispatchEvent(new CustomEvent('quizlab-room-open',{detail:{code}}));
  $('room-detail').hidden=false;$('room-code').textContent=code;
  makeQR(joinLink(code));
  unsubscribeRoom=onValue(ref(db,`v2/rooms/${code}`),snapshot=>renderRoom(snapshot.val()),error=>{
    info('room-live-message',`실시간 방 조회 실패: ${formatError(error)}`,'error');
  });
}
async function createRoom() {
  if (!teacher || !authorized || creating) return;
  const title=clean($('new-room-title').value);if(!title||title.length>80) {info('room-create-message','방 이름을 1~80자로 입력해 주세요.','error');return;}
  const target=Number($('room-target').value);if(!Number.isInteger(target)||target<1||target>200){info('room-create-message','운영 인원 기준을 1~200명으로 입력해 주세요.','error');return;}
  creating=true;$('room-create').disabled=true;
  const mode=$('room-mode').value,setId=$('room-set').value;
  try {
    info('room-create-message','사용할 수 있는 6자리 코드를 생성하고 있습니다.');
    for (let attempt=0;attempt<12;attempt++) {
      const bytes=new Uint32Array(1);crypto.getRandomValues(bytes);
      const code=String(100000+(bytes[0]%900000));
      const now=Date.now();
      const meta={hostUid:teacher.uid,createdAt:now,state:'lobby',title,mode,target,setId,setTitle:setId?(questionSets[setId]?.title||'문제 세트'): '문제 미선택'};
      const result=await runTransaction(ref(db,`v2/rooms/${code}`),current=>current === null?{meta}:undefined,{applyLocally:false});
      if (!result.committed) continue;
      await set(ref(db,`v2/hostRooms/${teacher.uid}/${code}`),{createdAt:now,title,state:'lobby'});
      openRoom(code);
      info('room-create-message',`방을 만들었습니다. 참여 코드: ${code}`,'success');return;
    }
    throw new Error('참여 코드가 중복되었습니다. 다시 시도해 주세요.');
  } catch (error) {info('room-create-message',`방 생성 실패: ${formatError(error)}`,'error');}
  finally {creating=false;$('room-create').disabled=false;}
}
async function changeRoomState(next) {
  if(!authorized||!selectedCode||!currentRoom?.meta)return;
  try {
    await update(ref(db,`v2/rooms/${selectedCode}/meta`),{state:next,...(next==='ended'?{endedAt:Date.now()}:{})});
    await update(ref(db,`v2/hostRooms/${teacher.uid}/${selectedCode}`),{state:next});
  }catch(error){info('room-live-message',`방 상태 변경 실패: ${formatError(error)}`,'error');}
}
async function deleteRoom() {
  if(!authorized||!selectedCode||currentRoom?.meta?.state!=='ended')return;
  if(!confirm(`종료한 ${selectedCode}번 방을 완전히 삭제할까요? 대기실 테스트 기록이 사라집니다.`))return;
  const code=selectedCode;
  try {
    await remove(ref(db,`v2/rooms/${code}`));await remove(ref(db,`v2/hostRooms/${teacher.uid}/${code}`));
    if(unsubscribeRoom){unsubscribeRoom();unsubscribeRoom=null;}
    selectedCode='';currentRoom=null;$('room-detail').hidden=true;localStorage.removeItem(LAST_ROOM_KEY);window.dispatchEvent(new CustomEvent('quizlab-room-open',{detail:{code:''}}));
    info('room-create-message','종료한 게임 방 기록을 삭제했습니다.','success');
  }catch(error){info('room-live-message',formatError(error),'error');}
}
async function startListeners() {
  if(!teacher)return;
  if(unsubscribeHost){unsubscribeHost();unsubscribeHost=null;}
  const checkingUid=teacher.uid;
  $('room-retry').disabled=true;
  authBadge('v2.1 권한 확인 중');
  try {
    // 기존 v2 규칙만 있으면 호스트 목록은 읽히지만 이름 선점은 실패합니다.
    // v2.1 신규 경로를 확인해 새 규칙 게시 여부를 명확히 판별합니다.
    await get(ref(db,'v2/versionCheck'));
  } catch(err) {
    if(teacher?.uid!==checkingUid)return;
    setAuthorized(false);authBadge('v2.1 규칙 필요','error');
    $('room-rules-guide').hidden=false;$('room-retry').disabled=false;
    info('room-auth-message','기존 v2 규칙이 적용된 상태입니다. v2.1 전체 규칙을 Firebase와 GitHub에 게시해 주세요.','error');
    return;
  }
  if(teacher?.uid!==checkingUid)return;
  unsubscribeHost=onValue(ref(db,`v2/hostRooms/${teacher.uid}`),snap=>{
    setAuthorized(true);authBadge('교사 권한 확인','success');
    info('room-auth-message','v2.1 게임 방 읽기·쓰기 권한을 확인했습니다.','success');
    $('room-rules-guide').hidden=true;$('room-retry').disabled=false;
    hostRooms=snap.val()||{};renderSavedRooms();
    const last=localStorage.getItem(LAST_ROOM_KEY);
    if(last && hostRooms[last] && selectedCode!==last) openRoom(last);
    if(!unsubscribeSets){unsubscribeSets=onValue(ref(db,'v1/questionSets'),snap=>{
      questionSets=snap.val()||{};renderSetOptions();
    },err=>{info('room-create-message','문제 세트 목록 읽기 실패: '+formatError(err),'error');});}
  },err=>{
    setAuthorized(false);authBadge('v2 규칙 필요','error');
    $('room-rules-guide').hidden=false;$('room-retry').disabled=false;
    info('room-auth-message',`v2 데이터 권한이 없습니다. 전체 규칙을 적용해 주세요. (${formatError(err)})`,'error');
  });
}
function handleAuth(user) {
  stopListeners();setAuthorized(false);hostRooms={};selectedCode='';currentRoom=null;
  $('room-detail').hidden=true;renderSavedRooms();
  teacher=user?.providerData?.some(x=>x.providerId==='google.com')?user:null;
  $('room-login').hidden=Boolean(teacher);$('room-logout').hidden=!teacher;$('room-retry').hidden=!teacher;
  $('room-rules-guide').hidden=true;
  if (!teacher) {authBadge('로그인 필요');info('room-auth-message','교사 Google 계정으로 로그인해 주세요.');return;}
  authBadge('권한 확인 중');info('room-auth-message','Google 로그인이 확인되었습니다. v2 보안 규칙을 확인합니다.');
  startListeners();
}
if(!isConfigured){authBadge('Firebase 설정 필요','error');info('room-auth-message','Firebase 구성값을 먼저 설정해 주세요.','error');}
else {
  $('room-login').disabled=false;
  $('room-login').addEventListener('click',async()=>{try{await signInWithPopup(auth,new GoogleAuthProvider());}catch(err){info('room-auth-message',formatError(err),'error');}});
  $('room-logout').addEventListener('click',()=>signOut(auth).catch(err=>info('room-auth-message',formatError(err),'error')));
  $('room-retry').addEventListener('click',startListeners);
  $('room-copy-rules').addEventListener('click',async()=>{
    if(!teacher)return;
    const ok=await copyText(makeRulesV2(teacher.uid));
    info('room-rules-status',ok?'전체 v0+v1+v2.1 규칙을 복사했습니다. Firebase와 GitHub에 같은 내용을 게시하세요.':'자동 복사에 실패했습니다. JSON 다운로드 버튼을 이용하세요.',ok?'success':'error');
  });
  $('room-download-rules').addEventListener('click',downloadRules);
  $('room-create').addEventListener('click',createRoom);
  $('room-copy-code').addEventListener('click',async()=>info('room-live-message',(await copyText(selectedCode))?'참여 코드를 복사했습니다.':'클립보드 복사에 실패했습니다. 코드를 직접 복사해 주세요.'));
  $('room-copy-link').addEventListener('click',async()=>info('room-live-message',(await copyText(joinLink(selectedCode)))?'학생 참여 링크를 복사했습니다.':'클립보드 복사에 실패했습니다.'));
  $('room-toggle-lock').addEventListener('click',()=>changeRoomState(currentRoom?.meta?.state==='locked'?'lobby':'locked'));
  $('room-end').addEventListener('click',()=>{if(confirm('게임 방을 종료할까요? v2에는 점수 기록이 없습니다.'))changeRoomState('ended');});
  $('room-delete').addEventListener('click',deleteRoom);
  onAuthStateChanged(auth,handleAuth,err=>info('room-auth-message',formatError(err),'error'));
}
