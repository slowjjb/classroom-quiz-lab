import { auth, db, isConfigured, formatError } from './firebase.js';
import { firebaseConfig } from '../firebase-config.js';
import { validateCount, summarizeRecords, isCleanPass, csvField } from './loadtest-core.js';
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js';
import { getAuth, setPersistence, inMemoryPersistence, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, deleteUser } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { getDatabase, ref, get, onValue, set, remove, push, update, runTransaction, serverTimestamp, onDisconnect, goOffline, goOnline } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';

const $ = id => document.getElementById(id);
const state = {teacher:null,authorized:false,roomCode:'',roomData:null,unsubscribeRoom:null,clients:[],busy:false,prepared:false,ran:false,results:[],runId:'',lastRunAt:null,testRooms:[]};
const clock=()=>Math.round(performance.now());
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const humanError=err=>formatError(err).replaceAll('FirebaseError:', '').trim();
function setMessage(id,value,kind=''){$(id).textContent=value;$(id).dataset.kind=kind;}
function log(value){const d=new Date();const msg=`[${d.toLocaleTimeString('ko-KR',{hour12:false})}] ${value}`;
  const target=$('load-log');if(!state.results.length && target.textContent.includes('시작하면'))target.textContent='';
  target.textContent += msg+'\n';if(target.textContent.length>20000)target.textContent=target.textContent.slice(-18000);target.scrollTop=target.scrollHeight;}
