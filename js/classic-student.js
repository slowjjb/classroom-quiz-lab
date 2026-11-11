// 퀴즈 실험실 v3.3 — 대기실 대신 전용 큰 화면을 사용하는 클래식 학생 화면.
// 모든 채점/공개 결과는 교사 브라우저가 보낸 읽기 전용 v3/public 경로에서 받습니다.
import { db, formatError } from './firebase.js';
import { ref, onValue, set, serverTimestamp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import { ranking } from './classic-core.js?v=3.3';
import { fullQuestionImageUrl } from './image-utils.js?v=3.3';
import { createArcadeUi, renderPodium } from './arcade-ui.js?v=3.3';

const $ = id => document.getElementById(id);
const arcade = createArcadeUi('quiz-panel', {role:'student'});
let code = '', uid = '', round = null, ownAnswer = null, ownGrade = null;
let scores = {}, sending = false, clockOffset = 0, currentRoundId = null;
let resultsOpen = false, finishedDismissed = false, unsub = [], unanswer = null, ungrade = null;
let selectedChoice='', typedDraft='';
const stateLabels = {ready:'게임 준비', question:'문제 풀이', paused:'일시 정지', reveal:'정답 공개', finished:'게임 종료'};
function setVisible(id, show) { $(id).hidden = !show; }
function notify(text, kind = '') { const el=$('quiz-message');el.textContent=text;el.dataset.kind=kind; }
function showError(text) { const el=$('quiz-stage-error');el.textContent=text;el.hidden=false; }
function clearSubscriptions(){
  for(const stop of unsub)stop();unsub=[];
  if(unanswer){unanswer();unanswer=null;}if(ungrade){ungrade();ungrade=null;}
  round=null;ownAnswer=null;ownGrade=null;currentRoundId=null;scores={};sending=false;resultsOpen=false;finishedDismissed=false;selectedChoice='';typedDraft='';
}
export function stopQuizView(){
  clearSubscriptions();arcade.reset();code='';uid='';setVisible('quiz-panel',false);
  document.body.classList.remove('quiz-stage-active');
}
export function startQuizView(nextCode,nextUid){
  if(!nextCode||!nextUid)return;
  if(nextCode===code && nextUid===uid)return;
  stopQuizView();code=nextCode;uid=nextUid;
  const activeCode=code,activeUid=uid;
  unsub.push(onValue(ref(db,`v3/public/${activeCode}`),snap=>{
    if(code!==activeCode||uid!==activeUid)return;
    const next=snap.val(),newId=next?.roundId||null;
    if(newId!==currentRoundId){
      currentRoundId=newId;ownAnswer=null;ownGrade=null;resultsOpen=false;finishedDismissed=false;selectedChoice='';typedDraft='';$('quiz-options').replaceChildren();
      subscribePersonal();
    }
    round=next;
    if((round?.state==='reveal'||round?.state==='finished')&&!ungrade)subscribeGrade();
    render();
  },err=>showError('퀴즈 문제를 불러오지 못했습니다: '+formatError(err))));
  unsub.push(onValue(ref(db,`v3/scores/${activeCode}`),snap=>{
    if(code!==activeCode)return;
    scores=snap.val()||{};render();
  },err=>showError('순위 조회 실패: '+formatError(err))));
}
function subscribePersonal(){
  if(unanswer){unanswer();unanswer=null;}if(ungrade){ungrade();ungrade=null;}
  const id=currentRoundId;if(!id)return;
  const c=code,u=uid;
  unanswer=onValue(ref(db,`v3/answers/${c}/${id}/${u}`),snap=>{
    if(code!==c||currentRoundId!==id)return;
    ownAnswer=snap.val();render();
  },err=>showError('내 제출 기록 확인 실패: '+formatError(err)));
}
function subscribeGrade(){
  if(ungrade){ungrade();ungrade=null;}if(!currentRoundId)return;
  const c=code,u=uid,id=currentRoundId;
  ungrade=onValue(ref(db,`v3/grades/${c}/${id}/${u}`),snap=>{
    if(code!==c||currentRoundId!==id)return;
    ownGrade=snap.val();render();
  },err=>showError('내 채점 기록 확인 실패: '+formatError(err)));
}
function optionsArray(value){
  if(Array.isArray(value))return value;
  if(!value||typeof value!=='object')return [];
  return Object.keys(value).sort((a,b)=>Number(a)-Number(b)).map(key=>value[key]);
}
function renderOptions(){
  const root=$('quiz-options');
  // 같은 문제에서 재렌더될 때 입력을 보존하되, 새 문항에서는 별도 상태를 초기화합니다.
  selectedChoice=root.querySelector('input[name="quiz-choice"]:checked')?.value||selectedChoice;
  typedDraft=root.querySelector('#quiz-typing')?.value??typedDraft;
  root.replaceChildren();
  if(!round)return;
  const locked=!!ownAnswer||round.state!=='question'||sending;
  if(round.type==='typing'){
    const input=document.createElement('input');input.id='quiz-typing';input.type='text';input.maxLength=200;
    input.placeholder='정답을 입력하세요';input.autocomplete='off';input.disabled=locked;
    input.value=ownAnswer?.value??typedDraft;
    input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!input.disabled){e.preventDefault();submitAnswer();}});
    root.append(input);
  }else{
    const choices=optionsArray(round.options);
    choices.forEach((choice,i)=>{
      const label=document.createElement('label');label.className='quiz-large-option';
      const input=document.createElement('input');input.type='radio';input.name='quiz-choice';
      input.value=String(i+1);input.disabled=locked;
      input.addEventListener('change',()=>{selectedChoice=input.value;arcade.choice();});
      input.checked=(ownAnswer?.value??selectedChoice)===String(i+1);
      const numeral=document.createElement('span');numeral.className='quiz-option-number';numeral.textContent=String(i+1);
      const text=document.createElement('span');text.textContent=String(choice);
      label.append(input,numeral,text);root.append(label);
    });
  }
  $('quiz-submit').disabled=locked;
}
function renderReveal(){
  const grade=ownGrade;
  const verdict=$('quiz-verdict');
  let verdictText='미제출',kind='missing';
  if(grade){kind=grade.correct?'correct':'wrong';verdictText=grade.correct?'정답입니다!':'아쉽지만 오답입니다';}
  else if(ownAnswer){kind='pending';verdictText='채점 결과를 불러오는 중…';}
  verdict.className='quiz-verdict quiz-verdict-'+kind;
  verdict.textContent=verdictText;
  $('quiz-reveal-question').textContent=round?.prompt||'';
  $('quiz-round-points').textContent=grade?`+${Number(grade.points||0).toLocaleString()}점`:(ownAnswer?'집계 중':'0점');
  const report=round?.roundResults;
  const cumulative=report?.roundId===round?.roundId?report.entries?.[uid]?.cumulative:null;
  const personalScore=cumulative??scores?.[uid]?.score;
  $('quiz-my-score').textContent=personalScore==null?'집계 중':Number(personalScore).toLocaleString()+'점';
  const answer=$('quiz-answer-feedback');answer.hidden=false;
  answer.textContent=`정답: ${round?.correctAnswer||'정답 확인 중'}`;
  const output=$('quiz-reveal-options');output.replaceChildren();
  if(round?.type==='typing')return;
  const correctIndex=Number(String(round.correctAnswer||'').match(/^([1-4])번/)?.[1]||0);
  optionsArray(round?.options).forEach((choice,i)=>{
    const number=i+1;
    const item=document.createElement('div');item.className='quiz-reveal-option';
    if(number===correctIndex)item.classList.add('is-correct');
    if(String(ownAnswer?.value||'')===String(number)&&number!==correctIndex)item.classList.add('is-selected-wrong');
    const flag=number===correctIndex?' ✓ 정답':String(ownAnswer?.value||'')===String(number)?' · 내가 선택':' ';
    item.textContent=`${number}. ${choice}${flag}`;output.append(item);
  });
}
function makeResultRow(entry,index,{cumulative=false,mine=false}={}){
  const el=document.createElement('div');el.className='quiz-result-row';if(mine)el.classList.add('mine');
  const rank=document.createElement('span');rank.className='quiz-result-place';rank.textContent=['🥇','🥈','🥉'][index-1]||`${index}위`;
  const label=document.createElement('div');label.className='quiz-result-person';
  const name=document.createElement('strong');name.textContent=entry.name||'이름 없음';
  const status=document.createElement('small');
  if(cumulative)status.textContent=`${entry.correct||0}/${entry.answered||0}문항 정답 · 누적 ${Number(entry.score||0).toLocaleString()}점`;
  else status.textContent=({correct:'정답',wrong:'오답',missing:'미제출',pending:'채점 중'})[entry.status]||'확인 중';
  label.append(name,status);
  const metrics=document.createElement('div');metrics.className='quiz-result-metrics';
  const points=document.createElement('strong');points.textContent=cumulative?`${Number(entry.score||0).toLocaleString()}점`:`+${Number(entry.points||0).toLocaleString()}점`;
  const duration=document.createElement('small');
  duration.textContent=cumulative?'누적 점수':entry.status==='correct'||entry.status==='wrong'?`${(Number(entry.responseMs||0)/1000).toFixed(2)}초`:'—';
  metrics.append(points,duration);el.append(rank,label,metrics);return el;
}
function renderResults(){
  const report=round?.roundResults;
  const isValid=!!report && report.roundId===round?.roundId;
  const summary=$('quiz-results-summary');
  const roundList=$('quiz-round-ranking');roundList.replaceChildren();
  if(isValid){
    summary.textContent=`${report.submittedCount||0}/${report.participantCount||0}명 제출 · ${report.correctCount||0}명 정답 · 채점 ${report.gradedCount||0}명 완료`;
    const values=Object.entries(report.entries||{}).map(([id,e])=>({uid:id,...e}));
    const order={correct:0,wrong:1,pending:2,missing:3};
    values.sort((a,b)=>(order[a.status]??4)-(order[b.status]??4)||b.points-a.points||a.responseMs-b.responseMs||a.name.localeCompare(b.name,'ko'));
    values.forEach((entry,i)=>roundList.append(makeResultRow(entry,i+1,{mine:entry.uid===uid})));
    if(!values.length)roundList.textContent='아직 표시할 참가자가 없습니다.';
  }else{
    summary.textContent='선생님의 채점 결과를 동기화하는 중입니다.';
    roundList.textContent='친구들의 결과를 불러오는 중입니다.';
  }
  const rankList=$('quiz-ranking');rankList.replaceChildren();
  // 공개 문항 결과의 누적 점수는 공개 시점에서 교사가 확정한 값으로 표시합니다.
  const combined=isValid?Object.fromEntries(Object.entries(report.entries||{}).map(([id,e])=>[id,{name:e.name,score:e.cumulative,correct:e.cumulativeCorrect,answered:e.cumulativeAnswered,totalMs:e.cumulativeMs}])):scores;
  ranking(combined).forEach((entry,i)=>rankList.append(makeResultRow(entry,i+1,{cumulative:true,mine:entry.uid===uid})));
  if(!rankList.childElementCount)rankList.textContent='아직 누적 순위가 없습니다.';
}
function renderFinished(){
  const ranked=ranking(scores);renderPodium($('quiz-final-podium'),ranked);
  const list=$('quiz-final-ranking');list.replaceChildren();
  ranked.forEach((entry,i)=>list.append(makeResultRow(entry,i+1,{cumulative:true,mine:entry.uid===uid})));
  if(!list.childElementCount)list.textContent='최종 순위를 준비하고 있습니다.';
}
function renderImage(wrapId,imgId,errorId,source){
  const wrap=$(wrapId),img=$(imgId),err=$(errorId);
  let url='';try{url=fullQuestionImageUrl(source||'',location.href);}catch{ /* 유효하지 않은 주소는 표시하지 않습니다. */ }
  wrap.hidden=!url;
  if(!url)return;
  if(img.dataset.loadedSrc!==url){
    img.dataset.loadedSrc=url;err.hidden=true;img.hidden=false;
    img.onerror=()=>{img.hidden=true;err.hidden=false;};
    img.onload=()=>{img.hidden=false;err.hidden=true;};
    img.src=url;
  }
}
function render(){
  if(!code)return;
  const state=round?.state||'waiting';
  const show=['question','paused','reveal','finished'].includes(state)&&!finishedDismissed;
  setVisible('quiz-panel',show);document.body.classList.toggle('quiz-stage-active',show);
  if(!show)return;
  arcade.sync({state,questionId:round?.roundId||'',grade:state==='reveal'?ownGrade?.correct??null:null});
  $('quiz-stage-error').hidden=true;
  $('quiz-state').textContent=stateLabels[state]||'게임 대기';
  $('quiz-progress').textContent=round?.total?`${Number(round.index||0)+1} / ${round.total}문항`:'';
  const solve=['question','paused'].includes(state);
  setVisible('quiz-solve-view',solve);
  setVisible('quiz-reveal-view',state==='reveal'&&!resultsOpen);
  setVisible('quiz-results-view',state==='reveal'&&resultsOpen);
  setVisible('quiz-finished-view',state==='finished');
  if(solve){
    setVisible('quiz-question-block',true);setVisible('quiz-response',true);
    $('quiz-question').textContent=round?.prompt||'';
    renderImage('quiz-image-wrap','quiz-image','quiz-image-error',round?.imageUrl);
    $('quiz-response-type').textContent=round?.type==='typing'?'정답을 직접 입력해 주세요.':'정답이라고 생각하는 보기를 누르세요.';
    renderOptions();
    if(ownAnswer)notify('제출 완료! 선생님의 정답 공개를 기다려 주세요.','success');
    else if(state==='paused')notify('일시 정지 중입니다. 선생님이 재개하면 다시 제출할 수 있습니다.');
    else notify('정답을 선택한 뒤 아래 제출 버튼을 누르세요.');
  }
  if(state==='reveal'){
    if(!ungrade)subscribeGrade();
    if(resultsOpen)renderResults();else {renderImage('quiz-reveal-image-wrap','quiz-reveal-image','quiz-reveal-image-error',round?.imageUrl);renderReveal();}
  }
  if(state==='finished')renderFinished();
}
async function submitAnswer(){
  if(!code||!uid||!round||round.state!=='question'||ownAnswer||sending)return;
  const value=round.type==='typing'?($('quiz-typing')?.value||'').trim():document.querySelector('#quiz-options input[name="quiz-choice"]:checked')?.value||'';
  if(!value){notify('답을 선택하거나 입력해 주세요.','error');return;}
  if(value.length>200){notify('답안은 200자 이하로 입력해 주세요.','error');return;}
  const c=code,r=round.roundId,u=uid;
  sending=true;$('quiz-submit').disabled=true;
  try{await set(ref(db,`v3/answers/${c}/${r}/${u}`),{value,at:serverTimestamp()});arcade.submit();notify('제출 완료! 정답 공개를 기다려 주세요.','success');}
  catch(err){notify('제출 실패: 제한 시간이 지났거나 이미 제출한 답안일 수 있습니다. '+formatError(err),'error');}
  finally{sending=false;render();}
}
$('quiz-submit').addEventListener('click',submitAnswer);
$('quiz-show-results').addEventListener('click',()=>{arcade.showResults();resultsOpen=true;render();});
$('quiz-back-reveal').addEventListener('click',()=>{resultsOpen=false;render();});
$('quiz-finish-exit').addEventListener('click',()=>{finishedDismissed=true;render();});
if(db)onValue(ref(db,'.info/serverTimeOffset'),snap=>{clockOffset=Number(snap.val()||0);});
setInterval(()=>{
  if(!code||$('quiz-panel').hidden)return;
  if(round?.state==='question'){
    const seconds=Math.max(0,Math.ceil((Number(round.deadline||0)-(Date.now()+clockOffset))/1000));
    $('quiz-time').textContent=`남은 시간 ${seconds}초`;arcade.updateTime(seconds,round.timeLimit);
    if(seconds===0)$('quiz-submit').disabled=true;
  }else if(round?.state==='paused'){$('quiz-time').textContent='일시 정지';arcade.updateTime(0,round.timeLimit);}
  else if(round?.state==='reveal')$('quiz-time').textContent='정답 공개';
  else $('quiz-time').textContent='';
},250);
