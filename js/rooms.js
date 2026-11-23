import { auth, db, isConfigured, formatError } from './firebase.js';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { ref, set, get, onValue, remove, update, runTransaction } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import { makeRulesV6 } from './rules-v6.js?v=6.0.0-alpha.6';
import { createAvatarImage } from './avatars.js';
import { buildRoomDeletionUpdates,canSafelyDeleteRoom,ROOM_MODE_PREFIX } from './room-bulk-delete.js?v=6.0.0-alpha.6';
import {APP_VERSION,APP_BUILD,checkPublishedVersion,checkRoomVersion,openFreshPage} from './version-guard.js?v=6.0.0-alpha.6';

const $ = id => document.getElementById(id);
const modeNames = {classic:'클래식',gold:'골드 퀘스트',fishing:'피싱 프렌지',racing:'레이싱'};
let teacher = null, authorized = false, hostRooms = {}, questionSets = {};
let unsubscribeHost = null, unsubscribeRoom = null, unsubscribeSets = null;
let selectedCode = '', currentRoom = null, creating = false, versionRulesReady = false;
const selectedRoomCodes = new Set();
let deletingRooms = false;
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
  const b = new Blob([makeRulesV6(teacher.uid)], {type:'application/json;charset=utf-8'});
  const url = URL.createObjectURL(b); const a = document.createElement('a');
  a.href = url; a.download = 'database.rules.json'; document.body.append(a); a.click(); a.remove();
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
function syncRoomBulkControls(){
  const valid = [...selectedRoomCodes].filter(code=>hostRooms[code]);
  for(const code of [...selectedRoomCodes])if(!hostRooms[code])selectedRoomCodes.delete(code);
  $('room-bulk-count').textContent=`${valid.length}개 선택`;
  $('room-bulk-delete').textContent=`선택한 방 삭제 (${valid.length})`;
  $('room-bulk-delete').disabled=deletingRooms||!authorized||!valid.length;
  $('room-bulk-clear').disabled=deletingRooms||!valid.length;
  $('room-bulk-select-closed').disabled=deletingRooms||!Object.keys(hostRooms).length;
}
function renderSavedRooms() {
  const entries = Object.entries(hostRooms).sort((a,b) => (b[1].createdAt||0) - (a[1].createdAt||0));
  $('room-saved-count').textContent = `${entries.length}개`;
  const list = $('room-saved-list'); list.replaceChildren();
  if (!entries.length) {const p = document.createElement('p'); p.className='empty-state';p.textContent='아직 만든 방이 없습니다.';list.append(p);syncRoomBulkControls();return;}
  for (const [code, record] of entries) {
    const row = document.createElement('div'); row.className='saved-set room-bulk-row';
    row.classList.toggle('room-bulk-selected',selectedRoomCodes.has(code));
    const selectLabel=document.createElement('label');selectLabel.className='room-bulk-check-label';
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.className='room-bulk-check';
    checkbox.checked=selectedRoomCodes.has(code);checkbox.disabled=deletingRooms;
    checkbox.setAttribute('aria-label',`${code}번 방 삭제 대상으로 선택`);
    checkbox.addEventListener('change',()=>{
      if(checkbox.checked)selectedRoomCodes.add(code);else selectedRoomCodes.delete(code);
      row.classList.toggle('room-bulk-selected',checkbox.checked);syncRoomBulkControls();
    });
    const sr=document.createElement('span');sr.className='room-bulk-visually-hidden';sr.textContent=`${code}번 방 선택`;
    selectLabel.append(checkbox,sr);
    const box = document.createElement('div');box.className='saved-description';
    const label = document.createElement('strong');label.textContent=`${code} · ${record.title || '테스트 방'}`;
    const created=Number(record.createdAt);
    const dateText=Number.isFinite(created)&&created>0?new Date(created).toLocaleString('ko-KR'):'생성 일시 미확인';
    const meta = document.createElement('span'); meta.className='helper';meta.textContent=`${stateText(record.state)} · ${dateText}`;
    const actions = document.createElement('div');actions.className='button-row';
    const button = document.createElement('button');button.type='button';button.className='btn btn-outline btn-small';button.textContent='방 열기';
    button.disabled=deletingRooms;
    button.addEventListener('click',()=>openRoom(code));actions.append(button);
    box.append(label,meta);row.append(selectLabel,box,actions);list.append(row);
  }
  syncRoomBulkControls();
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
    uid,name:value.profile.name,at:value.profile.joinedAt||0,avatarId:value.profile.avatarId||'',
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
    const num=createAvatarImage(item.avatarId,{size:'sm',decorative:true});
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
  $('room-meta-text').textContent=`${meta.title} · ${modeNames[meta.mode]||meta.mode} · ${meta.setTitle||'문제 미선택'} (${meta.mode==='classic'?'클래식':meta.mode==='gold'?'골드 퀘스트 v4':meta.mode==='fishing'?'피싱 프렌지 v5':'레이싱 v6 대기실'}) · ${meta.minClientVersion?'입장 최소 v'+meta.minClientVersion:'기존 호환 방'}`;
  $('room-toggle-lock').disabled = meta.state==='ended';
  $('room-toggle-lock').textContent = meta.state==='locked'?'입장 다시 허용':'입장 마감';
  $('room-end').disabled = meta.state==='ended';
  $('room-delete').disabled = meta.state!=='ended';
  renderMembers(record);
  $('room-gold-jump').hidden=meta.mode!=='gold';
  window.dispatchEvent(new CustomEvent('quizlab-room-meta',{detail:{code:selectedCode,meta}}));
}
function openRoom(code, knownMode="") {
  if (!authorized || !teacher || !/^\d{6}$/.test(code)) return;
  if (unsubscribeRoom) unsubscribeRoom();
  selectedCode=code;window.__purplekitOpenRoomCode=code;localStorage.setItem(LAST_ROOM_KEY,code);
  window.dispatchEvent(new CustomEvent('quizlab-room-open',{detail:{code,mode:knownMode||hostRooms[code]?.mode||''}}));
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
  if(!versionRulesReady){creating=false;$('room-create').disabled=false;info('room-create-message','v4.12 Firebase 통합 보안 규칙을 게시한 뒤 권한 다시 확인을 눌러 주세요.','error');return;}
  if(!['classic','gold','fishing','racing'].includes(mode)){creating=false;$('room-create').disabled=false;info('room-create-message','선택한 게임 모드는 아직 개발 중입니다.','error');return;}
  if(['gold','fishing','racing'].includes(mode)&&!setId){creating=false;$('room-create').disabled=false;info('room-create-message','선택한 게임에 사용할 문제 세트를 먼저 선택해 주세요.','error');return;}
  try {
    if(mode==='fishing'){
      try{await get(ref(db,'v5/versionCheck'));}
      catch{throw new Error('피싱 프렌지를 이용하려면 먼저 v5 전체 통합 보안 규칙을 Firebase에 게시해 주세요.');}
    }
    if(mode==='racing'){
      try{await get(ref(db,'v6/versionCheck'));}
      catch{throw new Error('v6 통합 규칙이 확인되지 않았습니다. Firebase 규칙에 v6 경로를 게시했는지 확인해 주세요.');}
    }
    const published=await checkPublishedVersion();
    const versionReport=checkRoomVersion(null,published);
    if(!versionReport.ok)throw new Error(`현재 v${APP_VERSION}은(는) 최신 v${published.version}보다 오래됐습니다. 교사 화면을 새로고침해 주세요.`);
    info('room-create-message','사용할 수 있는 6자리 코드를 생성하고 있습니다.');
    for (let attempt=0;attempt<12;attempt++) {
      const bytes=new Uint32Array(1);crypto.getRandomValues(bytes);
      const code=String(100000+(bytes[0]%900000));
      const now=Date.now();
      const meta={hostUid:teacher.uid,createdAt:now,state:'lobby',title,mode,target,setId,setTitle:setId?(questionSets[setId]?.title||'문제 세트'): '문제 미선택',minClientBuild:APP_BUILD,minClientVersion:APP_VERSION};
      const result=await runTransaction(ref(db,`v2/rooms/${code}`),current=>current === null?{meta}:undefined,{applyLocally:false});
      if (!result.committed) continue;
      try{
        if(mode==='racing')await set(ref(db,`v6/public/${code}`),{state:'lobby',finishMeters:20});
        await set(ref(db,`v2/hostRooms/${teacher.uid}/${code}`),{createdAt:now,title,state:'lobby'});
      }catch(error){
        if(mode==='racing')await remove(ref(db,`v6/public/${code}`)).catch(()=>{});
        await remove(ref(db,`v2/rooms/${code}`)).catch(()=>{});
        throw error;
      }
      openRoom(code,mode);
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
function describeRoom(code){
  return `${code} · ${hostRooms[code]?.title||'게임 방'}`;
}
async function inspectRoomForDeletion(code) {
  // Always re-check the server, not the cached room list, just before deleting.
  const room=(await get(ref(db,`v2/rooms/${code}`))).val();
  if(!room?.meta)return {code,room:null,allowed:true,orphan:true};
  if(room.meta.hostUid!==teacher?.uid)return {code,allowed:false,reason:'다른 교사의 방입니다.'};
  const prefix=ROOM_MODE_PREFIX[room.meta.mode];
  if(!prefix)return {code,allowed:false,reason:'지원되지 않는 게임 유형입니다.'};
  const gameState=(await get(ref(db,`${prefix}/public/${code}/state`))).val()||'';
  const decision=canSafelyDeleteRoom(room,gameState);
  return {code,room,allowed:decision.ok,reason:decision.reason,gameState};
}
async function deleteRoomCodes(codes) {
  if(!authorized||!teacher||deletingRooms)return;
  const unique=[...new Set(codes)].filter(code=>/^\d{6}$/.test(code)&&hostRooms[code]);
  if(!unique.length)return;
  deletingRooms=true;renderSavedRooms();
  const status=(message,kind='')=>info('room-bulk-message',message,kind);
  let deleted=0,blocked=[],failed=[];
  try {
    status(`선택한 ${unique.length}개 방의 현재 진행 상태를 확인하고 있습니다…`);
    const checks=[];
    for(const code of unique){
      try{checks.push(await inspectRoomForDeletion(code));}
      catch(err){blocked.push(`${describeRoom(code)} (${formatError(err)})`);}
    }
    const eligible=checks.filter(x=>x.allowed);
    blocked.push(...checks.filter(x=>!x.allowed).map(x=>`${describeRoom(x.code)} (${x.reason})`));
    if(!eligible.length){status(`삭제 가능한 방이 없습니다. ${blocked.slice(0,3).join(' / ')}`,'error');return;}
    const example=eligible.slice(0,5).map(x=>describeRoom(x.code)).join('\n');
    const more=eligible.length>5?`\n외 ${eligible.length-5}개 방`:'';
    const warning=blocked.length?`\n\n진행 중이거나 접속 중인 ${blocked.length}개 방은 삭제하지 않습니다.`:'';
    if(!confirm(`다음 ${eligible.length}개 방을 영구 삭제할까요?\n\n${example}${more}\n\n학생 명단, 점수, 답안, 문제별 기록도 복구할 수 없게 삭제됩니다.\n결과 CSV가 필요하면 취소하고 먼저 저장해 주세요.${warning}`)){
      status('삭제를 취소했습니다. 선택 상태는 유지됩니다.');return;
    }
    for(const [i,item] of eligible.entries()){
      const {code}=item;
      status(`삭제 진행 ${i+1}/${eligible.length} · ${code}번 방…`);
      try {
        const latest=await inspectRoomForDeletion(code);
        if(!latest.allowed){blocked.push(`${describeRoom(code)} (${latest.reason})`);continue;}
        const changes=latest.orphan
          ?{[`v2/hostRooms/${teacher.uid}/${code}`]:null}
          :buildRoomDeletionUpdates(teacher.uid,code,latest.room.meta.mode);
        // One atomic multi-path update per room: an error never leaves half of
        // that room's data deleted. Separate rooms may succeed independently.
        await update(ref(db),changes);
        selectedRoomCodes.delete(code);
        deleted++;
        if(selectedCode===code){
          if(unsubscribeRoom){unsubscribeRoom();unsubscribeRoom=null;}
          selectedCode='';currentRoom=null;$('room-detail').hidden=true;
          window.dispatchEvent(new CustomEvent('quizlab-room-open',{detail:{code:''}}));
        }
        if(localStorage.getItem(LAST_ROOM_KEY)===code)localStorage.removeItem(LAST_ROOM_KEY);
      }catch(err){failed.push(`${describeRoom(code)} (${formatError(err)})`);}
    }
    if(deleted){status(`${deleted}개 방의 대기실 및 게임 기록을 삭제했습니다.`, 'success');}
    if(blocked.length||failed.length){
      status(`삭제 ${deleted}개 완료 · 제외 ${blocked.length}개 · 실패 ${failed.length}개. ${[...blocked,...failed].slice(0,3).join(' / ')}${failed.length?' · 클래식 방 삭제 권한 오류라면 Firebase v5.0.11 통합 규칙 게시 여부를 확인해 주세요.':''}`,'error');
    }
  }catch(err){status(`삭제 확인 중 오류: ${formatError(err)}`,'error');}
  finally {deletingRooms=false;renderSavedRooms();}
}
async function deleteRoom() {
  if(!authorized||!selectedCode||currentRoom?.meta?.state!=='ended')return;
  await deleteRoomCodes([selectedCode]);
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
  try{
    await get(ref(db,'v4/clientVersionCheck'));
    versionRulesReady=true;
    $('room-version-rules-warning').hidden=true;
  }catch(_){
    versionRulesReady=false;
    $('room-version-rules-warning').hidden=false;
    info('room-auth-message','기존 방 조회는 가능하지만 새 방 생성에는 v4.12 통합 규칙이 필요합니다.','error');
  }
  unsubscribeHost=onValue(ref(db,`v2/hostRooms/${teacher.uid}`),snap=>{
    setAuthorized(true);authBadge('교사 권한 확인','success');
    info('room-auth-message',versionRulesReady?'v4.12 게임 방 생성·버전 검사 권한을 확인했습니다.':'기존 방은 사용 가능하지만 v4.12 규칙 갱신 전에는 새 방을 만들 수 없습니다.',versionRulesReady?'success':'error');
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
  stopListeners();setAuthorized(false);versionRulesReady=false;hostRooms={};selectedCode='';currentRoom=null;
  $('room-detail').hidden=true;selectedRoomCodes.clear();renderSavedRooms();
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
  $('room-version-refresh').addEventListener('click',()=>openFreshPage());
  $('avatar-copy-rules').addEventListener('click',async()=>{
    if(!teacher){info('avatar-rules-message','교사 Google 계정으로 로그인한 다음 다시 눌러 주세요.','error');return;}
    try{
      const ok=await copyText(makeRulesV6(teacher.uid));
      info('avatar-rules-message',ok
        ?'v6 전체 규칙을 복사했습니다. Firebase Realtime Database → 규칙에 붙여넣고 게시하세요.'
        :'자동 복사에 실패했습니다. 아래 기존 「규칙 JSON 다운로드」 기능을 이용하거나 브라우저 클립보드 권한을 확인해 주세요.',
        ok?'success':'error');
    }catch(error){info('avatar-rules-message',formatError(error),'error');}
  });
  $('room-copy-rules').addEventListener('click',async()=>{
    if(!teacher)return;
    const ok=await copyText(makeRulesV6(teacher.uid));
    info('room-rules-status',ok?'전체 v0~v6 통합 규칙을 복사했습니다. Firebase와 GitHub에 같은 내용을 게시하세요.':'자동 복사에 실패했습니다. JSON 다운로드 버튼을 이용하세요.',ok?'success':'error');
  });
  $('room-download-rules').addEventListener('click',downloadRules);
  $('room-create').addEventListener('click',createRoom);
  $('room-copy-code').addEventListener('click',async()=>info('room-live-message',(await copyText(selectedCode))?'참여 코드를 복사했습니다.':'클립보드 복사에 실패했습니다. 코드를 직접 복사해 주세요.'));
  $('room-copy-link').addEventListener('click',async()=>info('room-live-message',(await copyText(joinLink(selectedCode)))?'학생 참여 링크를 복사했습니다.':'클립보드 복사에 실패했습니다.'));
  $('room-toggle-lock').addEventListener('click',()=>changeRoomState(currentRoom?.meta?.state==='locked'?'lobby':'locked'));
  $('room-end').addEventListener('click',()=>{if(confirm('게임 방을 종료할까요? v2에는 점수 기록이 없습니다.'))changeRoomState('ended');});
  $('room-delete').addEventListener('click',deleteRoom);
  $('room-bulk-select-closed').addEventListener('click',()=>{
    for(const [code,r] of Object.entries(hostRooms))if(['locked','ended'].includes(r.state))selectedRoomCodes.add(code);
    renderSavedRooms();
    info('room-bulk-message','입장 마감·종료된 방을 선택했습니다. 실제 진행 중인 방은 삭제 직전에 다시 검사하여 제외합니다.');
  });
  $('room-bulk-clear').addEventListener('click',()=>{selectedRoomCodes.clear();renderSavedRooms();info('room-bulk-message','선택을 해제했습니다.');});
  $('room-bulk-delete').addEventListener('click',()=>void deleteRoomCodes([...selectedRoomCodes]));
  onAuthStateChanged(auth,handleAuth,err=>info('room-auth-message',formatError(err),'error'));
}
