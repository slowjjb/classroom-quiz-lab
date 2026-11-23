// Racing v6 alpha5 — student race stage with teacher-graded answers.
import {db,formatError} from './firebase.js';
import {ref,onValue,set,serverTimestamp} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import {racingStandings} from './racing-game-core.js';
import {fullQuestionImageUrl} from './image-utils.js';
const $=id=>document.getElementById(id);
let code='',uid='',pub=null,own=null,stopFns=[],session=0,submitting=false,submittedNonce='',shownNonce='',lastResultTimer=null;
const notice=(text,bad=false)=>{const el=$('racing-student-message');if(el){el.textContent=text;el.dataset.kind=bad?'error':'success'}};
const fmtTime=sec=>Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');
function timer(){
 if(!code||pub?.state!=='playing')return;
 $('racing-student-clock').textContent=fmtTime(Math.max(0,Math.ceil((Number(pub.endsAt||0)-Date.now())/1000)));
}
function showResult(score){
 const result=score?.lastResult;
 if(!result?.nonce||result.nonce===shownNonce)return;
 shownNonce=result.nonce;
 const pane=$('racing-student-result');
 const desc=result.correct?'✅ 정답! +1m':'❌ 아쉽지만 다음 문제에 도전!';
 const reward=result.spin?' · 🎰 '+(result.reward?.name||'룰렛'):'';
 pane.textContent=desc+reward+' · 현재 '+Number(result.meters||0)+'m';
 pane.hidden=false;
 clearTimeout(lastResultTimer);lastResultTimer=setTimeout(()=>{pane.hidden=true},3200);
}
function renderRanking(rank,finished){
 const target=$('racing-student-ranking');target.replaceChildren();
 const list=finished?rank:rank.slice(0,5);
 for(let i=0;i<list.length;i++){
  const entry=list[i],row=document.createElement('div');row.className='racing-student-rank-item'+(entry.uid===uid?' is-me':'');
  const left=document.createElement('span');left.textContent=(i<3?['🥇','🥈','🥉'][i]:(i+1)+'위')+' '+(entry.name||'참가자');
  const right=document.createElement('b');right.textContent=Number(entry.meters||0)+'m';
  row.append(left,right);target.append(row);
 }
}
function renderQuestion(){
 const active=pub?.state==='playing',state=own,content=$('racing-student-question-zone');
 content.hidden=!active||state?.phase!=='question';
 if(content.hidden)return;
 const marker=state?.nonce||'';
 if(content.dataset.nonce===marker)return;
 content.dataset.nonce=marker;submitting=false;submittedNonce='';
 $('racing-student-question-no').textContent='문제 '+Number(state?.number||1)+'번 · 정답은 1m 전진!';
 $('racing-student-question-text').textContent=String(state.prompt||'문제를 불러오는 중…');
 const image=$('racing-student-question-image'),wrap=$('racing-student-question-image-wrap');
 wrap.hidden=!state.imageUrl;if(state.imageUrl)image.src=fullQuestionImageUrl(state.imageUrl,location.href);
 const options=$('racing-student-options');options.replaceChildren();
 $('racing-student-input-wrap').hidden=state.type!=='typing';
 if(state.type==='typing'){
  const input=$('racing-student-typing');input.value='';
  $('racing-student-typing-submit').disabled=false;
 }else{
  for(let i=0;i<(state.options||[]).length;i++){
   const b=document.createElement('button');b.type='button';b.className='racing-answer-button';
   const key=document.createElement('strong');key.textContent=(i+1)+'.';
   const label=document.createElement('span');label.textContent=String(state.options[i]);
   b.append(key,label);b.onclick=()=>void submitAnswer(String(i+1));
   options.append(b);
  }
 }
 notice('정답을 골라 주세요!');
}
function render(){
 const stage=$('racing-student-play');if(!code){stage.hidden=true;return;}
 const state=pub?.state||'lobby';stage.hidden=state!=='playing'&&state!=='finished';
 if(stage.hidden)return;
 const scores=pub?.scores||{},me=scores[uid],ranking=racingStandings(scores);
 const meters=Number(me?.meters||0),goal=Number(pub?.finishMeters||20);
 $('racing-student-meters').textContent=meters+' / '+goal+'m';
 $('racing-student-hits').textContent='정답 '+(me?.correct||0)+' / '+(me?.answered||0)+'회';
 $('racing-student-progress').style.width=Math.min(100,Math.max(0,meters/goal*100))+'%';
 $('racing-student-place').textContent=(ranking.findIndex(x=>x.uid===uid)+1||'—')+'위';
 const car=$('racing-student-car-image');car.src=window.RACING_SPRITES?.[Number(me?.carId||0)]||'';
 car.style.left='clamp(0px, calc('+Math.min(100,Math.max(0,meters/goal*100))+'% - 20px), calc(100% - 45px))';
 $('racing-student-playing').hidden=state!=='playing';
 $('racing-student-finished').hidden=state!=='finished';
 $('racing-student-rank-title').textContent=state==='finished'?'🏆 최종 순위':'🔥 실시간 상위 5명';
 renderRanking(ranking,state==='finished');
 if(state==='finished'){
  $('racing-student-final').textContent='경주 종료! '+(ranking.findIndex(x=>x.uid===uid)+1||'—')+'위 · '+meters+'m 완주 기록';
 }else{
  timer();renderQuestion();
  if(own?.phase==='waiting')notice('준비된 문제를 모두 풀었습니다. 경주 종료를 기다려 주세요.');
  else if(!own)notice('선생님이 출발 신호를 보내는 중입니다.');
  showResult(me);
 }
}
async function submitAnswer(value){
 if(!code||!uid||pub?.state!=='playing'||own?.phase!=='question'||submitting)return;
 if(!String(value).trim()){notice('답을 입력해 주세요.',true);return}
 const nonce=own.nonce;if(!nonce||nonce===submittedNonce)return;
 submitting=true;submittedNonce=nonce;
 for(const button of $('racing-student-options').querySelectorAll('button'))button.disabled=true;
 $('racing-student-typing-submit').disabled=true;
 notice('답을 제출했습니다. 선생님이 채점하는 중…');
 try{
  await set(ref(db,'v6/answers/'+code+'/'+uid+'/'+nonce),{value:String(value).slice(0,200),at:serverTimestamp()});
 }catch(err){
  submitting=false;submittedNonce='';notice('답안 제출 실패: '+formatError(err),true);
  for(const button of $('racing-student-options').querySelectorAll('button'))button.disabled=false;
  $('racing-student-typing-submit').disabled=false;
 }
}
export function stopRacingGame(){
 session++;stopFns.forEach(fn=>{try{fn()}catch(_){}});
 stopFns=[];code='';uid='';pub=null;own=null;submitting=false;submittedNonce='';shownNonce='';
 clearTimeout(lastResultTimer);lastResultTimer=null;
 $('racing-student-play').hidden=true;$('racing-student-question-zone').dataset.nonce='';
}
export function startRacingGame(nextCode,nextUid){
 stopRacingGame();code=nextCode;uid=nextUid;const token=session;
 $('racing-student-typing-submit').onclick=()=>void submitAnswer($('racing-student-typing').value);
 $('racing-student-typing').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();void submitAnswer(e.target.value)}};
 stopFns.push(onValue(ref(db,'v6/public/'+code),snap=>{if(session!==token)return;pub=snap.val();render()},e=>notice('실시간 경기 연결 실패: '+formatError(e),true)));
 stopFns.push(onValue(ref(db,'v6/memberState/'+code+'/'+uid),snap=>{if(session!==token)return;own=snap.val();render()},e=>notice('현재 문제 읽기 실패: '+formatError(e),true)));
}
setInterval(timer,1000);