function progress(value,message){$('load-progressbar').value=Math.max(0,Math.min(100,value));$('load-progress').textContent=message;}
function stateButtons(){const ready=state.authorized&&!state.busy;const hasRoom=Boolean(state.roomCode);
  $('load-workspace').classList.toggle('workspace-locked',!state.authorized);
  $('load-workspace').setAttribute('aria-disabled',String(!state.authorized));
  $('load-create-room').disabled=!ready||hasRoom;
  $('load-prepare').disabled=!ready||!hasRoom||state.prepared||state.clients.length>0;
  $('load-run').disabled=!ready||!state.prepared||state.ran;
  $('load-reconnect').disabled=!ready||!state.ran||!state.clients.length;
  $('load-verify').disabled=!ready||!hasRoom;
  $('load-cleanup').disabled=!ready||!hasRoom;
  $('load-export').disabled=!state.ran;
  $('load-count').disabled=!ready||!hasRoom||state.clients.length>0;
}
function statusSummary(refreshVerdict=false){
  const count=state.clients.filter(c=>Boolean(c.uid)).length;
  $('stat-prepared').textContent=count+'명';
  const stats=summarizeRecords(state.clients,state.roomData?.members||{});
  $('stat-online').textContent=stats.active+'명';
  $('stat-result').textContent=`${stats.joined} / ${stats.failed}`;
  $('stat-average').textContent=stats.avgMs===null?'—':stats.avgMs+'ms';
  $('stat-p95').textContent=stats.p95Ms===null?'—':stats.p95Ms+'ms';
  $('stat-unique').textContent=`${stats.uniqueUids} / ${stats.uniqueNames}`;
  if(refreshVerdict&&state.ran){
    const expected=state.clients.length;
    const ok=isCleanPass(stats,expected);
    setMessage('load-verdict',ok?
      `통과: ${expected}개 별도 익명 계정, ${stats.active}개 고유 참가자, ${stats.sessionCount}개 접속 세션을 확인했습니다.`:
      `추가 확인 필요: 목표 ${expected}명 / 실제 접속 ${stats.active}명 / 세션 ${stats.sessionCount}개 / 실패 ${stats.failed}건.`,ok?'success':'error');
  }
}
async function teacherGate(user){
  state.authorized=false;state.teacher=null;
  $('load-login').hidden=Boolean(user);
  $('load-check').hidden=!user;
  stateButtons();
  if(!user||!user.providerData?.some(p=>p.providerId==='google.com')){
    setMessage('load-auth-msg','교사 Google 계정으로 로그인해 주세요.');return;
  }
  try{
    setMessage('load-auth-msg','v2.1 보안 규칙과 교사 접근 권한을 검사 중입니다.');
    await get(ref(db,'v2/versionCheck'));
    await get(ref(db,`v2/hostRooms/${user.uid}`));
    state.teacher=user;state.authorized=true;
    setMessage('load-auth-msg','교사 권한 확인 완료 · 기존 v2.1 보안 규칙 그대로 이용합니다.','success');
    $('load-auth-badge').textContent='교사 권한 확인';$('load-auth-badge').className='pill pill-success';
    await refreshLeftovers();
  }catch(err){setMessage('load-auth-msg',`보안 규칙을 확인할 수 없습니다. ${humanError(err)}`,'error');
    $('load-auth-badge').textContent='권한 확인 필요';$('load-auth-badge').className='pill pill-error';}
  stateButtons();
}
async function refreshLeftovers(){
  if(!state.authorized)return;
  const snap=await get(ref(db,`v2/hostRooms/${state.teacher.uid}`));
  const rooms=Object.entries(snap.val()||{}).filter(([,v])=>v?.testOnly===true);
  state.testRooms=rooms;
  const out=$('load-leftovers');out.hidden=!rooms.length;
  const list=$('load-leftover-list');list.replaceChildren();
  for(const [code,host] of rooms){
    const row=document.createElement('div');row.className='saved-set';
    const t=document.createElement('div');t.className='saved-description';
    const title=document.createElement('strong');title.textContent=`${code} · ${host.title||'자동 부하 테스트'}`;
    const sub=document.createElement('span');sub.className='helper';sub.textContent=new Date(host.createdAt).toLocaleString('ko-KR');t.append(title,sub);
    const btn=document.createElement('button');btn.className='btn btn-danger btn-small';btn.textContent='잔여 테스트 방 정리';
    btn.disabled=state.busy || state.roomCode===code;
    btn.addEventListener('click',async()=>{
      if(state.busy||state.roomCode===code)return;
      if(!confirm(`가상 테스트 전용 방 ${code}을(를) 완전히 삭제할까요?`))return;
      state.busy=true;stateButtons();
      try{await deleteOnlyTestRoom(code);log(`남아 있던 테스트 방 ${code} 정리 완료`);}
      catch(err){log(`테스트 방 정리 오류: ${humanError(err)}`);}
      finally{state.busy=false;await refreshLeftovers();stateButtons();}
    });
    row.append(t,btn);list.append(row);
  }
}
async function deleteOnlyTestRoom(code){
  if(!state.teacher||!/^\d{6}$/.test(code))throw new Error('잘못된 테스트 방 코드입니다.');
  const m=await get(ref(db,`v2/rooms/${code}/meta`));
  if(m.exists()&&(m.val().testOnly!==true||m.val().hostUid!==state.teacher.uid))
    throw new Error('전용 테스트 방이 아니므로 삭제하지 않았습니다.');
  // 지정된 테스트 방과 그 방의 호스트 색인만 제거. v0/v1이나 다른 방을 건드리지 않습니다.
  await remove(ref(db,`v2/rooms/${code}`));
  await remove(ref(db,`v2/hostRooms/${state.teacher.uid}/${code}`));
}
async function makeTestRoom(){
  if(state.busy||!state.authorized||state.roomCode)return;
  state.busy=true;stateButtons();
  try{
    setMessage('load-room-msg','중복되지 않는 6자리 테스트 방을 만드는 중입니다.');
    for(let attempt=0;attempt<15;attempt++){
      const bytes=new Uint32Array(1);crypto.getRandomValues(bytes);
      const code=String(100000+(bytes[0]%900000));const now=Date.now();
      const meta={hostUid:state.teacher.uid,createdAt:now,state:'lobby',title:'[부하테스트] 가상 학생 전용',mode:'classic',target:30,setId:'',setTitle:'문제 없음',testOnly:true};
      const result=await runTransaction(ref(db,`v2/rooms/${code}`),v=>v===null?{meta}:undefined,{applyLocally:false});
      if(!result.committed)continue;
      try{
        await set(ref(db,`v2/hostRooms/${state.teacher.uid}/${code}`),{createdAt:now,title:meta.title,state:'lobby',testOnly:true});
      }catch(indexError){
        // 색인 저장 실패 시 방만 남는 일을 막습니다.
        try{await remove(ref(db,`v2/rooms/${code}`));}catch(_){}
        throw indexError;
      }
      state.roomCode=code;state.roomData={meta};
      state.unsubscribeRoom=onValue(ref(db,`v2/rooms/${code}`),snap=>{state.roomData=snap.val();statusSummary();},err=>log('교사 실시간 목록 오류: '+humanError(err)));
      $('load-room-code').textContent=code;
      setMessage('load-room-msg',`테스트 전용 방 ${code}을 만들었습니다. 이 방에서만 가상 학생을 실행합니다.`,'success');
      log(`전용 테스트 방 ${code} 생성 완료`);
      await refreshLeftovers();return;
    }
    throw new Error('빈 참여 코드를 찾지 못했습니다. 다시 시도해 주세요.');
  }catch(err){setMessage('load-room-msg',humanError(err),'error');log('방 생성 실패: '+humanError(err));}
  finally{state.busy=false;stateButtons();}
}
async function workerPool(tasks,limit){
  let idx=0;const workers=Array.from({length:Math.min(limit,tasks.length)},async()=>{
    for(;;){const my=idx++;if(my>=tasks.length)return;try{await tasks[my]();}catch(e){log('내부 실행 오류: '+humanError(e));}}
  });await Promise.all(workers);
}
async function prepareClients(){
  if(state.busy||!state.authorized||!state.roomCode||state.clients.length)return;
  const count=validateCount($('load-count').value);
  state.busy=true;stateButtons();
  state.runId=`${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
  state.clients=Array.from({length:count},(_,i)=>({id:i+1,name:`부하${String(i+1).padStart(3,'0')}`,state:'waiting',uid:'',error:'',joinMs:null,connected:false,active:false,connectionUp:false,sessionRef:null,unsubscribeConnected:null}));
  state.lastRunAt=new Date().toISOString();
  try{
    log(`서로 다른 ${count}개 익명 Firebase 계정을 준비합니다 (동시 생성 3개 제한).`);
    let completed=0;
    await workerPool(state.clients.map(c=>async()=>{
      try{
        const app=initializeApp(firebaseConfig,`quizlab-v22-${state.runId}-${c.id}`);
        c.app=app;c.auth=getAuth(app);c.db=getDatabase(app);
        await setPersistence(c.auth,inMemoryPersistence);
        const response=await signInAnonymously(c.auth);
        c.uid=response.user.uid;c.state='prepared';
      }catch(err){c.state='failed';c.error=humanError(err);log(`${c.name} 계정 생성 실패: ${c.error}`);}
      completed++;
      progress(Math.round(completed/count*100),`가상 계정 준비 ${completed} / ${count}`);
      statusSummary();
    }),3);
    const ok=state.clients.every(c=>c.state==='prepared');
    state.prepared=ok;
    if(!ok){setMessage('load-verdict',`계정 준비 ${state.clients.filter(c=>c.uid).length}/${count}명. 인증 제한 또는 네트워크 오류가 있었습니다. CSV를 확인하고 정리한 뒤 새 테스트 방으로 다시 시도하세요.`,'error');}
    else {log(`${count}개 익명 계정 준비 완료. 동시 입장 실행을 눌러 주세요.`);setMessage('load-verdict',`${count}개 별도 익명 계정 준비 완료. 아직 방에 입장하지 않았습니다.`);}
  }finally{state.busy=false;stateButtons();}
}
function waitFor(predicate,maxMs=20000){return new Promise((resolve,reject)=>{
  const start=performance.now();const timer=setInterval(()=>{
    if(predicate()){clearInterval(timer);resolve();}
    else if(performance.now()-start>maxMs){clearInterval(timer);reject(new Error('20초 내 서버 접속 확인 실패'));}
  },120);
});}
function attachPresence(c){
  c.active=true;
  c.unsubscribeConnected=onValue(ref(c.db,'.info/connected'),async snap=>{
    if(!c.active)return;
    if(snap.val()!==true){c.connectionUp=false;c.connected=false;c.sessionRef=null;
      if(c.state==='online'||c.state==='reconnected')c.state='offline';
      return;
    }
    if(c.connectionUp)return;
    c.connectionUp=true;
    const path=push(ref(c.db,`v2/rooms/${state.roomCode}/members/${c.uid}/connections`));
    try{
      await onDisconnect(path).remove();
      await set(path,serverTimestamp());
      if(!c.active){try{await remove(path);}catch(_){}return;}
      const wasOffline=c.state==='offline';
      c.sessionRef=path;c.connected=true;
      c.state=wasOffline?'reconnected':'online';
    }catch(err){c.connectionUp=false;c.error=humanError(err);c.connected=false;log(`${c.name} 실시간 접속 실패: ${c.error}`);}
  },err=>{c.error=humanError(err);c.connectionUp=false;log(`${c.name} 연결 상태 조회 실패: ${c.error}`);});
}
async function enter(c){
  const start=clock();c.state='joining';
  try{
    const code=state.roomCode;
    const meta=await get(ref(c.db,`v2/rooms/${code}/meta`));
    if(!meta.exists()||meta.val().state!=='lobby'||meta.val().testOnly!==true)throw new Error('입장 가능한 전용 테스트 방이 아닙니다.');
    const claim=ref(c.db,`v2/rooms/${code}/nameClaims/${c.name}`);
    const claimResult=await runTransaction(claim,value=>value===null||value===c.uid?c.uid:undefined,{applyLocally:false});
    if(!claimResult.committed)throw new Error('동일 이름 선점 충돌');
    await set(ref(c.db,`v2/rooms/${code}/members/${c.uid}/profile`),{name:c.name,joinedAt:Date.now()});
    attachPresence(c);
    await waitFor(()=>c.connected,20000);
    c.joinMs=clock()-start;
  }catch(err){
    c.error=humanError(err);c.state='failed';
    if(c.unsubscribeConnected){c.unsubscribeConnected();c.unsubscribeConnected=null;}
    c.active=false;
    log(`${c.name} 입장 실패: ${c.error}`);
  }
}
async function runTest(){
  if(state.busy||!state.prepared||!state.roomCode||state.ran)return;
  state.busy=true;state.ran=true;stateButtons();
  try{
    log(`별도 익명 UID ${state.clients.length}개로 동시 입장을 시작합니다.`);
    progress(0,'동시 입장 실행 중…');
    let completed=0;
    await Promise.all(state.clients.map(async c=>{
      await enter(c);
      completed++;progress(Math.round(completed/state.clients.length*100),`방 입장 ${completed} / ${state.clients.length}`);
      statusSummary();
    }));
    log(`입장 요청 종료. 교사 권한으로 Firebase 기록을 검증합니다.`);
    await verifyRoom(true);
  }catch(err){setMessage('load-verdict','테스트 진행 오류: '+humanError(err),'error');log('테스트 오류: '+humanError(err));}
  finally{state.busy=false;stateButtons();}
}
async function verifyRoom(logResult=false){
  const snapshot=await get(ref(db,`v2/rooms/${state.roomCode}`));
  state.roomData=snapshot.val();statusSummary(true);
  if(logResult){const stats=summarizeRecords(state.clients,state.roomData?.members||{});
    log(`서버 조회: 온라인 ${stats.active}명, 세션 ${stats.sessionCount}개, 고유 UID ${stats.uniqueUids}개, 고유 이름 ${stats.uniqueNames}개, 실패 ${stats.failed}건`);
    if(isCleanPass(stats,state.clients.length))log('PASS: 목표 접속 수 및 UID/이름/세션 수가 모두 일치합니다.');
    else log('CHECK: 일부 연결 실패 또는 데이터 불일치가 있습니다. 결과 CSV를 확인하세요.');
  }
  return summarizeRecords(state.clients,state.roomData?.members||{});
}
async function retryConnections(){
  if(state.busy||!state.ran||!state.roomCode)return;
  state.busy=true;stateButtons();
  let chosen=[];
  try{
    const up=state.clients.filter(c=>c.connected && c.db);
    if(up.length<5)throw new Error('연결된 가상 학생이 5명 이상이어야 합니다.');
    chosen=up.slice(0,5);
    log('선택한 5개 독립 연결을 강제로 오프라인 전환합니다.');
    chosen.forEach(c=>{c.state='offline';c.connected=false;goOffline(c.db);});
    progress(20,'5개 연결 종료를 교사 화면에서 확인 중…');
    await waitFor(()=>{
      const members=state.roomData?.members||{};
      return chosen.every(c=>Object.keys(members[c.uid]?.connections||{}).length===0);
    },20000);
    log('PASS: 5명 오프라인 표시 확인. 다시 연결을 요청합니다.');
    progress(50,'다시 연결 요청 중…');
    chosen.forEach(c=>goOnline(c.db));
    await waitFor(()=>chosen.every(c=>c.connected),20000);
    await waitFor(()=>{
      const members=state.roomData?.members||{};
      return chosen.every(c=>Object.keys(members[c.uid]?.connections||{}).length>0);
    },20000);
    progress(100,'5명 연결 복원 완료');
    log('PASS: 같은 UID를 유지한 채 5명 재접속했습니다.');
    await verifyRoom(true);
  }catch(err){log('연결 끊기·복원 검증 실패: '+humanError(err));
    setMessage('load-verdict','재접속 테스트 실패: '+humanError(err),'error');
    chosen.forEach(c=>{try{goOnline(c.db);}catch(_){}});
  }finally{state.busy=false;stateButtons();}
}
function exportResults(){
  const stats=summarizeRecords(state.clients,state.roomData?.members||{});
  const lines=[['실행시각','테스트방','목표인원','온라인','세션','고유UID','고유이름','입장성공','입장실패','평균ms','P95ms'],
    [state.lastRunAt,state.roomCode,state.clients.length,stats.active,stats.sessionCount,stats.uniqueUids,stats.uniqueNames,stats.joined,stats.failed,stats.avgMs,stats.p95Ms],[],
    ['번호','가상 학생명','UID','상태','입장시간ms','오류'],...state.clients.map(c=>[c.id,c.name,c.uid,c.state,c.joinMs,c.error])];
  const csv='\ufeff'+lines.map(row=>row.map(csvField).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`quizlab-v2.2-test-${state.roomCode||'report'}.csv`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  log('테스트 결과 CSV 저장을 요청했습니다.');
}
async function cleanTest(){
  if(state.busy||!state.roomCode||!state.authorized)return;
  if(!confirm(`테스트 방 ${state.roomCode}과 그 안의 가상 학생 기록을 삭제할까요? 실제 문제 세트와 다른 방은 삭제하지 않습니다.`))return;
  state.busy=true;stateButtons();
  const previous=state.roomCode;
  try{
    log(`테스트 방 ${previous} 정리 시작. Firebase 연결을 끊고 테스트 데이터만 삭제합니다.`);
    for(const c of state.clients){c.active=false;if(c.unsubscribeConnected){c.unsubscribeConnected();c.unsubscribeConnected=null;}if(c.db){try{goOffline(c.db);}catch(_){}}}
    if(state.unsubscribeRoom){state.unsubscribeRoom();state.unsubscribeRoom=null;}
    await deleteOnlyTestRoom(previous);log('전용 테스트 방 및 이름·접속 기록 삭제 완료.');
    let deleted=0,failed=0;
    await workerPool(state.clients.filter(c=>c.app).map(c=>async()=>{
      if(c.auth?.currentUser?.isAnonymous){
        try{await deleteUser(c.auth.currentUser);deleted++;}
        catch(err){failed++;log(`${c.name} 익명 계정 삭제 실패: ${humanError(err)}`);}
      }
      try{await deleteApp(c.app);}catch(err){log(`${c.name} 앱 정리 오류: ${humanError(err)}`);}
    }),3);
    log(`익명 계정 ${deleted}개 삭제 확인${failed?` / ${failed}개 삭제 실패 (콘솔에서 별도 확인 필요)`:''}.`);
    state.roomCode='';state.roomData=null;state.clients=[];state.prepared=false;state.ran=false;
    $('load-room-code').textContent='방 없음';
    setMessage('load-room-msg','테스트 방 정리를 완료했습니다. 다음 인원으로 새 테스트 방을 만들 수 있습니다.','success');
    progress(0,'테스트 정리 완료');
    setMessage('load-verdict',failed?'테스트 방은 정리됐으나 일부 익명 인증 계정 삭제에 실패했습니다. 실행 기록을 확인해 주세요.':'테스트 방과 생성한 익명 계정 정리를 마쳤습니다.',failed?'error':'success');
    statusSummary();
  }catch(err){log('정리 실패: '+humanError(err));setMessage('load-verdict','정리 중 오류가 났습니다. 잔여 테스트 방에서 삭제를 다시 시도해 주세요.','error');}
  finally{state.busy=false;await refreshLeftovers();stateButtons();}
}

if(!isConfigured){setMessage('load-auth-msg','Firebase 구성 파일이 없습니다.','error');}
else{
  $('load-login').addEventListener('click',async()=>{try{await signInWithPopup(auth,new GoogleAuthProvider());}catch(err){setMessage('load-auth-msg',humanError(err),'error');}});
  $('load-check').addEventListener('click',()=>teacherGate(auth.currentUser));
  $('load-create-room').addEventListener('click',makeTestRoom);
  $('load-prepare').addEventListener('click',prepareClients);
  $('load-run').addEventListener('click',runTest);
  $('load-reconnect').addEventListener('click',retryConnections);
  $('load-verify').addEventListener('click',async()=>{
    try{await verifyRoom(true);}catch(err){log('상태 조회 실패: '+humanError(err));}
  });
  $('load-export').addEventListener('click',exportResults);
  $('load-cleanup').addEventListener('click',cleanTest);
  onAuthStateChanged(auth,user=>{
    if(state.busy)return;teacherGate(user).catch(err=>setMessage('load-auth-msg',humanError(err),'error'));
  },err=>setMessage('load-auth-msg',humanError(err),'error'));
}
stateButtons();
