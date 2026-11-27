// Purplekit Racing v6 alpha5 — teacher-authoritative playable multiplayer.
// Reuses existing QR rooms, Firebase identities, question sets and v6 rules.
import {db,auth,formatError} from './firebase.js';
import {ref,get,onValue,update,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import {makeShuffleBag,continuingGoldQuestionIndex,verifyGoldAnswer,shuffleGoldChoices,displayedGoldCorrectIndex} from './gold-core.js?v=6.0.0-alpha.21';
import {optionsArray,escapeCsv} from './classic-core.js';
import {normalizeQuestionImage} from './image-utils.js';
import {chooseRacingReward,racingScore,scoreRacingAnswer,racingStandings} from './racing-game-core.js';
import {createRacingAudio} from './racing-audio.js';
import {buildGoldAccuracy} from './gold-analytics.js';
import {normalizedRacingGarage} from './racing-garage-core.js';
import {renderRacingFinalResults,resetRacingFinalResults} from './racing-results.js?v=6.0.0-alpha.20';
const $=id=>document.getElementById(id);
let code='',room=null,run=null,pub=null,states={},answers={},garage=null,unsubs=[],token=0,processing=false,operation=false,attempted=new Set(),focus=false,rankingSignature='',lastRacePhase='',resultsMode='first',finalizing=false;
const laneRows=new Map(),sound=createRacingAudio({role:'teacher'});
function notice(text,bad=false){const e=$('racing-play-status');if(e){e.textContent=text;e.dataset.kind=bad?'error':'success'}}
function stop(){
 token++;unsubs.forEach(fn=>{try{fn()}catch(_){}});
 unsubs=[];code='';room=null;run=null;pub=null;states={};answers={};garage=null;processing=false;operation=false;rankingSignature='';lastRacePhase='';finalizing=false;attempted.clear();
 laneRows.clear();$('racing-play-ranking').replaceChildren();sound.setPlaying(false);resetRacingFinalResults();resultsMode='first';$('racing-results-mode').value='first';
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
 const deck=run?.decks?.[uid]||[],questions=run?.questions||[];
 const idx=continuingGoldQuestionIndex(deck,seq,questions.length,uid+':'+String(run?.createdAt||''));
 if(!run?.questions?.[idx])return {...prev,phase:'waiting',nonce:'done_'+seq,questionIndex:0,number:0,prompt:'준비된 문제를 모두 풀었습니다.',options:[],optionOrder:[],sequence:seq};
 const q=run.questions[idx],shuffled=q.type==='typing'?null:shuffleGoldChoices(q.options,null,Math.random,q.correctIndex);
 return {phase:'question',nonce:'q'+seq+'_'+crypto.randomUUID().replace(/-/g,'').slice(0,12),questionIndex:idx,
  sequence:seq,number:Number(q.number),prompt:q.prompt,type:q.type,options:shuffled?.options||[],
  optionOrder:shuffled?.optionOrder||[],imageUrl:q.imageUrl||'',timeLimit:q.timeLimit,
  answered:Number(prev?.answered||0),correct:Number(prev?.correct||0)};
}
let spritePromise=null;
function loadSpriteImages(){
 if(spritePromise)return spritePromise;
 spritePromise=(async()=>{
  for(let part=1;part<=3;part++){
   const first=1+(part-1)*10;
   if(window.RACING_SPRITES?.[first])continue;
   await new Promise((resolve,reject)=>{
    const tag=document.createElement('script');tag.src='racing-assets/part'+part+'.js';
    tag.onload=resolve;tag.onerror=()=>reject(new Error('차량 이미지 '+part+'번 묶음 불러오기 실패'));
    document.head.append(tag);
   });
  }
 })().catch(e=>{spritePromise=null;throw e});
 return spritePromise;
}
function render(){
 const panel=$('racing-play-controls');if(!code){panel.hidden=true;return;}
 panel.hidden=false;
 const state=pub?.state||'lobby',ready=Boolean(run),scores=pub?.scores||{},rank=racingStandings(scores);
 sound.setPlaying(state==='playing');
 if(lastRacePhase==='playing'&&state==='finished'){sound.play('finish');setFocus(true);}
 lastRacePhase=state;
 $('racing-play-audio').textContent=sound.isOn?'🔊 음악·효과음 끄기':'🔈 음악·효과음 켜기';
 const meters=Number(pub?.finishMeters||20);
 $('racing-play-badge').textContent=state==='finished'?'경기 종료':state==='playing'?'경기 중':ready?'준비 완료':'대기 중';
 $('racing-play-prepare').disabled=operation||ready||!room?.meta?.setId||!['lobby','locked'].includes(room?.meta?.state);
 $('racing-play-start').disabled=operation||!ready||state!=='lobby';
 $('racing-play-end').disabled=operation||state!=='playing';
 $('racing-play-export').disabled=!ready;
 $('racing-play-distance').disabled=ready;$('racing-play-duration').disabled=ready;
 if(run){$('racing-play-distance').value=String(run.finishMeters||20);$('racing-play-duration').value=String(run.durationSec||300);}
 $('racing-play-summary').textContent=rank.length+'명 · 정답 '+rank.reduce((n,p)=>n+Number(p.correct||0),0)+'회 · 전체 풀이 '+rank.reduce((n,p)=>n+Number(p.answered||0),0)+'회 · 목표 '+meters+'m';
 const remain=state==='playing'?Math.max(0,Math.ceil((Number(pub?.endsAt||0)-Date.now())/1000)):state==='finished'?0:Number(run?.durationSec||300);
 $('racing-play-clock').textContent=state==='playing'||state==='lobby'&&ready?Math.floor(remain/60)+':'+String(remain%60).padStart(2,'0'):'—';
 $('racing-play-guide').textContent=state==='playing'?'진행 중 · 실제 자동차가 주행합니다. 정답 +1m, 정답 3회마다 룰렛!':state==='finished'?'결승선 또는 제한 시간으로 종료되었습니다.':'학생이 차를 고르면 게임 준비를 누른 뒤 시작하세요.';
 renderRacingFinalResults({run,pub,mode:resultsMode,members:room?.members||{}});
 // Hundreds of live answers should not recreate every vehicle image each time.
 const nextSignature=JSON.stringify({scores,meters});
 if(rankingSignature===nextSignature)return;
 rankingSignature=nextSignature;
 const list=$('racing-play-ranking'),position=new Map(rank.map((entry,index)=>[entry.uid,index+1]));
 // Each car stays in its fixed numbered lane. Reuse the same DOM node so its
 // actual sprite animates forward/backward when the distance changes.
 const racers=rank.slice().sort((a,b)=>Number(a.carId||0)-Number(b.carId||0)||a.name.localeCompare(b.name,'ko'));
 // Remove the initial 'waiting for players' text before mounting the first lane.
 if(racers.length&&laneRows.size===0)list.replaceChildren();
 const visible=new Set(racers.map(p=>p.uid));
 for(const p of racers){
  let record=laneRows.get(p.uid);
  if(!record){
   const row=document.createElement('div');row.className='racing-track-row';row.dataset.uid=p.uid;
   const name=document.createElement('span');name.className='racing-track-name';
   const lane=document.createElement('div');lane.className='racing-track-lane';
   const car=document.createElement('img');car.className='racing-track-car';car.alt='';car.decoding='async';
   const finish=document.createElement('span');finish.className='racing-track-finish';finish.textContent='🏁';
   lane.append(car,finish);
   const distance=document.createElement('b');distance.className='racing-track-meters';
   const stats=document.createElement('small');stats.className='racing-track-stats';
   row.append(name,lane,distance,stats);list.append(row);
   record={row,name,car,distance,stats};laneRows.set(p.uid,record);
  }
  const {row,name,car,distance,stats}=record,place=position.get(p.uid)||0;
  const percent=Math.min(100,Math.max(0,Number(p.meters||0)/meters*100));
  name.textContent=(place<=3?['🥇','🥈','🥉'][place-1]:place+'위')+' '+p.name;
  name.title=p.name;
  const sprite=window.RACING_SPRITES?.[Number(p.carId)];
  if(sprite&&car.getAttribute('src')!==sprite)car.src=sprite;
  // left 0% -> 100%; translateX from 0% -> -100% of the sprite width.
  // The resulting physical car travels fully along the road and stops
  // at the checkered line without leaving the lane.
  car.style.left=percent+'%';
  car.style.transform='translate(-'+percent+'%, -50%)';
  distance.textContent=Number(p.meters||0)+'/'+meters+'m';
  stats.textContent='✅'+Number(p.correct||0)+' · 📝'+Number(p.answered||0);
  row.classList.toggle('racing-lane-winner',Number(p.meters||0)>=meters);
  if(row.parentNode!==list)list.append(row);
 }
 for(const [uid,record] of laneRows){if(!visible.has(uid)){record.row.remove();laneRows.delete(uid)}}
 if(!racers.length)list.textContent='게임을 준비하면 자동차 30종이 각자의 레인에서 달립니다.';
}
function setFocus(value){
 focus=Boolean(value);const el=$('racing-play-controls');if(!el)return;el.classList.toggle('racing-play-focus',focus);
 $('racing-play-focus-toggle').textContent=focus?'관리 화면으로 돌아가기':'🏁 경주 상황판 크게 보기';
 document.body.classList.toggle('racing-focus-active',focus);
}
async function prepare(){
 if(!code||run||operation||room?.meta?.mode!=='racing'||!['lobby','locked'].includes(room?.meta?.state))return;
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
  const members=rosterSnap.val()||{};
  // Include every connected student. Unconfirmed car choices are not exclusion criteria.
  const entries=Object.entries(members).filter(([,m])=>m?.profile?.name&&Object.keys(m.connections||{}).length);
  if(!entries.length)throw Error('접속 중인 학생이 한 명 이상 필요합니다.');
  if(entries.length>30)throw Error('레이싱은 최대 30명까지 참여할 수 있습니다.');
  const currentGarage=normalizedRacingGarage(garageSnap.val());
  const unselected=entries.filter(([uid])=>!currentGarage.byUid[uid]).length;
  const durationSec=Number($('racing-play-duration').value)||300,finishMeters=Number($('racing-play-distance').value)||20;
  if(!confirm(entries.length+'명, '+questions.length+'문항, 목표 '+finishMeters+'m, '+durationSec/60+'분으로 레이싱을 준비할까요?'+(unselected?'\n자동차 미확정 '+unselected+'명은 남은 차량 중 자동 배정됩니다.':'')))return;
  // Atomic allocation prevents duplicate cars even if a last-second claim is processed.
  const allocation=await runTransaction(ref(db,'v6/carRegistry/'+c),raw=>{
   const registry=normalizedRacingGarage(raw);
   const used=new Set(Object.keys(registry.slots));
   const free=Array.from({length:30},(_,i)=>String(i+1).padStart(2,'0')).filter(id=>!used.has(id));
   for(const [uid] of entries){
    if(registry.byUid[uid])continue;
    if(!free.length)return undefined;
    const index=Math.floor(Math.random()*free.length),carId=free.splice(index,1)[0];
    registry.slots[carId]=uid;registry.byUid[uid]=carId;
   }
   return registry;
  },{applyLocally:false});
  if(!allocation.committed)throw Error('남은 자동차가 부족합니다. 교사 화면에서 학생 수와 선택 현황을 확인해 주세요.');
  const byUid=normalizedRacingGarage(allocation.snapshot.val()).byUid;
  const roster=Object.fromEntries(entries.map(([uid,m])=>[uid,m.profile.name]));
  const decks=Object.fromEntries(entries.map(([uid])=>[uid,makeShuffleBag(questions.length,120)]));
  const scores=Object.fromEntries(entries.map(([uid,m])=>[uid,{...racingScore(m.profile.name,byUid[uid]),avatarId:m.profile.avatarId||'a01'}]));
  await update(ref(db),{
   ['v6/privateRuns/'+c]:{setId,title:source.val()?.title||'레이싱',questions,decks,roster,durationSec,finishMeters,createdAt:serverTimestamp(),answersLog:{}},
   ['v6/public/'+c]:{state:'lobby',ready:true,finishMeters,durationSec,scores,title:room.meta.title||'레이싱'},
   ['v2/rooms/'+c+'/meta/state']:'locked',
   ['v2/hostRooms/'+auth.currentUser.uid+'/'+c+'/state']:'locked'
  });
  notice('게임 준비 완료! '+(unselected?unselected+'명에게 남은 차량을 자동 배정했습니다. ':'')+'이제 「경주 시작」을 눌러 주세요.');
 }catch(e){notice('준비 오류: '+formatError(e),true)}
 finally{operation=false;render();}
}
async function start(){
 if(!code||operation||!run||pub?.state!=='lobby')return;
 operation=true;render();const c=code;
 try{
  // A blocked/suspended audio device must never delay the Firebase race start.
  void sound.unlock().then(ok=>{if(ok)sound.play('start')});
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
function publicLearningSummary(record,logs){
 const data={roster:record.roster||{},questions:record.questions||[],answersLog:logs||{}};
 const summarize=mode=>{
  const result=buildGoldAccuracy({...data,mode});
  return {
   summary:{correct:result.summary.correct,total:result.summary.total,rate:result.summary.rate},
   questions:result.questions.map(({number,prompt,correct,total,rate,students})=>({number,prompt,correct,total,rate,students}))
  };
 };
 // Only aggregate question statistics are public; never expose answers or other students' individual rates.
 return {version:1,first:summarize('first'),all:summarize('all')};
}
async function publishRaceResults(c,{endRace=false}={}){
 if(finalizing)throw Error('다른 결과 집계가 진행 중입니다. 다시 시도해 주세요.');
 if(!c||!run||!pub)return;
 if(pub.state==='finished'&&pub.learningResults)return;
 finalizing=true;
 try{
  const [privateSnap,publicSnap]=await Promise.all([
   get(ref(db,'v6/privateRuns/'+c)),get(ref(db,'v6/public/'+c))
  ]);
  if(c!==code)return;
  const record=privateSnap.val(),current=publicSnap.val();
  if(!record||!current)return;
  if(current.state!=='playing'&&current.state!=='finished')return;
  const learningResults=publicLearningSummary(record,record.answersLog||{});
  const changes={learningResults};
  if(endRace&&current.state==='playing'){
   changes.state='finished';changes.finishedAt=serverTimestamp();
  }
  await update(ref(db,'v6/public/'+c),changes);
 }finally{finalizing=false}
}
async function finish(){
 if(!code||operation||pub?.state!=='playing')return;
 operation=true;
 try{
  for(let i=0;i<100&&processing;i++)await new Promise(resolve=>setTimeout(resolve,40));
  if(processing)throw Error('진행 중인 채점이 완료되지 않았습니다. 다시 종료해 주세요.');
  const c=code;
  const [latestStates,latestAnswers]=await Promise.all([get(ref(db,'v6/memberState/'+c)),get(ref(db,'v6/answers/'+c))]);
  if(c!==code)throw Error('방이 변경되었습니다.');
  states=latestStates.val()||{};answers=latestAnswers.val()||{};
  await pump();
  await publishRaceResults(c,{endRace:true});
  notice('레이싱 종료! 학생용 정답률과 문항별 결과가 공개되었습니다.');
 }
 catch(e){notice('종료/결과 집계 오류: '+formatError(e),true)}
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
  const correctAnswer=!correct?(question.type==='typing'
    ?question.options.filter(Boolean).join(' / ')
    :`${displayedGoldCorrectIndex(question,state.optionOrder)}번 · ${question.options[Number(question.correctIndex)-1]||''}`):'';
  const next={...nextQuestion(uid,Number(state.sequence||0)+1,{answered:score.answered,correct:score.correct}),
    lastFeedback:{nonce,correct:!!correct,...(!correct?{correctAnswer}:{})}};
  // Only the submitting student and teacher can read this state.
  await runTransaction(ref(db,'v6/memberState/'+c+'/'+uid),old=>old?.nonce===nonce?next:undefined,{applyLocally:false});
  await update(ref(db),{['v6/privateRuns/'+c+'/answersLog/'+uid+'/'+nonce]:{
   questionIndex:Number(state.questionIndex),questionNumber:question.number,answer:String(submission.value),correct:!!correct,
   meters:Number(score.meters||0),bonus:Number(score.lastResult?.bonus||0),at:Number(submission.at||0)
  }});
  if(Number(score.meters||0)>=Number(pub.finishMeters||20)){
   await publishRaceResults(c,{endRace:true});
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
   if(!code||pub?.state!=='playing'||jobs>=50)break;
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
  if((name==='pub'||name==='run')&&pub?.state==='finished'&&!pub.learningResults&&run&&!finalizing){void publishRaceResults(c).catch(e=>notice('학생 학습 결과 게시 실패: '+formatError(e),true))}
 },err=>notice(name+' 읽기 실패: '+formatError(err),true)));
}
function bind(next,mode){
 if(next===code)return;
 stop();
 if(!/^\d{6}$/.test(next)||mode!=='racing')return;
 const user=auth.currentUser;if(!user||user.isAnonymous)return;
 code=next;$('racing-play-controls').hidden=false;
 watch(next);notice('레이싱 게임 준비를 기다리고 있습니다.');
 void loadSpriteImages().then(()=>{if(code===next){rankingSignature='';render()}}).catch(e=>notice('차량 이미지 오류: '+formatError(e),true));
}
function exportCsv(){
 if(!run||!code)return;
 const rows=[['이름','문항번호','학생 답안','정답여부','보너스(m)','현재 거리(m)']];
 for(const [uid,name] of Object.entries(run.roster||{}))
  for(const log of Object.values(run.answersLog?.[uid]||{}))rows.push([name,log.questionNumber,log.answer,log.correct?'정답':'오답',log.bonus||0,log.meters||0]);
 const csv='\ufeff'+rows.map(row=>row.map(escapeCsv).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='퍼플킷_레이싱_'+code+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
$('racing-play-prepare').addEventListener('click',()=>void prepare());
$('racing-play-start').addEventListener('click',()=>void start());
$('racing-play-audio').addEventListener('click',()=>void sound.toggle().then(()=>{if(code)render()}));
$('racing-play-end').addEventListener('click',()=>{if(confirm('현재 레이싱 경주를 종료할까요?'))void finish()});
$('racing-play-export').addEventListener('click',exportCsv);
$('racing-results-mode').addEventListener('change',e=>{resultsMode=e.target.value==='all'?'all':'first';renderRacingFinalResults({run,pub,mode:resultsMode,members:room?.members||{}});});
$('racing-play-focus-toggle').addEventListener('click',()=>setFocus(!focus));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&focus)setFocus(false)});
window.addEventListener('quizlab-room-open',e=>bind(e.detail?.code||'',e.detail?.mode||''));
window.addEventListener('quizlab-room-meta',e=>{
 const c=e.detail?.code||'',mode=e.detail?.meta?.mode||'';
 if(mode==='racing')bind(c,mode);else if(c===code)stop();
});
// Pick up answers that arrived while an earlier batch was being graded.
setInterval(()=>{if(code&&pub?.state==='playing')void pump()},350);
setInterval(()=>{if(pub?.state==='playing'&&code){
 $('racing-play-clock').textContent=Math.floor(Math.max(0,Math.ceil((Number(pub.endsAt||0)-Date.now())/1000))/60)+':'+String(Math.max(0,Math.ceil((Number(pub.endsAt||0)-Date.now())/1000))%60).padStart(2,'0');
 if(Number(pub.endsAt||0)>0&&Date.now()>Number(pub.endsAt||0)+500&&!operation)void finish();
}},1000);
