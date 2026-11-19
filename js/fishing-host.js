// Purplekit v5.0 — teacher-authoritative Fishing Frenzy.
import {auth,db,formatError} from './firebase.js';
import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import {ref,get,onValue,update,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import {makeShuffleBag,verifyGoldAnswer,shuffleGoldChoices} from './gold-core.js';
import {optionsArray,escapeCsv} from './classic-core.js';
import {normalizeQuestionImage} from './image-utils.js';
import {freshScore,resolveCatch,fishingRanking,FISHING_PENALTY_COOLDOWN_MS,FISHING_PENALTY_DURATION_MS} from './fishing-core.js?v=5.0.8';
import {makeRulesV5} from './rules-v5.js';
const $=id=>document.getElementById(id);
let teacher=null,code='',mode='',room=null,run=null,pub=null,states={},actions={},answers={},rights=false,operation=false,working=false,offset=0;
let subs=[],authVersion=0,focusOpen=false;
const serverNow=()=>Date.now()+offset;
function status(msg,err=false){const el=$('fishing-host-message');el.textContent=msg;el.dataset.kind=err?'error':'success';}
function stop(){focus(false);subs.forEach(fn=>fn());subs=[];room=null;run=null;pub=null;states={};actions={};answers={};rights=false;}
function formatClock(sec){const n=Math.max(0,Math.ceil(sec));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;}
function phaseDescription(uid,score){
  const state=states?.[uid],phase=state?.phase;
  if(!state)return {label:'시작 대기',tone:'idle'};
  const hasAnswer=Boolean(state.nonce&&answers?.[uid]?.[state.nonce]);
  const seconds=Number(state.phaseAt)>0?Math.max(0,Math.round((serverNow()-state.phaseAt)/1000)):0;
  if(phase==='cast')return {label:'낚싯대 투척 대기',tone:'idle'};
  if(phase==='bite')return {label:'입질 대기 / HIT',tone:'idle'};
  if(phase==='question'&&hasAnswer)return {label:`답안 제출 · 채점 대기${seconds>=10?` (${seconds}초)`:''}`,tone:seconds>=15?'warn':'pending'};
  if(phase==='question')return {label:`문제 풀이 중${seconds>=60?` (${seconds}초)`:''}`,tone:seconds>=90?'warn':'normal'};
  if(phase==='result')return {label:'결과 확인 / 다음 낚시 대기',tone:'done'};
  if(phase==='waiting')return {label:'문제 완료',tone:'done'};
  return {label:'상태 확인 중',tone:'idle'};
}
function renderMonitor(target){
  const container=$(target);container.replaceChildren();
  const roster=run?.roster||Object.fromEntries(Object.entries(pub?.scores||{}).map(([id,s])=>[id,s.name||'학생']));
  const entries=Object.entries(roster).map(([uid,name])=>({uid,name,state:phaseDescription(uid,pub?.scores?.[uid]),score:pub?.scores?.[uid]||{}}));
  entries.sort((a,b)=>(a.state.tone==='warn'?0:a.state.tone==='pending'?1:2)-(b.state.tone==='warn'?0:b.state.tone==='pending'?1:2)||a.name.localeCompare(b.name,'ko'));
  for(const item of entries){
    const row=document.createElement('div');row.className='fishing-monitor-row';row.dataset.tone=item.state.tone;
    const name=document.createElement('strong');name.textContent=item.name;
    const state=document.createElement('span');state.className='fishing-monitor-phase';state.textContent=item.state.label;
    const count=document.createElement('small');count.textContent=`정답 ${Number(item.score.correct||0)} / 풀이 ${Number(item.score.answered||0)} · Lv.${Number(item.score.level||1)}`;
    row.append(name,state,count);container.append(row);
  }
  if(!entries.length)container.textContent='게임 준비 후 학생 진행 상태가 표시됩니다.';
}
function focus(open){
  focusOpen=Boolean(open);$('fishing-focus').hidden=!focusOpen;
  document.body.classList.toggle('quiz-stage-active',focusOpen);
  if(focusOpen)render();
}
function render(){
  const active=Boolean(code&&(mode==='fishing'||room?.meta?.mode==='fishing'));
  $('fishing-panel').hidden=!active;
  if(!active)return;
  const phase=pub?.state||'lobby';
  $('fishing-host-badge').textContent=({lobby:'대기 중',ready:'시작 준비',playing:'진행 중',finished:'종료'})[phase]||'대기 중';
  $('fishing-host-room').textContent=code?`${code} · ${room?.meta?.title||'게임방'} · ${room?.meta?.setTitle||'문제 미선택'}`:'게임방을 선택해 주세요.';
  $('fishing-prepare').disabled=!rights||operation||!!run||!room?.meta?.setId||room.meta.state==='ended';
  $('fishing-start').disabled=!rights||operation||!run||phase!=='ready';
  $('fishing-end').disabled=!rights||operation||phase!=='playing';
  $('fishing-export').disabled=!run;
  $('fishing-rules').hidden=rights;
  const sec=phase==='playing'?(Number(pub?.endsAt||0)-serverNow())/1000:phase==='ready'?Number(run?.durationSec||0):0;
  $('fishing-host-clock').textContent=formatClock(sec);
  $('fishing-host-count').textContent=`${Object.keys(pub?.scores||{}).length}명`;
  $('fishing-host-solved').textContent=`${Object.values(pub?.scores||{}).reduce((n,s)=>n+Number(s.answered||0),0)}회 풀이`;
  const list=$('fishing-host-ranking');list.replaceChildren();
  fishingRanking(pub?.scores).forEach((s,i)=>{
    const row=document.createElement('div');row.className='fishing-rank-row';
    const left=document.createElement('span');left.textContent=`${i<3?['🥇','🥈','🥉'][i]:i+1+'위'}  ${s.name||'학생'} · 루어 ${s.level}단계 · 🎣 ${s.durability}/5`;
    const right=document.createElement('strong');right.textContent=`${Number(s.kg||0).toFixed(1)} kg`;
    row.append(left,right);list.append(row);
  });
  if(!list.children.length)list.textContent='게임을 준비하면 학생 순위가 표시됩니다.';
  renderMonitor('fishing-host-monitor');
  if(focusOpen){
    $('fishing-focus-room').textContent=$('fishing-host-room').textContent;
    $('fishing-focus-clock').textContent=$('fishing-host-clock').textContent;
    $('fishing-focus-count').textContent=$('fishing-host-count').textContent+' 참여';
    $('fishing-focus-solved').textContent=$('fishing-host-solved').textContent;
    $('fishing-focus-pending').textContent='채점 대기 '+Object.entries(states||{}).filter(([id,st])=>st?.phase==='question'&&Boolean(answers?.[id]?.[st.nonce])).length+'명';
    const focusRanks=$('fishing-focus-ranking');focusRanks.replaceChildren(...Array.from(list.children).map(row=>row.cloneNode(true)));
    renderMonitor('fishing-focus-monitor');
  }
}
function watch(){
  if(!teacher||!code||!rights)return;
  const c=code;
  for(const [key,path] of [['room',`v2/rooms/${c}`],['run',`v5/privateRuns/${c}`],['pub',`v5/public/${c}`],['states',`v5/memberState/${c}`],['actions',`v5/actions/${c}`],['answers',`v5/answers/${c}`]]){
    subs.push(onValue(ref(db,path),snap=>{
      if(code!==c)return;
      const val=snap.val();
      if(key==='room')room=val;
      else if(key==='run')run=val;
      else if(key==='pub')pub=val;
      else if(key==='states')states=val||{};
      else if(key==='actions')actions=val||{};
      else if(key==='answers')answers=val||{};
      if(['room','run','pub','states','answers'].includes(key))render();
      void pump();
    },err=>status('피싱 프렌지 데이터 읽기 실패: '+formatError(err),true)));
  }
}
async function selectRoom(next,hint=''){
  if(code===next&&mode===hint)return;
  stop();code=next;mode=hint;render();
  if(!teacher||!code)return;
  const stamp=++authVersion;
  status('Firebase v5 권한을 확인하고 있습니다.');
  try{
    await get(ref(db,'v5/versionCheck'));
    if(stamp!==authVersion||!teacher||!code)return;
    rights=true;watch();render();status('피싱 프렌지 사용 준비 완료! 먼저 학생들이 입장하면 게임 준비를 눌러 주세요.');
  }catch(err){if(stamp===authVersion)status('v5 통합 보안 규칙을 Firebase에 게시해야 합니다: '+formatError(err),true);}
}
function questionsFromSet(source){
  return Object.values(source?.questions||{}).sort((a,b)=>a.number-b.number).map(q=>({
    number:Number(q.number),prompt:String(q.prompt||''),type:q.type,timeLimit:Number(q.timeLimit)||30,
    options:optionsArray(q.options),correctIndex:Number(q.correctIndex||0),
    ...(q.imageUrl?{imageUrl:normalizeQuestionImage(q.imageUrl,new URL('./',location.href).href)}:{})
  }));
}
function makeCast(uid,index,score,previous=null){
  const deck=run?.decks?.[uid]||[],questions=Array.isArray(run?.questions)?run.questions:Object.values(run?.questions||{});
  if(index>=deck.length)return {phase:'waiting',nonce:`done_${index}`,sequence:index,questionIndex:-1};
  const qIndex=Number(deck[index]),q=questions[qIndex];
  if(!q)return {phase:'waiting',nonce:`done_${index}`,sequence:index,questionIndex:-1};
  const optionHistory={...(previous?.optionHistory||{})};
  const shuffled=q.type==='typing'?null:shuffleGoldChoices(q.options,optionHistory[qIndex],Math.random,q.correctIndex);
  if(shuffled)optionHistory[qIndex]=shuffled.history;
  return {phase:'cast',phaseAt:serverNow(),nonce:`f${index}_${crypto.randomUUID().slice(0,12)}`,sequence:index,questionIndex:qIndex,
    number:q.number,prompt:q.prompt,type:q.type,imageUrl:q.imageUrl||'',
    options:shuffled?shuffled.options:[],...(shuffled?{optionOrder:shuffled.optionOrder}:{}),optionHistory,
    upgrade:Number(score.progress||0)>=Number(score.nextUpgradeAt||3)};
}
async function prepare(){
  if(operation||!rights||run||room?.meta?.mode!=='fishing'||!room.meta.setId)return;
  operation=true;render();
  try{
    const source=(await get(ref(db,`v1/questionSets/${room.meta.setId}`))).val();
    const questions=questionsFromSet(source);
    if(!questions.length)throw Error('선택한 문제 세트가 비어 있습니다.');
    const members=(await get(ref(db,`v2/rooms/${code}/members`))).val()||{};
    const roster=Object.fromEntries(Object.entries(members).filter(([,v])=>v?.profile?.name&&Object.keys(v.connections||{}).length).map(([uid,v])=>[uid,v.profile.name]));
    if(!Object.keys(roster).length)throw Error('학생을 1명 이상 입장시켜 주세요.');
    const durationSec=Number($('fishing-duration').value)*60;
    if(!confirm(`${Object.keys(roster).length}명 / ${questions.length}문항 / ${durationSec/60}분으로 피싱 프렌지를 준비할까요?`))return;
    const decks=Object.fromEntries(Object.keys(roster).map(uid=>[uid,makeShuffleBag(questions.length)]));
    const scores=Object.fromEntries(Object.entries(roster).map(([uid,name])=>[uid,freshScore(name,members[uid]?.profile?.avatarId||'a01')]));
    await update(ref(db),{
      [`v5/privateRuns/${code}`]:{setId:room.meta.setId,title:source.title||'피싱 프렌지',questions,decks,roster,durationSec,createdAt:serverTimestamp()},
      [`v5/public/${code}`]:{state:'ready',durationSec,scores,title:room.meta.title||'피싱 프렌지',lastPenaltyAt:0,createdAt:serverTimestamp()},
      [`v2/rooms/${code}/meta/state`]:'locked',
      [`v2/hostRooms/${teacher.uid}/${code}/state`]:'locked'
    });
    status('준비 완료! 모든 학생이 입장했는지 확인하고 시작을 눌러 주세요.');
  }catch(err){status('준비 실패: '+formatError(err),true);}finally{operation=false;render();}
}
async function start(){
  if(operation||!run||pub?.state!=='ready')return;
  operation=true;render();
  try{
    const endsAt=serverNow()+Number(run.durationSec||420)*1000;
    const patches={
      [`v5/public/${code}/state`]:'playing',
      [`v5/public/${code}/startedAt`]:serverTimestamp(),
      [`v5/public/${code}/endsAt`]:endsAt
    };
    for(const [uid,name] of Object.entries(run.roster||{})){
      const old=pub?.scores?.[uid];
      if(!old)continue;
      patches[`v5/memberState/${code}/${uid}`]=makeCast(uid,0,old);
    }
    await update(ref(db),patches);
    status('낚시를 시작했습니다! 교사 화면을 게임 종료까지 열어 두세요.');
  }catch(err){status('시작 실패: '+formatError(err),true);}finally{operation=false;render();}
}
async function finish(){
  if(operation||pub?.state!=='playing')return;
  operation=true;
  try{
    // Block fresh submissions before processing the final leaderboard.
    await update(ref(db,`v5/public/${code}`),{state:'finished',finishedAt:serverTimestamp()});
    status('피싱 프렌지가 종료됐습니다. 누적 무게 순위와 CSV를 확인해 주세요.');
  }catch(err){status('종료 실패: '+formatError(err),true);}finally{operation=false;render();}
}
async function handleAction(uid,state,type){
  const now=serverNow();
  if(type==='hook'&&now<Number(state.biteAt||Infinity))return;
  const expected=type==='cast'?'cast':type==='hook'?'bite':'result';
  const nextPhase=type==='cast'?'bite':type==='hook'?'question':'cast';
  // Prepare a new state only when the student explicitly continues after the result.
  const score=pub?.scores?.[uid];
  if(type==='next'&&!score)return;
  const draft=type==='next'?makeCast(uid,Number(state.sequence||0)+1,score,state):null;
  const nextAt=now+1000+Math.floor(Math.random()*2001);
  await runTransaction(ref(db,`v5/memberState/${code}/${uid}`),current=>{
    if(!current||current.nonce!==state.nonce||current.phase!==expected)return;
    if(type==='next')return draft;
    return {...current,phase:nextPhase,phaseAt:now,...(type==='cast'?{biteAt:nextAt}:{})};
  },{applyLocally:false});
}
async function handleAnswer(uid,state,answer){
  if(!answer?.value||!run?.questions?.[state.questionIndex])return;
  const q=run.questions[state.questionIndex],nonce=state.nonce;
  const correct=verifyGoldAnswer(q,answer.value,state.optionOrder);
  // Re-create the same random sequence on every transaction retry.
  const randomSeed=new Uint32Array(1);crypto.getRandomValues(randomSeed);
  const seed=randomSeed[0];
  const seededRandom=()=>{let s=seed>>>0;return ()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return s/4294967296;};};
  const now=serverNow();
  const tx=await runTransaction(ref(db,`v5/public/${code}`),current=>{
    if(!current||current.state!=='playing'||Number(answer.at||0)>Number(current.endsAt||0)+200||Number(answer.at||0)<Number(current.startedAt||0)-200)return;
    const score=current.scores?.[uid];
    if(!score||score.lastAnswerNonce===nonce)return;
    const rng=seededRandom();
    const last=Number(current.lastPenaltyAt||0);
    const canPenalty=Object.keys(current.scores||{}).length>1&&now>=last+FISHING_PENALTY_COOLDOWN_MS;
    const {score:next,result}=resolveCatch(score,{correct,upgrade:!!state.upgrade,canPenalty,rng});
    next.lastAnswerNonce=nonce;next.lastResult={...result,nonce};
    const updated={...current,scores:{...current.scores,[uid]:next}};
    if(result.type==='penalty'){
      updated.lastPenaltyAt=now;
      updated.penaltyEvent={id:`${uid}_${nonce}`,actorUid:uid,effect:result.effect,at:now,durationMs:FISHING_PENALTY_DURATION_MS};
    }
    return updated;
  },{applyLocally:false});
  const saved=tx.snapshot.val()?.scores?.[uid];
  if(!saved||saved.lastAnswerNonce!==nonce){
    // The previous transaction may have completed before the browser reconnected.
    const remote=(await get(ref(db,`v5/public/${code}/scores/${uid}`))).val();
    if(remote?.lastAnswerNonce!==nonce)return;
    await publishResult(uid,state,q,answer,remote,correct);return;
  }
  await publishResult(uid,state,q,answer,saved,correct);
}
async function publishResult(uid,state,q,answer,score,correct){
  if(score.lastAnswerNonce!==state.nonce)return;
  const next={...state,phase:'result',phaseAt:serverNow(),result:score.lastResult};
  await update(ref(db),{
    [`v5/memberState/${code}/${uid}`]:next,
    [`v5/privateRuns/${code}/answersLog/${uid}/${state.nonce}`]:{
      questionNumber:q.number,questionIndex:state.questionIndex,correct,
      value:String(answer.value),upgrade:Boolean(state.upgrade),at:Number(answer.at)||serverNow()
    }
  });
}
function nextJob(seen){
  for(const uid of Object.keys(run?.roster||{})){
    const state=states?.[uid];if(!state?.nonce)continue;
    const action=actions?.[uid]?.[state.nonce]||{};
    const answer=answers?.[uid]?.[state.nonce];
    const key=`${uid}/${state.nonce}/${state.phase}`;
    if(seen.has(key))continue;
    if(state.phase==='cast'&&action.cast)return {uid,state,type:'cast',key};
    if(state.phase==='bite'&&action.hook&&serverNow()>=Number(state.biteAt||Infinity))return {uid,state,type:'hook',key};
    if(state.phase==='question'&&answer)return {uid,state,type:'answer',answer,key};
    if(state.phase==='result'&&action.next)return {uid,state,type:'next',key};
  }
  return null;
}
async function pump(){
  if(working||!rights||!run||!code||pub?.state!=='playing')return;
  working=true;const seen=new Set();
  try{
    const limit=Math.max(40,Object.keys(run.roster||{}).length*4);
    for(let i=0;i<limit;i++){
      const job=nextJob(seen);if(!job)break;seen.add(job.key);
      try{
        if(job.type==='answer')await handleAnswer(job.uid,job.state,job.answer);
        else await handleAction(job.uid,job.state,job.type);
      }catch(err){status(`학생 처리 오류 (${job.type}): `+formatError(err),true);}
    }
  }finally{working=false;}
}
function exportCsv(){
  if(!run)return;
  const rows=[['학생','문항 번호','제출 답','정답 여부','강화 문제','낚싯대 결과','현재 총무게(kg)']];
  for(const [uid,name] of Object.entries(run.roster||{})){
    for(const log of Object.values(run.answersLog?.[uid]||{}))rows.push([name,log.questionNumber,log.value,log.correct?'정답':'오답',log.upgrade?'예':'아니오','',pub?.scores?.[uid]?.kg||0]);
  }
  const text='\ufeff'+rows.map(r=>r.map(escapeCsv).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`퍼플킷_피싱프렌지_${code}.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
window.addEventListener('quizlab-room-open',event=>{void selectRoom(event.detail?.code||'',event.detail?.mode||'');});
window.addEventListener('quizlab-room-meta',event=>{
  if(event.detail?.code===code&&event.detail.meta){room={...(room||{}),meta:event.detail.meta};mode=event.detail.meta.mode||mode;render();}
});
if(auth)onAuthStateChanged(auth,user=>{
  teacher=user?.providerData?.some(x=>x.providerId==='google.com')?user:null;
  if(teacher&&code){const previous=code;code='';void selectRoom(previous,mode);}else if(!teacher){stop();render();}
});
if(db)onValue(ref(db,'.info/serverTimeOffset'),snap=>{offset=Number(snap.val()||0);});
$('fishing-prepare').addEventListener('click',()=>void prepare());
$('fishing-start').addEventListener('click',()=>void start());
$('fishing-focus-open').addEventListener('click',()=>focus(true));
$('fishing-focus-close').addEventListener('click',()=>focus(false));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&focusOpen)focus(false);});
$('fishing-end').addEventListener('click',()=>{if(confirm('피싱 프렌지를 지금 종료할까요?'))void finish();});
$('fishing-export').addEventListener('click',exportCsv);
$('fishing-copy-rules').addEventListener('click',async()=>{
  if(!teacher){status('교사 로그인이 필요합니다.',true);return;}
  try{await navigator.clipboard.writeText(makeRulesV5(teacher.uid));status('v5 통합 규칙을 복사했습니다. Firebase Realtime Database 규칙에 게시해 주세요.');}
  catch(err){status('복사 실패: '+formatError(err),true);}
});
$('fishing-download-rules').addEventListener('click',()=>{
  if(!teacher)return;
  const url=URL.createObjectURL(new Blob([makeRulesV5(teacher.uid)],{type:'application/json;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='database.rules.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
setInterval(()=>{
  if(pub?.state==='playing'){
    const left=(Number(pub.endsAt||0)-serverNow())/1000;
    $('fishing-host-clock').textContent=formatClock(left);
    if(focusOpen)$('fishing-focus-clock').textContent=formatClock(left);
    if(left<=-1.5&&!operation&&!working)void finish();else void pump();
  }
},250);
setInterval(()=>{if(focusOpen&&pub?.state==='playing')renderMonitor('fishing-focus-monitor');},5000);
render();
