// Purplekit Racing v6 alpha5 — teacher-authoritative playable multiplayer.
// Reuses existing QR rooms, Firebase identities, question sets and v6 rules.
import {db,auth,formatError} from './firebase.js';
import {ref,get,onValue,update,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import {makeShuffleBag,verifyGoldAnswer,shuffleGoldChoices} from './gold-core.js';
import {optionsArray,escapeCsv} from './classic-core.js';
import {normalizeQuestionImage} from './image-utils.js';
import {chooseRacingReward,racingScore,scoreRacingAnswer,racingStandings} from './racing-game-core.js';
const $=id=>document.getElementById(id);
let code='',room=null,run=null,pub=null,states={},answers={},garage=null,unsubs=[],token=0,processing=false,operation=false,attempted=new Set(),focus=false;
function notice(text,bad=false){const e=$('racing-play-status');if(e){e.textContent=text;e.dataset.kind=bad?'error':'success'}}
function stop(){
 token++;unsubs.forEach(fn=>{try{fn()}catch(_){}});
 unsubs=[];code='';room=null;run=null;pub=null;states={};answers={};garage=null;processing=false;operation=false;attempted.clear();
 setFocus(false);$('racing-play-controls').hidden=true;
}
const rosterOf=()=>Object.fromEntries(Object.entries(room?.members||{}).filter(([,m])=>m?.profile?.name).map(([uid,m])=>[uid,m.profile.name]));
function questionList(source){
 const questions=Object.values(source?.questions||{}).sort((a,b)=>Number(a.number)-Number(b.number));
 return questions.map(q=>({
  number:Number(q.number)||1,prompt:String(q.prompt||''),type:q.type==='typing'?'typing':'multiple_choice',
  timeLimit:Math.max(10,Math.min(120,Number(q.timeLimit)||30)),options:optionsArray(q.options),
  correctIndex:Number(q.correctIndex)||0,
  ...(q.imageUrl?{imageUrl:normalizeQuestionImage(q.imageUrl,new URL('../',import.meta.url).href)}:{})
 })).filter(q=>q.prompt&&(q.type==='typing'?q.options.filter(Boolean).length>0:q.options.length>=2&&q.correctIndex>=1&&q.correctIndex<=q.options.length));
}
function nextQuestion(uid,seq,prev){
 const deck=run?.decks?.[uid]||[],idx=Number(deck[seq]);
 if(!run?.questions?.[idx])return {...prev,phase:'waiting',nonce:'done_'+seq,questionIndex:0,number:0,prompt:'준비된 문제를 모두 풀었습니다.',options:[],optionOrder:[],sequence:seq};
 const q=run.questions[idx],shuffled=q.type==='typing'?null:shuffleGoldChoices(q.options,null,Math.random,q.correctIndex);
 return {phase:'question',nonce:'q'+seq+'_'+crypto.randomUUID().replace(/-/g,'').slice(0,12),questionIndex:idx,
  sequence:seq,number:Number(q.number),prompt:q.prompt,type:q.type,options:shuffled?.options||[],
  optionOrder:shuffled?.optionOrder||[],imageUrl:q.imageUrl||'',timeLimit:q.timeLimit,
  answered:Number(prev?.answered||0),correct:Number(prev?.correct||0)};
}
function render(){
 const panel=$('racing-play-controls');if(!code){panel.hidden=true;return;}
 panel.hidden=false;
 const state=pub?.state||'lobby',ready=Boolean(run),scores=pub?.scores||{},rank=racingStandings(scores);
 const meters=Number(pub?.finishMeters||20);
 $('racing-play-badge').textContent=state==='finished'?'경기 종료':state==='playing'?'경기 중':ready?'준비 완료':'대기 중';
 $('racing-play-prepare').disabled=operation||ready||!room?.meta?.setId||room?.meta?.state!=='lobby';
 $('racing-play-start').disabled=operation||!ready||state!=='lobby';
 $('racing-play-end').disabled=operation||state!=='playing';
 $('racing-play-export').disabled=!ready;
 $('racing-play-distance').disabled=ready;$('racing-play-duration').disabled=ready;
 if(run){$('racing-play-distance').value=String(run.finishMeters||20);$('racing-play-duration').value=String(run.durationSec||300);}
 $('racing-play-summary').textContent=rank.length+'명 · 정답 '+rank.reduce((n,p)=>n+Number(p.correct||0),0)+'회 · 전체 풀이 '+rank.reduce((n,p)=>n+Number(p.answered||0),0)+'회 · 목표 '+meters+'m';
 const remain=state==='playing'?Math.max(0,Math.ceil((Number(pub?.endsAt||0)-Date.now())/1000)):state==='finished'?0:Number(run?.durationSec||300);
 $('racing-play-clock').textContent=state==='playing'||state==='lobby'&&ready?Math.floor(remain/60)+':'+String(remain%60).padStart(2,'0'):'—';
 $('racing-play-guide').textContent=state==='playing'?'진행 중 · 정답이면 +1m, 정답 3회마다 룰렛!':state==='finished'?'결승선 또는 제한 시간으로 종료되었습니다.':'학생이 차를 고르면 게임 준비를 누른 뒤 시작하세요.';
 const list=$('racing-play-ranking');list.replaceChildren();
 for(let i=0;i<rank.length;i++){
  const p=rank[i],item=document.createElement('div');item.className='racing-track-row';
  const label=document.createElement('span');label.className='racing-track-name';label.textContent=(i<3?['🥇','🥈','🥉'][i]:(i+1)+'위')+' '+p.name;
  const car=document.createElement('img');car.className='racing-track-car';car.alt='';car.loading='lazy';
  const id=Number(p.carId);car.src=window.RACING_SPRITES?.[id]||'';
  const progress=document.createElement('div');progress.className='racing-track-progress';
  const fill=document.createElement('div');fill.className='racing-track-fill';fill.style.width=Math.max(0,Math.min(100,Number(p.meters||0)/meters*100))+'%';
  progress.append(fill);const points=document.createElement('b');points.textContent=p.meters+' / '+meters+'m';
  const stats=document.createElement('small');stats.textContent='정답 '+(p.correct||0)+' / '+(p.answered||0);
  item.append(label,car,progress,points,stats);list.append(item);
 }
 if(!rank.length)list.textContent='게임을 준비하면 실시간 레이싱 순위가 표시됩니다.';
}
function setFocus(value){
 focus=Boolean(value);const el=$('racing-play-controls');if(!el)return;el.classList.toggle('racing-play-focus',focus);
 $('racing-play-focus-toggle').textContent=focus?'관리 화면으로 돌아가기':'🏁 경주 상황판 크게 보기';
 document.body.classList.toggle('racing-focus-active',focus);
}
async function prepare(){
 if(!code||run||operation||room?.meta?.mode!=='racing'||room?.meta?.state!=='lobby')return;
 operation=true;render();
 const c=code;
 try{
  const setId=room.meta.setId;
  if(!setId)throw Error('게임방을 만들 때 문제 세트를 선택해 주세요.');
  const [source,rosterSnap,garageSnap]=await Promise.all([
   get(ref(db,'v1/questionSets/'+setId)),get(ref(db,'v2/rooms/'+c+'/members')),get(ref(db,'v6/carRegistry/'+c))
  ]);
  const questions=questionList(source.val());
  if(!questions.length)throw Error('사용할 수 있는 문제가 없습니다. 문제 세트를 확인해 주세요.');
  const members=rosterSnap.val()||{},byUid=garageSnap.val()?.byUid||{};
  const entries=Object.entries(members).filter(([uid,m])=>m?.profile?.name&&byUid[uid]&&Object.keys(m.connections||{}).length);
  if(!entries.length)throw Error('자동차를 확정하고 접속 중인 학생이 한 명 이상 필요합니다.');
  const missing=Object.values(members).filter(m=>m?.profile?.name&&Object.keys(m.connections||{}).length).length-entries.length;
  const durationSec=Number($('racing-play-duration').value)||300,finishMeters=Number($('racing-play-distance').value)||20;
  if(!confirm(entries.length+'명, '+questions.length+'문항, 목표 '+finishMeters+'m, '+durationSec/60+'분으로 레이싱을 준비할까요?'+(missing?'\n자동차 미선택 '+missing+'명은 이번 경주에 참여하지 않습니다.':'')))return;
  const roster=Object.fromEntries(entries.map(([uid,m])=>[uid,m.profile.name]));
  const decks=Object.fromEntries(entries.map(([uid])=>[uid,makeShuffleBag(questions.length,120)]));
  const scores=Object.fromEntries(entries.map(([uid,m])=>[uid,racingScore(m.profile.name,byUid[uid])]));
  await update(ref(db),{
   ['v6/privateRuns/'+c]:{setId,title:source.val()?.title||'레이싱',questions,decks,roster,durationSec,finishMeters,createdAt:serverTimestamp(),answersLog:{}},
   ['v6/public/'+c]:{state:'lobby',ready:true,finishMeters,durationSec,scores,title:room.meta.title||'레이싱'},
   ['v2/rooms/'+c+'/meta/state']:'locked',
   ['v2/hostRooms/'+auth.currentUser.uid+'/'+c+'/state']:'locked'
  });
  notice('게임 준비 완료! 이제 「경주 시작」을 눌러 주세요.');
 }catch(e){notice('준비 오류: '+formatError(e),true)}
 finally{operation=false;render();}
}
async function start(){
 if(!code||operation||!run||pub?.state!=='lobby')return;
 operation=true;render();const c=code;
 try{
  const now=Date.now(),changes={
   ['v6/public/'+c+'/state']:'playing',
   ['v6/public/'+c+'/startedAt']:serverTimestamp(),
   ['v6/public/'+c+'/endsAt']:now+Number(run.durationSec||300)*1000
  };
  for(const uid of Object.keys(run.roster||{}))changes['v6/memberState/'+c+'/'+uid]=nextQuestion(uid,0,{answered:0,correct:0});
  await update(ref(db),changes);setFocus(true);notice('경주 시작! 학생 답안을 자동 채점하고 있습니다.');
 }catch(e){notice('시작 오류: '+formatError(e),true)}
 finally{operation=false;render();}
}
async function finish(){
 if(!code||operation||pub?.state!=='playing')return;
 operation=true;
 try{await update(ref(db,'v6/public/'+code),{state:'finished',finishedAt:serverTimestamp()});notice('레이싱 종료! 학생들이 결과와 순위를 볼 수 있습니다.');}
 catch(e){notice('종료 오류: '+formatError(e),true)}
 finally{operation=false;render();}
}
async function processAnswer(uid,state,submission){
 const c=code,record=run,nonce=state?.nonce;
 if(!c||!nonce||!submission?.value||!record?.questions?.[state.questionIndex]||!pub?.scores?.[uid])return;
 const key=uid+'/'+nonce;if(attempted.has(key))return;attempted.add(key);
 try{
  const question=record.questions[state.questionIndex],valid=Number(submission.at||0)>0
   &&Number(submission.at)<=Number(pub.endsAt||0)+200
   &&Number(submission.at)>=Number(pub.startedAt||0)-1000;
  const correct=valid&&verifyGoldAnswer(question,submission.value,state.optionOrder);
  const now=Date.now(),reward=chooseRacingReward();
  const scoreRef=ref(db,'v6/public/'+c+'/scores/'+uid);
  const outcome=await runTransaction(scoreRef,current=>scoreRacingAnswer(current,{correct,nonce,finishMeters:Number(pub.finishMeters||20),at:now,reward})||undefined,{applyLocally:false});
  let score=outcome.snapshot.val();
  if(!score||score.lastAnswerNonce!==nonce)score=(await get(scoreRef)).val();
  if(!score||score.lastAnswerNonce!==nonce)throw Error('채점 결과를 저장하지 못했습니다.');
  const next=nextQuestion(uid,Number(state.sequence||0)+1,{answered:score.answered,correct:score.correct});
  await runTransaction(ref(db,'v6/memberState/'+c+'/'+uid),old=>old?.nonce===nonce?next:undefined,{applyLocally:false});
  await update(ref(db),{['v6/privateRuns/'+c+'/answersLog/'+uid+'/'+nonce]:{
   questionNumber:question.number,answer:String(submission.value),correct:!!correct,
   meters:Number(score.meters||0),bonus:Number(score.lastResult?.bonus||0),at:Number(submission.at||0)
  }});
  if(Number(score.meters||0)>=Number(pub.finishMeters||20)){
   await update(ref(db,'v6/public/'+c),{state:'finished',finishedAt:serverTimestamp()});
   notice(score.name+' 학생이 결승선에 도착했습니다! 🏁');
  }
 }catch(e){attempted.delete(key);notice('채점 처리 오류: '+formatError(e),true)}
}
async function pump(){
 if(processing||!code||pub?.state!=='playing'||!run)return;
 processing=true;
 try{
  let jobs=0;
  for(const [uid,st] of Object.entries(states)){
   if(code===' '||jobs>=50)break;
   const answer=answers?.[uid]?.[st?.nonce];
   if(st?.phase!=='question'||!answer||!run.roster?.[uid])continue;
   jobs++;await processAnswer(uid,st,answer);
  }
 }finally{processing=false;}
}
function watch(c){
 const key=++token;
 const paths={room:'v2/rooms/'+c,run:'v6/privateRuns/'+c,pub:'v6/public/'+c,states:'v6/memberState/'+c,answers:'v6/answers/'+c,garage:'v6/carRegistry/'+c};
 for(const [name,path] of Object.entries(paths))unsubs.push(onValue(ref(db,path),snap=>{
  if(key!==token||code!==c)return;
  const value=snap.val();
  if(name==='room')room=value;
  else if(name==='run')run=value;
  else if(name==='pub')pub=value;
  else if(name==='states')states=value||{};
  else if(name==='answers')answers=value||{};
  else if(name==='garage')garage=value;
  render();if(name==='states'||name==='answers'||name==='pub')void pump();
 },err=>notice(name+' 읽기 실패: '+formatError(err),true)));
}
function bind(next,mode){
 if(next===code)return;
 stop();
 if(!/^\d{6}$/.test(next)||mode!=='racing')return;
 const user=auth.currentUser;if(!user||user.isAnonymous)return;
 code=next;$('racing-play-controls').hidden=false;
 watch(next);notice('레이싱 게임 준비를 기다리고 있습니다.');
}
function exportCsv(){
 if(!run||!code)return;
 const rows=[['이름','문항번호','학생 답안','정답여부','보너스(m)','현재 거리(m)']];
 for(const [uid,name] of Object.entries(run.roster||{}))
  for(const log of Object.values(run.answersLog?.[uid]||{}))rows.push([name,log.questionNumber,log.answer,log.correct?'정답':'오답',log.bonus||0,log.meters||0]);
 const csv='\ufeff'+rows.map(row=>row.map(escapeCsv).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='퍼플킷_레이싱_'+code+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
$('racing-play-prepare').addEventListener('click',()=>void prepare());
$('racing-play-start').addEventListener('click',()=>void start());
$('racing-play-end').addEventListener('click',()=>{if(confirm('현재 레이싱 경주를 종료할까요?'))void finish()});
$('racing-play-export').addEventListener('click',exportCsv);
$('racing-play-focus-toggle').addEventListener('click',()=>setFocus(!focus));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&focus)setFocus(false)});
window.addEventListener('quizlab-room-open',e=>bind(e.detail?.code||'',e.detail?.mode||''));
window.addEventListener('quizlab-room-meta',e=>{
 const c=e.detail?.code||'',mode=e.detail?.meta?.mode||'';
 if(mode==='racing')bind(c,mode);else if(c===code)stop();
});
setInterval(()=>{if(pub?.state==='playing'&&code){
 $('racing-play-clock').textContent=Math.floor(Math.max(0,Math.ceil((Number(pub.endsAt||0)-Date.now())/1000))/60)+':'+String(Math.max(0,Math.ceil((Number(pub.endsAt||0)-Date.now())/1000))%60).padStart(2,'0');
 if(Number(pub.endsAt||0)>0&&Date.now()>Number(pub.endsAt||0)+500&&!operation)void finish();
}},1000);
