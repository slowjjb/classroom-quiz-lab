import { startQuizView, stopQuizView } from './classic-student.js';
import { auth, db, isConfigured, formatError } from './firebase.js';
import { normalizeStudentName as normalizeName } from './names.js';
import { browserLocalPersistence, setPersistence, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { ref, get, set, remove, onValue, onDisconnect, push, serverTimestamp, runTransaction } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';

const $ = id => document.getElementById(id);
const NAME_KEY='quizlab-v2-display-name', SESSION_KEY='quizlab-v2-active-room';
const params=new URLSearchParams(location.search);
let activeCode='', activeUser=null, sessionRef=null, unsubRoom=null, unsubConnection=null, joining=false, active=false, ended=false;
const savedName=localStorage.getItem(NAME_KEY); if(savedName)$('join-name').value=savedName;
const fromUrl=params.get('code')||'';if(/^\d{6}$/.test(fromUrl))$('join-code').value=fromUrl;
function feedback(value,kind=''){$('join-feedback').textContent=value;$('join-feedback').dataset.kind=kind;}
function onlineStatus(value,ok=false){$('join-connection').textContent=value;$('join-dot').classList.toggle('connected',ok);}
function roomStatus(value){$('student-room-state').textContent=({lobby:'입장 가능',locked:'입장 마감',ended:'방 종료'})[value]||'상태 확인 중';}

function setActive(flag){active=flag;$('join-room-btn').hidden=flag;$('leave-room-btn').hidden=!flag;$('join-code').disabled=flag;$('join-name').disabled=flag;$('student-room').hidden=!flag;}
async function stopPresence() {
  if(unsubConnection){unsubConnection();unsubConnection=null;}
  const old=sessionRef;sessionRef=null;
  if(old){try{await remove(old);await onDisconnect(old).cancel();}catch(_){/* 서버가 연결 종료 시 정리합니다. */}}
}
async function leaveRoom(showMessage=true){
  sessionStorage.removeItem(SESSION_KEY);
  stopQuizView();
  if(unsubRoom){unsubRoom();unsubRoom=null;}
  setActive(false);ended=false;
  await stopPresence();activeCode='';activeUser=null;
  onlineStatus('방에서 나왔습니다.');
  if(showMessage)feedback('대기실에서 나왔습니다. 이름은 재접속을 위해 보존됩니다.');
}
function renderRoom(data){
  if(!active)return;
  const meta=data?.meta;
  if(!meta){feedback('방이 삭제되거나 존재하지 않습니다. 다시 참여해 주세요.','error');leaveRoom(false);return;}
  $('student-room-title').textContent=meta.title||'퀴즈 대기실';roomStatus(meta.state);
  $('student-room-meta').textContent=`참여 코드 ${activeCode} · ${meta.setTitle||'문제 미선택'} · 게임을 시작하면 아래에 문제가 나타납니다.`;
  if(meta.state==='ended'&&!ended){
    ended=true;feedback('선생님이 방을 종료했습니다. 대기실 나가기를 눌러 주세요.');stopPresence();onlineStatus('방이 종료되었습니다.');
  }
  const members=Object.values(data.members||{}).filter(x=>Object.keys(x?.connections||{}).length>0).map(x=>x.profile?.name||'이름 없음');
  $('join-count').textContent=`${members.length}명`;
  const list=$('join-members');list.replaceChildren();
  if(!members.length){const p=document.createElement('div');p.className='empty-state';p.textContent='접속 중인 친구가 없습니다.';list.append(p);return;}
  members.forEach((name,i)=>{const el=document.createElement('div');el.className='student-item';
    const n=document.createElement('span');n.className='student-avatar';n.textContent=String(i+1);
    const t=document.createElement('span');t.textContent=name;el.append(n,t);list.append(el);});
}
function watchConnection(uid,name){
  if(unsubConnection)unsubConnection();
  unsubConnection=onValue(ref(db,'.info/connected'),async snap=>{
    if(!active||activeUser?.uid!==uid||ended)return;
    if(snap.val()!==true){sessionRef=null;onlineStatus('인터넷 연결이 끊어졌습니다.');feedback('연결 복구 후 자동으로 대기실에 다시 참여합니다.');return;}
    const path=push(ref(db,`v2/rooms/${activeCode}/members/${uid}/connections`));
    try{
      await onDisconnect(path).remove(); // 연결이 끊기면 서버가 세션을 제거합니다.
      await set(path,serverTimestamp());
      if(!active||activeUser?.uid!==uid||ended){await remove(path);return;}
      sessionRef=path;onlineStatus('실시간 연결 성공',true);
      feedback(`'${name}'님, 대기실에 입장했습니다!`,'success');
    }catch(err){try{await onDisconnect(path).cancel();}catch(_){}
      onlineStatus('입장 연결 실패');feedback(`접속 기록 저장 실패: ${formatError(err)}`,'error');}
  },err=>feedback(formatError(err),'error'));
}
async function reserveName(code,name,uid){
  // runTransaction은 서버에서 충돌을 해결합니다. 동시에 같은 이름을 신청해도 한 UID만 성공합니다.
  const claimRef=ref(db,`v2/rooms/${code}/nameClaims/${name}`);
  const result=await runTransaction(claimRef,current=>{
    if(current===null||current===uid)return uid;
    return undefined;
  },{applyLocally:false});
  if(!result.committed)throw new Error(`'${name}'은(는) 이미 다른 학생이 사용 중입니다. 다른 이름을 입력해 주세요.`);
  return claimRef;
}
async function releaseOrphanClaim(claimRef,profileRef){
  // 이름 선점은 성공했지만 프로필 저장은 실패한 경우에만 고아 선점을 정리합니다.
  try{if(!(await get(profileRef)).exists())await remove(claimRef);}catch(_){/* 후속 재접속 시 복구 또는 교사가 정리 가능 */}
}
async function joinRoom(automatic=false){
  if(!isConfigured||joining||active)return;
  joining=true;$('join-room-btn').disabled=true;
  const code=$('join-code').value.trim(),inputName=$('join-name').value.trim();
  try{
    if(!/^\d{6}$/.test(code))throw new Error('참여 코드를 숫자 6자리로 입력해 주세요.');
    const requestedName=normalizeName(inputName);
    feedback('방과 이름 중복을 확인하고 있습니다…');
    await setPersistence(auth,browserLocalPersistence);
    if(auth.currentUser&&!auth.currentUser.isAnonymous)throw new Error('교사 계정이 로그인되어 있습니다. 학생용 시크릿 창을 사용해 주세요.');
    const user=auth.currentUser||(await signInAnonymously(auth)).user;
    const metaSnap=await get(ref(db,`v2/rooms/${code}/meta`));
    if(!metaSnap.exists())throw new Error('해당 참여 코드의 게임 방이 없습니다.');
    const meta=metaSnap.val();
    if(meta.state==='ended')throw new Error('이미 종료된 게임 방입니다.');
    const profileRef=ref(db,`v2/rooms/${code}/members/${user.uid}/profile`);
    const profileSnap=await get(profileRef);
    if(meta.state!=='lobby'&&!profileSnap.exists())throw new Error('입장이 마감된 방입니다.');
    // 이미 가입한 익명 UID는 예전 이름으로만 복귀합니다. 닉네임 변경으로 선점을 우회할 수 없습니다.
    const displayName=profileSnap.exists()?normalizeName(profileSnap.val().name):requestedName;
    let claimRef=null;
    try{
      claimRef=await reserveName(code,displayName,user.uid);
      if(!profileSnap.exists()){
        if(meta.state!=='lobby')throw new Error('입장이 마감된 방입니다.');
        await set(profileRef,{name:displayName,joinedAt:Date.now()});
      }
    }catch(error){
      if(claimRef)await releaseOrphanClaim(claimRef,profileRef);
      throw error;
    }
    localStorage.setItem(NAME_KEY,displayName);$('join-name').value=displayName;
    sessionStorage.setItem(SESSION_KEY,JSON.stringify({code,name:displayName}));
    activeCode=code;activeUser=user;setActive(true);ended=false;
    startQuizView(code,user.uid);
    onlineStatus('실시간 서버 연결 중…');
    unsubRoom=onValue(ref(db,`v2/rooms/${code}`),snapshot=>renderRoom(snapshot.val()),err=>{
      feedback(`대기실 조회 실패: ${formatError(err)}`,'error');
    });
    watchConnection(user.uid,displayName);
    if(!automatic) history.replaceState(null,'',`join.html?code=${code}`);
  }catch(err){feedback(formatError(err),'error');onlineStatus('입장 실패');
    sessionStorage.removeItem(SESSION_KEY);if(unsubRoom){unsubRoom();unsubRoom=null;}setActive(false);stopQuizView();activeCode='';activeUser=null;
  }finally{joining=false;$('join-room-btn').disabled=false;}
}
$('join-room-btn').addEventListener('click',()=>joinRoom(false));
$('leave-room-btn').addEventListener('click',()=>leaveRoom());
if(!isConfigured){feedback('Firebase 연결 설정이 필요합니다.','error');onlineStatus('설정 필요');$('join-room-btn').disabled=true;}
else{
  onAuthStateChanged(auth, user=>{
    if(user && !user.isAnonymous){feedback('현재 브라우저는 교사 Google 계정으로 로그인되어 있습니다. 시크릿 창에서 학생 접속을 시험해 주세요.','error');}
    else if(!active&&!joining){
      let info=null;try{info=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');}catch(_){}
      if(info?.code&&info?.name){$('join-code').value=info.code;$('join-name').value=info.name;joinRoom(true);}
      else onlineStatus('참여 코드를 입력해 주세요.');
    }
  },err=>feedback(formatError(err),'error'));
}
