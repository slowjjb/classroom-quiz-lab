import { db, formatError } from './firebase.js';
import { ref, onValue, get, set, serverTimestamp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import { ranking } from './classic-core.js';

const $=id=>document.getElementById(id);
let code='', uid='', round=null, unsub=[], ownAnswer=null, ownGrade=null, scores={}, offset=0, sending=false;
function notice(text,kind=''){$('quiz-message').textContent=text;$('quiz-message').dataset.kind=kind;}
function clearListeners(){for(const stop of unsub)stop();unsub=[];if(unanswer){unanswer();unanswer=null;}if(ungrade){ungrade();ungrade=null;}round=null;ownAnswer=null;ownGrade=null;scores={};sending=false;}
export function stopQuizView(){clearListeners();code='';uid='';$('quiz-panel').hidden=true;}
export function startQuizView(nextCode,nextUid){
  if(!nextCode||!nextUid)return;
  if(nextCode===code&&nextUid===uid)return;
  stopQuizView();code=nextCode;uid=nextUid;$('quiz-panel').hidden=false;
  const myCode=code,myUid=uid;
  unsub.push(onValue(ref(db,`v3/public/${myCode}`),snap=>{
    if(code!==myCode||uid!==myUid)return;
    const previousRound=round?.roundId;
    round=snap.val();
    if(previousRound!==round?.roundId)subscribeToAnswer();
    render();
  },e=>{
    notice('v3 보안 규칙이 아직 적용되지 않았습니다. 교사에게 알려주세요. ('+formatError(e)+')','error');
    $('quiz-panel').hidden=false;
  }));
  unsub.push(onValue(ref(db,`v3/scores/${myCode}`),snap=>{
    if(code!==myCode)return;scores=snap.val()||{};renderRanking();
  },e=>notice('점수 조회 실패: '+formatError(e),'error')));
}
let unanswer=null, ungrade=null;
function subscribeToAnswer(){
  if(unanswer){unanswer();unanswer=null;}if(ungrade){ungrade();ungrade=null;}
  ownAnswer=null;ownGrade=null;
  if(!round?.roundId)return;
  const id=round.roundId, c=code, u=uid;
  unanswer=onValue(ref(db,`v3/answers/${c}/${id}/${u}`),snap=>{
    if(code!==c||round?.roundId!==id)return;
    ownAnswer=snap.val();render();
  },e=>notice('제출 기록 확인 오류: '+formatError(e),'error'));
  // 응답 정오 정보는 정답 공개 또는 종료 이후에만 구독합니다.
  if(['reveal','finished'].includes(round.state))subscribeGrade();
}
function subscribeGrade(){
  if(ungrade){ungrade();ungrade=null;}if(!round?.roundId)return;
  const c=code,id=round.roundId,u=uid;
  ungrade=onValue(ref(db,`v3/grades/${c}/${id}/${u}`),snap=>{
    if(code!==c||round?.roundId!==id)return;ownGrade=snap.val();render();
  },e=>notice('채점 결과 확인 오류: '+formatError(e),'error'));
}
function renderRanking(){
  const node=$('quiz-ranking');node.replaceChildren();
  const list=ranking(scores).slice(0,10);
  for(const [i,item] of list.entries()){
    const line=document.createElement('div');line.className='classic-rank-line';
    line.textContent=`${i+1}위 · ${item.name} · ${Number(item.score||0).toLocaleString()}점`;
    if(item.uid===uid)line.classList.add('mine');node.append(line);
  }
  if(!list.length)node.textContent='점수 집계 대기 중입니다.';
  const me=scores?.[uid];$('quiz-my-score').textContent=me?`${Number(me.score||0).toLocaleString()}점 · ${me.correct||0}문제 정답`:'아직 점수가 없습니다.';
}
function render(){
  if(!code)return;
  const state=round?.state||'waiting';
  $('quiz-state').textContent=({waiting:'게임 대기',ready:'게임 준비',question:'문제 풀이',paused:'일시 정지',reveal:'정답 공개',finished:'게임 종료'})[state]||'게임 준비 중';
  const showQuestion=['question','paused','reveal'].includes(state);
  $('quiz-question-block').hidden=!showQuestion;
  $('quiz-response').hidden=!showQuestion;
  $('quiz-answer-feedback').hidden=state!=='reveal';
  $('quiz-progress').textContent=round?.total?`${Math.max(0,Number(round.index||0)+1)} / ${round.total}`:'';
  if(state==='ready'){notice('선생님이 첫 문제를 준비하고 있습니다.');return;}
  if(state==='waiting'){notice('선생님이 퀴즈를 시작하면 이곳에 문제가 나타납니다.');return;}
  if(state==='finished'){notice('게임이 종료됐습니다! 최종 순위를 확인하세요.','success');return;}
  if(!showQuestion)return;
  $('quiz-question').textContent=round.prompt||'';
  $('quiz-response-type').textContent=round.type==='typing'?'답을 정확히 입력해 주세요.':'정답이라고 생각하는 보기를 선택해 주세요.';
  const previouslySelected=document.querySelector('input[name="quiz-choice"]:checked')?.value||'';
  const previousTyping=$('quiz-typing')?.value||'';
  const options=$('quiz-options');options.replaceChildren();
  if(round.type==='typing'){
    const input=document.createElement('input');input.id='quiz-typing';input.type='text';input.maxLength=200;
    input.placeholder='정답을 입력하세요';input.autocomplete='off';input.disabled=!!ownAnswer||state!=='question';
    input.value=ownAnswer?.value||previousTyping;
    options.append(input);
  }else{
    const values=Array.isArray(round.options)?round.options:Object.keys(round.options||{}).sort((a,b)=>Number(a)-Number(b)).map(k=>round.options[k]);
    values.forEach((v,i)=>{
      const label=document.createElement('label');label.className='classic-option';
      const radio=document.createElement('input');radio.type='radio';radio.name='quiz-choice';radio.value=String(i+1);
      radio.disabled=!!ownAnswer||state!=='question';radio.checked=(ownAnswer?.value||previouslySelected)===String(i+1);
      const text=document.createElement('span');text.textContent=`${i+1}. ${v}`;
      label.append(radio,text);options.append(label);
    });
  }
  $('quiz-submit').disabled=state!=='question'||!!ownAnswer||sending;
  if(ownAnswer)notice('답안을 제출했습니다. 선생님의 정답 공개를 기다려 주세요.','success');
  else if(state==='paused')notice('선생님이 게임을 일시 정지했습니다. 답안 제출도 잠시 중단됩니다.');
  else if(state==='reveal')notice('이번 문제를 제출하지 않았습니다. 다음 문제를 기다리세요.');
  else notice('문제를 풀고 제출하세요. 제한 시간이 끝나면 제출할 수 없습니다.');
  if(state==='reveal'){
    $('quiz-answer-feedback').textContent=`정답: ${round.correctAnswer||'확인 중'} · ${ownGrade?(ownGrade.correct?'정답! '+ownGrade.points+'점':'오답 · 0점'):(ownAnswer?'채점 기록 확인 중':'미제출')}`;
    if(!ungrade)subscribeGrade();
  }
}
async function submitAnswer(){
  if(!code||!uid||!round||round.state!=='question'||ownAnswer||sending)return;
  let value='';
  if(round.type==='typing')value=($('quiz-typing')?.value||'').trim();
  else value=document.querySelector('input[name="quiz-choice"]:checked')?.value||'';
  if(!value){notice('정답을 선택하거나 입력해 주세요.','error');return;}
  if(round.type==='typing'&&value.length>200){notice('답안은 200자 이하로 입력해 주세요.','error');return;}
  const c=code,r=round.roundId,u=uid;
  sending=true;$('quiz-submit').disabled=true;
  try{
    await set(ref(db,`v3/answers/${c}/${r}/${u}`),{value,at:serverTimestamp()});
    notice('제출을 완료했습니다.','success');
  }catch(e){notice('제출 실패: 제한 시간이 지났거나 이미 제출한 답안일 수 있습니다. '+formatError(e),'error');}
  finally{sending=false;render();}
}
$('quiz-submit').addEventListener('click',submitAnswer);
if(db)onValue(ref(db,'.info/serverTimeOffset'),snap=>{offset=Number(snap.val()||0);});
setInterval(()=>{
  if(!code)return;
  if(round?.state==='question'){
    const seconds=Math.max(0,Math.ceil((Number(round.deadline||0)-Date.now()-offset)/1000));
    $('quiz-time').textContent=`남은 시간 ${seconds}초`;
    if(seconds===0){$('quiz-submit').disabled=true;}
  }else if(round?.state==='paused')$('quiz-time').textContent='일시 정지';
  else $('quiz-time').textContent='';
},250);
