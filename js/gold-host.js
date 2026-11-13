import { auth, db, formatError } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { ref, get, onValue, update, serverTimestamp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import { makeShuffleBag, verifyGoldAnswer, chooseGoldOutcome, applyGoldOutcome, goldRanking } from './gold-core.js';
import { optionsArray, escapeCsv } from './classic-core.js';
import { normalizeQuestionImage } from './image-utils.js';
import { createAvatarImage } from './avatars.js';
import { createArcadeUi, renderPodium } from './arcade-ui.js';
import { makeRulesV4 } from './rules-v4.js';

const $=id=>document.getElementById(id);
const arcade=createArcadeUi('gold-focus',{role:'teacher',mode:'gold'});
let teacher=null,code='',room=null,run=null,pub=null,states={},answers={},picks={};
let ready=false,unsubs=[],processLock=false,operation=false,offset=0,focusOpen=false,checkToken=0;
let processingKeys=new Set(),previousRankSignature='',lastFinished=false;
const roomCode=()=>code;
function notify(text,type=''){$('gold-message').textContent=text;$('gold-message').dataset.kind=type;}
function stop(){for(const unsubscribe of unsubs)unsubscribe();unsubs=[];room=null;run=null;pub=null;states={};answers={};picks={};ready=false;processLock=false;processingKeys.clear();previousRankSignature='';lastFinished=false;focusOpen=false;$('gold-focus').hidden=true;document.body.classList.remove('quiz-stage-active');arcade.reset();}
function bindRoom(next){if(code===next&&ready)return;stop();code=next;render();if(code&&teacher)checkRights();}
function watch(){
  if(!ready||!teacher||!code)return;
  const c=code;
  for(const [path,key] of [
    [`v2/rooms/${c}`,'room'],[`v4/privateRuns/${c}`,'run'],[`v4/public/${c}`,'pub'],
    [`v4/memberState/${c}`,'states'],[`v4/answers/${c}`,'answers'],[`v4/picks/${c}`,'picks']
  ])unsubs.push(onValue(ref(db,path),snap=>{if(code!==c)return;
    const value=snap.val();
    if(key==='room')room=value;else if(key==='run')run=value;else if(key==='pub')pub=value;
    else if(key==='states')states=value||{};else if(key==='answers')answers=value||{};else picks=value||{};
    render();void pump();
  },err=>notify('골드 퀘스트 읽기 실패: '+formatError(err),'error')));
}
async function checkRights(){
  const token=++checkToken;
  try{await get(ref(db,'v4/versionCheck'));if(token!==checkToken||!teacher||!code)return;ready=true;$('gold-rules').hidden=true;watch();}
  catch(err){if(token!==checkToken)return;notify('v4 보안 규칙을 Firebase에 게시해 주세요. ('+formatError(err)+')','error');$('gold-rules').hidden=false;}
}
function rankRows(container,full=false){
  container.replaceChildren();
  const entries=goldRanking(pub?.scores||{});
  if(!entries.length){container.textContent='참가자와 보상 기록을 기다리고 있습니다.';return;}
  entries.forEach((item,i)=>{
    const row=document.createElement('div');row.className='gold-rank-row';
    const place=document.createElement('b');place.className='gold-rank-place';place.textContent=i<3?['🥇','🥈','🥉'][i]:`${i+1}위`;
    const avatar=createAvatarImage(item.avatarId,{size:full?'md':'sm',decorative:true});
    const copy=document.createElement('div');copy.className='gold-rank-name';
    const title=document.createElement('strong');title.textContent=item.name||'참가자';
    const caption=document.createElement('small');caption.textContent=`정답 ${item.correct||0} / 풀이 ${item.answered||0}`;
    copy.append(title,caption);
    const score=document.createElement('strong');score.className='gold-rank-gold';score.textContent=`${Number(item.gold||0).toLocaleString('ko-KR')} G`;
    row.append(place,avatar,copy,score);container.append(row);
  });
}
function render(){
  const isGold=Boolean(code&&room?.meta?.mode==='gold');
  $('gold-panel').hidden=!isGold;
  if(!isGold){$('gold-focus').hidden=true;document.body.classList.remove('quiz-stage-active');return;}
  $('gold-room-label').textContent=`${code} · ${room?.meta?.title||''} · ${room?.meta?.setTitle||'문제 미선택'}`;
  const state=pub?.state||'lobby';
  $('gold-status').textContent=({lobby:'대기실',ready:'게임 준비 완료',playing:'진행 중',finished:'게임 종료'})[state]||'대기 중';
  $('gold-status').className=`pill pill-${state==='playing'?'success':state==='finished'?'error':'neutral'}`;
  $('gold-prepare').disabled=!ready||operation||Boolean(run)||room.meta.state==='ended'||!room.meta.setId;
  $('gold-start').disabled=!ready||operation||!run||state!=='ready';
  $('gold-end').disabled=!ready||operation||state!=='playing';
  $('gold-export').disabled=!run;
  $('gold-focus-open').disabled=!run;
  $('gold-settings').hidden=Boolean(run);
  $('gold-count').textContent=`${Object.keys(run?.roster||{}).length}명 · ${run?.questions?.length||0}문항`;
  $('gold-live-count').textContent=`${Object.values(pub?.scores||{}).reduce((n,x)=>n+Number(x.answered||0),0)}회 풀이`;
  rankRows($('gold-live-ranking'));
  if(focusOpen)renderFocus();
}
function rankSummary(){return goldRanking(pub?.scores||{}).slice(0,3).map((r,i)=>`${i+1}위 ${r.name}: ${r.gold}G`).join(' · ');}
function renderFocus(){
  if(!focusOpen)return;
  $('gold-focus').hidden=false;document.body.classList.add('quiz-stage-active');
  const state=pub?.state||'ready';
  arcade.sync({state:state==='playing'?'question':state==='finished'?'finished':'ready',questionId:'gold-'+(pub?.startedAt||'')});
  $('gold-focus-state').textContent=state==='playing'?'보물 찾는 중!':state==='finished'?'게임 종료':'시작 준비';
  const time=state==='playing'?Math.max(0,Math.ceil((Number(pub.endsAt||0)-(Date.now()+offset))/1000)):0;
  $('gold-focus-clock').textContent=state==='playing'?`${Math.floor(time/60)}:${String(time%60).padStart(2,'0')}`:'—';
  $('gold-focus-lead').textContent=rankSummary()||'친구들의 도전을 기다리고 있습니다.';
  $('gold-focus-prepare').disabled=$('gold-prepare').disabled;
  $('gold-focus-start').disabled=$('gold-start').disabled;
  $('gold-focus-end').disabled=$('gold-end').disabled;
  rankRows($('gold-focus-ranking'),true);
  $('gold-focus-podium').hidden=state!=='finished';
  if(state==='finished'){
    const signature=JSON.stringify(goldRanking(pub?.scores||{}).slice(0,3));
    if(previousRankSignature!==signature){renderPodium($('gold-focus-podium'),goldRanking(pub?.scores||{}).map(x=>({...x,score:Number(x.gold||0)})));previousRankSignature=signature;}
  }
  if(state==='finished'&&!lastFinished){lastFinished=true;arcade.fanfare();}
}
function focus(open){focusOpen=open;$('gold-focus').hidden=!open;document.body.classList.toggle('quiz-stage-active',open);if(open)renderFocus();}
function shuffledQuestions(source){
  return Object.values(source?.questions||{}).sort((a,b)=>a.number-b.number).map(q=>({
    number:Number(q.number),prompt:String(q.prompt),type:q.type,timeLimit:Number(q.timeLimit)||30,
    options:optionsArray(q.options),correctIndex:Number(q.correctIndex||0),
    ...(q.imageUrl?{imageUrl:normalizeQuestionImage(q.imageUrl,new URL('./',location.href).href)}:{})
  }));
}
function messageForState(question,uid,seq,previous){
  const base={phase:'question',nonce:`a${seq}_${crypto.randomUUID().slice(0,12)}`,questionIndex:question.index,
    sequence:seq,number:question.number,prompt:question.prompt,type:question.type,
    options:question.type==='typing'?[]:question.options,imageUrl:question.imageUrl||'',
    answered:previous?.answered||0,correct:previous?.correct||0,
    lastMessage:previous?.lastMessage||'',lastCorrect:previous?.lastCorrect||''};
  return base;
}
function nextQuestionFor(uid,seq,old){
  const deck=run?.decks?.[uid]||[];
  const questions=Array.isArray(run?.questions)?run.questions:Object.values(run?.questions||{});
  if(seq>=deck.length)return {...old,phase:'waiting',nonce:`done_${seq}`,lastMessage:'준비한 문제를 모두 풀었습니다.',questionIndex:-1};
  const index=Number(deck[seq]);const q=questions[index];
  if(!q)return {...old,phase:'waiting',nonce:`done_${seq}`,questionIndex:-1};
  return messageForState({index,...q},uid,seq,old);
}
async function prepare(){
  if(operation||!ready||run||room?.meta?.mode!=='gold'||!room?.meta?.setId)return;
  operation=true;render();
  try{
    const source=(await get(ref(db,`v1/questionSets/${room.meta.setId}`))).val();
    const questions=shuffledQuestions(source);if(!questions.length)throw Error('문제 세트가 비어 있습니다.');
    const members=(await get(ref(db,`v2/rooms/${code}/members`))).val()||{};
    const roster=Object.fromEntries(Object.entries(members).filter(([,m])=>m?.profile?.name&&Object.keys(m.connections||{}).length>0).map(([uid,m])=>[uid,m.profile.name]));
    if(!Object.keys(roster).length)throw Error('먼저 학생 1명 이상 입장시켜 주세요.');
    if(!confirm(`${Object.keys(roster).length}명 / ${questions.length}문항 / ${$('gold-duration').value}분으로 준비할까요? 입장은 마감됩니다.`))return;
    const decks=Object.fromEntries(Object.keys(roster).map(uid=>[uid,makeShuffleBag(questions.length)]));
    const scores=Object.fromEntries(Object.entries(roster).map(([uid,name])=>[uid,{name,avatarId:members[uid]?.profile?.avatarId||'a01',gold:0,correct:0,answered:0}]));
    const durationSec=Number($('gold-duration').value)*60;
    const allowInteractions=$('gold-interactions').checked;
    const changes={
      [`v4/privateRuns/${code}`]:{setId:room.meta.setId,title:source.title||'골드 퀘스트',questions,decks,roster,durationSec,allowInteractions,createdAt:serverTimestamp()},
      [`v4/public/${code}`]:{state:'ready',durationSec,scores,title:room.meta.title||'골드 퀘스트',createdAt:serverTimestamp()},
      [`v2/rooms/${code}/meta/state`]:'locked',
      [`v2/hostRooms/${teacher.uid}/${code}/state`]:'locked'
    };
    await update(ref(db),changes);
    notify('골드 퀘스트 준비 완료! 게임 시작 버튼을 눌러 주세요.','success');
  }catch(err){notify('준비 오류: '+formatError(err),'error');}finally{operation=false;render();}
}
async function start(){
  if(operation||!run||pub?.state!=='ready')return;
  operation=true;arcade.armEffects();
  try{
    const now=Date.now()+offset;
    const changes={
      [`v4/public/${code}/state`]:'playing',
      [`v4/public/${code}/startedAt`]:serverTimestamp(),
      [`v4/public/${code}/endsAt`]:now+Number(run.durationSec||300)*1000
    };
    for(const uid of Object.keys(run.roster||{})){
      const idx=Number(run.decks?.[uid]?.[0]||0),q=run.questions[idx];
      if(!q)continue;
      changes[`v4/memberState/${code}/${uid}`]=messageForState({index:idx,...q},uid,0,{answered:0,correct:0});
    }
    await update(ref(db),changes);
    arcade.newGameMusic();focus(true);notify('게임을 시작했습니다! 교사 브라우저를 열어 두세요.','success');
  }catch(err){notify('시작 오류: '+formatError(err),'error');}finally{operation=false;render();}
}
async function finish(){
  if(operation||pub?.state!=='playing')return;
  operation=true;
  try{
    // Force scoreboard refresh only from teacher-controlled data.
    await update(ref(db,`v4/public/${code}`),{state:'finished',finishedAt:serverTimestamp()});
    notify('게임 종료! 골드 순위와 시상대를 확인하세요.','success');
    focus(true);
  }catch(err){notify('종료 오류: '+formatError(err),'error');}finally{operation=false;render();}
}
function pickTarget(actorUid){
  const scores=pub?.scores||{};const own=Number(scores[actorUid]?.gold||0);
  const higher=Object.entries(scores).filter(([uid,x])=>uid!==actorUid&&Number(x.gold||0)>own);
  const candidate=higher.length?higher:Object.entries(scores).filter(([uid])=>uid!==actorUid);
  return candidate.length?candidate[Math.floor(Math.random()*candidate.length)][0]:'';
}
function newNonce(){return `a${crypto.randomUUID().replace(/-/g,'').slice(0,15)}`;}
async function processAnswer(uid,state,submission){
  const key=`answer/${uid}/${state.nonce}`;if(processingKeys.has(key))return;
  processingKeys.add(key);
  try{
    if(pub?.state!=='playing'||!run||!submission?.value)return;
    const q=run.questions?.[state.questionIndex];if(!q)return;
    const correct=verifyGoldAnswer(q,submission.value);
    const old=pub?.scores?.[uid];if(!old)return;
    const nextScore={...old,answered:Number(old.answered||0)+1,correct:Number(old.correct||0)+(correct?1:0)};
    const oldState={...state,answered:nextScore.answered,correct:nextScore.correct,
      lastMessage:correct?'✨ 정답입니다! 보물상자를 골라 주세요.':`다음 문제에 도전하세요! 정답: ${q.type==='typing'?q.options.filter(Boolean).join(' / '):q.options[Number(q.correctIndex)-1]}`,
      lastCorrect:correct?'yes':'no'};
    const next=correct?{...oldState,phase:'treasure'}:nextQuestionFor(uid,Number(state.sequence||0)+1,oldState);
    // Wrong answer gets a fresh question, correct answer needs a treasure pick.
    await update(ref(db),{
      [`v4/memberState/${code}/${uid}`]:next,
      [`v4/public/${code}/scores/${uid}`]:nextScore,
      [`v4/privateRuns/${code}/answersLog/${uid}/${state.nonce}`]:{
        questionNumber:q.number,questionIndex:state.questionIndex,correct,
        value:String(submission.value),at:Number(submission.at)||Date.now()
      }
    });
    states[uid]=next;pub.scores[uid]=nextScore;
  }catch(err){processingKeys.delete(key);notify('채점 처리 오류: '+formatError(err),'error');}
}
async function processTreasure(uid,state,pick){
  const key=`pick/${uid}/${state.nonce}`;if(processingKeys.has(key))return;
  processingKeys.add(key);
  try{
    if(pub?.state!=='playing'||!run||!pick?.choice)return;
    const current=pub?.scores||{};
    if(!current[uid])return;
    const outcome=chooseGoldOutcome(Math.random,{allowInteractions:run.allowInteractions!==false,playerCount:Object.keys(current).length});
    const target=['steal','swap'].includes(outcome.type)?pickTarget(uid):'';
    const result=applyGoldOutcome(current,uid,outcome,target);
    const after={...state,lastMessage:`🎁 ${result.message}`,lastCorrect:'reward'};
    const next=nextQuestionFor(uid,Number(state.sequence||0)+1,after);
    const changes={
      [`v4/memberState/${code}/${uid}`]:next,
      [`v4/privateRuns/${code}/treasuresLog/${uid}/${state.nonce}`]:{choice:Number(pick.choice),type:outcome.type,targetUid:target||'',gained:result.gained,description:result.message}
    };
    for(const changed of result.affected)changes[`v4/public/${code}/scores/${changed}`]=result.scores[changed];
    changes[`v4/public/${code}/lastEvent`]={
      at:serverTimestamp(),type:outcome.type,actorUid:uid,targetUid:target||'',message:result.message
    };
    await update(ref(db),changes);
    states[uid]=next;
    for(const changed of result.affected)pub.scores[changed]=result.scores[changed];
  }catch(err){processingKeys.delete(key);notify('보물 처리 오류: '+formatError(err),'error');}
}
async function pump(){
  if(processLock||!ready||!run||pub?.state!=='playing'||!code)return;
  processLock=true;
  try{
    const ids=Object.keys(run?.roster||{});
    for(const uid of ids){
      if(pub?.state!=='playing')break;
      const state=states?.[uid];if(!state?.nonce)continue;
      if(state.phase==='question'&&answers?.[uid]?.[state.nonce])await processAnswer(uid,state,answers[uid][state.nonce]);
      else if(state.phase==='treasure'&&picks?.[uid]?.[state.nonce])await processTreasure(uid,state,picks[uid][state.nonce]);
    }
  }finally{processLock=false;}
}
function clockTick(){
  if(!ready||!code||!run||pub?.state!=='playing')return;
  const seconds=Math.ceil((Number(pub.endsAt||0)-(Date.now()+offset))/1000);
  $('gold-time').textContent=`${Math.floor(Math.max(0,seconds)/60)}:${String(Math.max(0,seconds)%60).padStart(2,'0')}`;
  if(focusOpen)$('gold-focus-clock').textContent=$('gold-time').textContent;
  if(seconds<=0&&!operation&&!processLock){void finish();}
}
function downloadCsv(){
  if(!run)return;
  const rows=[['학생','문항번호','제출 답','정답 여부','골드 결과','보상 변화']];
  for(const [uid,name] of Object.entries(run.roster||{})){
    const attempts=run.answersLog?.[uid]||{},rewards=run.treasuresLog?.[uid]||{};
    for(const [nonce,info] of Object.entries(attempts))rows.push([name,info.questionNumber,info.value,info.correct?'정답':'오답',rewards[nonce]?.description||'',rewards[nonce]?.gained??'']);
  }
  const csv='\ufeff'+rows.map(row=>row.map(escapeCsv).join(',')).join('\r\n');
  const a=document.createElement('a'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.href=url;a.download=`퍼플킷_골드퀘스트_${code}.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function applyTeacher(user){
  const next=user?.providerData?.some(x=>x.providerId==='google.com')?user:null;
  if(teacher?.uid===next?.uid)return;
  teacher=next;stop();if(teacher&&code)checkRights();
}
window.addEventListener('quizlab-room-open',event=>bindRoom(event.detail?.code||''));
if(window.__purplekitOpenRoomCode)bindRoom(window.__purplekitOpenRoomCode);
if(auth)onAuthStateChanged(auth,applyTeacher);
if(db)onValue(ref(db,'.info/serverTimeOffset'),snap=>offset=Number(snap.val()||0));
$('gold-prepare').addEventListener('click',()=>void prepare());
$('gold-start').addEventListener('click',()=>void start());
$('gold-end').addEventListener('click',()=>{if(confirm('골드 퀘스트를 지금 종료할까요?'))void finish();});
$('gold-export').addEventListener('click',downloadCsv);
$('gold-focus-open').addEventListener('click',()=>focus(true));
$('gold-focus-close').addEventListener('click',()=>focus(false));
$('gold-focus-prepare').addEventListener('click',()=>void prepare());
$('gold-focus-start').addEventListener('click',()=>void start());
$('gold-focus-end').addEventListener('click',()=>{if(confirm('골드 퀘스트를 종료할까요?'))void finish();});
$('gold-copy-rules').addEventListener('click',async()=>{
  if(!teacher)return;
  try{await navigator.clipboard.writeText(makeRulesV4(teacher.uid));notify('v4 통합 규칙을 복사했습니다. Firebase Realtime Database → 규칙에 게시하세요.','success');}
  catch(err){notify('규칙 복사 실패: '+formatError(err),'error');}
});
$('gold-download-rules').addEventListener('click',()=>{
  if(!teacher)return;
  const contents=makeRulesV4(teacher.uid);
  const url=URL.createObjectURL(new Blob([contents],{type:'application/json;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download='database.rules.json';
  document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  notify('v4 규칙 JSON을 다운로드했습니다. Firebase에 게시한 내용과 GitHub 규칙 파일을 일치시켜 주세요.','success');
});
setInterval(clockTick,500);
// Process answers arriving while a prior batch is in flight.
// Firebase callbacks can fire during an awaited write; polling closes that small scheduling gap.
setInterval(()=>{if(pub?.state==='playing')void pump();},250);
render();
