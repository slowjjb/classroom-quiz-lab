// Racing v6 lobby coordinator for the existing teacher room screen.
// Only handles vehicle allocation. Actual game scoring is a separate phase.
import {db,auth,formatError} from './firebase.js';
import {ref,get,onValue} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import {watchRacingCars,watchRacingCarRequestsAsTeacher} from './racing-car-reservations.js';
const $=id=>document.getElementById(id);
let currentCode='',active=false,stopFns=[],garage=null,names={},phase='',lobbyState='',token=0;
function message(text,error=false){
 const el=$('racing-host-status');if(!el)return;el.textContent=text;el.dataset.kind=error?'error':'success';
}
function stop(){
 token++;for(const off of stopFns){try{off()}catch(e){console.warn(e)}}
 stopFns=[];active=false;currentCode='';garage=null;names={};phase='';lobbyState='';
 $('racing-host-panel').hidden=true;
}
function render(){
 if(!active)return;
 const slots=garage?.slots||{},uids=garage?.byUid||{},count=Object.keys(slots).length;
 $('racing-host-selected').textContent=count+' / 30대 선택 · '+Object.keys(uids).length+'명 확정';
 $('racing-host-phase').textContent=phase==='playing'?'경주 상태(선택 잠금)':phase==='finished'?'경주 종료':'대기 중 · 선택 가능';
 $('racing-host-hint').textContent=lobbyState!=='lobby'||phase!=='lobby'?'자동차 선택이 잠겼습니다.':'학생들이 자동차를 확정하면 이곳에 실시간으로 반영됩니다.';
 const grid=$('racing-host-lanes');grid.replaceChildren();
 for(let n=1;n<=30;n++){
  const no=String(n).padStart(2,'0'),uid=slots[no],line=document.createElement('div');
  line.className='racing-host-slot'+(uid?' occupied':'');
  const label=document.createElement('b');label.textContent='🏎️ '+no;
  const value=document.createElement('span');value.textContent=uid?(names[uid]||'학생 '+String(uid).slice(-5)):'선택 가능';
  value.title=uid||'';
  line.append(label,value);grid.append(line);
 }
}
async function activate(code){
 if(active&&currentCode===code)return;
 stop();const self=++token;currentCode=code;
 $('racing-host-panel').hidden=false;
 message('Firebase v6 권한을 확인하고 있습니다.');
 try{
  const user=auth.currentUser;
  if(!user||user.isAnonymous)throw Error('교사 Google 로그인이 필요합니다.');
  await get(ref(db,'v6/versionCheck'));
  if(self!==token)return;
  active=true;
  stopFns.push(watchRacingCars(db,code,next=>{if(self!==token)return;garage=next;render()},err=>message('차량 등록부 조회 실패: '+formatError(err),true)));
  stopFns.push(onValue(ref(db,'v2/rooms/'+code+'/members'),snap=>{
   if(self!==token)return;
   names=Object.fromEntries(Object.entries(snap.val()||{}).map(([uid,value])=>[uid,value?.profile?.name||'이름 없음']));
   render();
  },err=>message('학생 명단 조회 실패: '+formatError(err),true)));
  stopFns.push(onValue(ref(db,'v6/public/'+code),snap=>{
   if(self!==token)return;
   phase=snap.val()?.state||'';render();
  },err=>message('레이싱 상태 조회 실패: '+formatError(err),true)));
  stopFns.push(onValue(ref(db,'v2/rooms/'+code+'/meta/state'),snap=>{
   if(self!==token)return;
   lobbyState=snap.val()||'';render();
  },err=>message('방 상태 조회 실패: '+formatError(err),true)));
  stopFns.push(watchRacingCarRequestsAsTeacher(db,code,err=>message('자동차 배정 처리 실패: '+formatError(err),true)));
  message('학생 자동차 선택 요청을 자동으로 처리합니다. 이 화면을 열어 두세요.');
 }catch(err){if(self!==token)return;message('Firebase v6 연결 오류: '+formatError(err),true)}
}
window.addEventListener('quizlab-room-open',event=>{
 const next=event.detail?.code||'',mode=event.detail?.mode||'';
 stop();
 if(mode==='racing'&&/^\d{6}$/.test(next))void activate(next);
});
window.addEventListener('quizlab-room-meta',event=>{
 const next=event.detail?.code||'',mode=event.detail?.meta?.mode||'';
 if(mode==='racing'&&/^\d{6}$/.test(next))void activate(next);
 else if(next===currentCode)stop();
});
