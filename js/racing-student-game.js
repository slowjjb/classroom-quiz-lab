import {gameIsPaused,gameRemainingSeconds,renderStudentPause} from './game-pause.js?v=6.0.0-alpha.24';
// Racing v6 alpha5 — student race stage with teacher-graded answers.
import {db,formatError} from './firebase.js';
import {ref,onValue,set,serverTimestamp} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import {racingStandings,RACING_REWARDS} from './racing-game-core.js';
import {createRacingAudio,RACING_TRACKS} from './racing-audio.js?v=6.0.0-alpha.25';
import {fullQuestionImageUrl} from './image-utils.js';
const $=id=>document.getElementById(id);
let code='',uid='',pub=null,own=null,stopFns=[],session=0,submitting=false,selectedAnswer='',submittedNonce='',shownNonce='',lastResultTimer=null,rouletteTimer=null,spinningNonce='',lastPhase='',unlockListener=null,stagePositioned=false,learningMode='first',learningSignature='';
const sound=createRacingAudio({role:'student'});
const notice=(text,bad=false)=>{const el=$('racing-student-message');if(el){el.textContent=text;el.dataset.kind=bad?'error':'success'}};
const fmtTime=sec=>Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');
function timer(){
 if(!code||pub?.state!=='playing')return;
 $('racing-student-clock').textContent=fmtTime(gameRemainingSeconds(pub,Date.now()));
}
for(const track of RACING_TRACKS){
 for(const id of ['racing-lobby-track','racing-student-track']){
  const option=document.createElement('option');option.value=track.id;option.textContent=track.name;
  $(id).append(option);
 }
}
function chooseTrack(id){
 sound.setTrack(id);
 $('racing-lobby-track').value=sound.trackId;
 $('racing-student-track').value=sound.trackId;
}
for(const id of ['racing-lobby-track','racing-student-track']){
 $(id).addEventListener('change',e=>chooseTrack(e.target.value));
}
function syncAudioButtons(){
 const label=sound.isOn?'🔊 배경음·효과음 끄기':'🔈 배경음·효과음 켜기';
 $('racing-lobby-sound-toggle').textContent=label;
 $('racing-student-sound-toggle').textContent=label;
}
async function toggleAudio(){
 const enabled=await sound.toggle();syncAudioButtons();
 if(!enabled&&!sound.canPlay)notice('이 브라우저는 오디오 기능을 지원하지 않습니다.',true);
}
function clearRoulette(){
 if(rouletteTimer!==null){clearTimeout(rouletteTimer);rouletteTimer=null}
 spinningNonce='';
 const layer=$('racing-roulette-overlay');layer.hidden=true;
 layer.classList.remove('is-spinning','is-settled');
}
function runRoulette(result){
 clearRoulette();
 const nonce=result.nonce;spinningNonce=nonce;
 const layer=$('racing-roulette-overlay');layer.hidden=false;
 layer.classList.add('is-spinning');layer.classList.remove('is-settled');
 $('racing-roulette-result').textContent='슬롯머신 회전 중…';
 $('racing-roulette-caption').textContent='정답 3회! 이번 보너스는 무엇일까요?';
 const reels=[$('racing-reel-left'),$('racing-reel-center'),$('racing-reel-right')];
 const pool=RACING_REWARDS;
 const sample=()=>pool[Math.floor(Math.random()*pool.length)];
 const draw=(middle)=>{const items=[sample(),middle,sample()];
  items.forEach((item,i)=>{reels[i].textContent=item.name;reels[i].dataset.mood=Number(item.delta)>0?'good':Number(item.delta)<0?'bad':'neutral';});
 };
 const outcome=pool.find(item=>item.id===result.reward?.id)||pool[0];
 let ticks=0;
 sound.play('spin');
 const step=()=>{
  if(spinningNonce!==nonce||!code)return;
  ticks++;
  if(ticks>=20){
   draw(outcome);layer.classList.remove('is-spinning');layer.classList.add('is-settled');
   $('racing-roulette-result').textContent=outcome.name+' 당첨! · '+(Number(outcome.delta)>0?'+':'')+Number(outcome.delta)+'m';
   $('racing-roulette-caption').textContent='🎉 실제 경기 결과가 확정되었습니다!';
   sound.play(Number(outcome.delta)>0?'positive':Number(outcome.delta)<0?'negative':'neutral');
   rouletteTimer=setTimeout(()=>{if(spinningNonce!==nonce)return;clearRoulette();
    const pane=$('racing-student-result');
    pane.textContent='🎰 '+outcome.name+' · 현재 '+Number(result.meters||0)+'m';pane.hidden=false;
    clearTimeout(lastResultTimer);lastResultTimer=setTimeout(()=>{pane.hidden=true},2300);
   },1250);
   return;
  }
  draw(sample());
  if(ticks%3===0)sound.play('tick');
  rouletteTimer=setTimeout(step,48+ticks*6);
 };
 step();
}
function showResult(score){
 const result=score?.lastResult;
 if(!result?.nonce||result.nonce===shownNonce)return;
 // The score is public, but the answer is delivered only through this student's private state.
 if(!result.correct&&own?.lastFeedback?.nonce!==result.nonce)return;
 shownNonce=result.nonce;
 sound.play(result.correct?'correct':'wrong');
 const pane=$('racing-student-result');
 clearTimeout(lastResultTimer);
 if(result.spin&&result.reward){
  pane.hidden=true;runRoulette(result);
 }else{
  pane.textContent=result.correct
   ?'✅ 정답! +1m · 현재 '+Number(result.meters||0)+'m'
   :'❌ 오답! 정답: '+String(own?.lastFeedback?.correctAnswer||'확인 중')+' · 다음 문제에 도전!';
  pane.hidden=false;lastResultTimer=setTimeout(()=>{pane.hidden=true},result.correct?2600:4800);
 }
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
function learningTier(rate){return rate>=75?'high':rate>=50?'mid':'low'}
function renderLearning(me){
 const box=$('racing-student-finished');
 if(box.hidden)return;
 const attempts=Number(me?.answered||0),correct=Number(me?.correct||0);
 const rate=attempts>0?Math.round(100*correct/attempts):null;
 $('racing-my-rate').textContent=rate===null?'자료 없음':rate+'%';
 $('racing-my-rate-detail').textContent=correct+'/'+attempts+'회 정답 · 실제 제출한 모든 답안 기준';
 $('racing-my-rate-bar').style.width=(rate===null?0:rate)+'%';
 $('racing-my-rate-bar').dataset.tier=rate===null?'none':learningTier(rate);
 const data=pub?.learningResults?.[learningMode]?.questions||null;
 const signature=JSON.stringify({learningMode,data});
 if(signature===learningSignature)return;
 learningSignature=signature;
 const target=$('racing-my-question-results');target.replaceChildren();
 if(!data){
  const p=document.createElement('p');p.textContent='선생님이 문항별 결과를 집계하는 중입니다. 잠시 후 자동으로 표시됩니다.';target.append(p);return;
 }
 const entries=Array.isArray(data)?data:Object.values(data);
 if(!entries.length){const p=document.createElement('p');p.textContent='문항별 기록이 없습니다.';target.append(p);return}
 for(const q of entries){
  const rate=q.rate===null||q.rate===undefined?null:Number(q.rate);
  const row=document.createElement('div');row.className='racing-my-question-row';
  if(rate!==null)row.dataset.tier=learningTier(rate);
  const head=document.createElement('div');head.className='racing-my-question-head';
  const title=document.createElement('strong');title.textContent=String(q.number||'')+'번. '+String(q.prompt||'');
  const value=document.createElement('b');value.textContent=rate===null?'—':rate+'%';
  head.append(title,value);row.append(head);
  const details=document.createElement('small');details.textContent=Number(q.correct||0)+'/'+Number(q.total||0)+'회 정답 · 참여 '+Number(q.students||0)+'명';
  row.append(details);
  const track=document.createElement('div');track.className='racing-my-rate-track';
  const fill=document.createElement('span');fill.style.width=(rate===null?0:Math.max(0,Math.min(100,rate)))+'%';
  track.append(fill);row.append(track);target.append(row);
 }
}
function renderQuestion(){
 const active=pub?.state==='playing',state=own,content=$('racing-student-question-zone');
 content.hidden=!active||state?.phase!=='question';
 if(content.hidden)return;
 const marker=state?.nonce||'';
 if(content.dataset.nonce===marker)return;
 content.dataset.nonce=marker;submitting=false;selectedAnswer='';submittedNonce='';
 $('racing-student-submit').disabled=true;
 $('racing-student-question-no').textContent='문제 '+Number(state?.number||1)+'번 · 정답은 1m 전진!';
 $('racing-student-question-text').textContent=String(state.prompt||'문제를 불러오는 중…');
 const image=$('racing-student-question-image'),wrap=$('racing-student-question-image-wrap');
 wrap.hidden=!state.imageUrl;if(state.imageUrl)image.src=fullQuestionImageUrl(state.imageUrl,location.href);else image.removeAttribute('src');
 const options=$('racing-student-options');options.replaceChildren();
 $('racing-student-input-wrap').hidden=state.type!=='typing';
 if(state.type==='typing'){
  const input=$('racing-student-typing');input.value='';
  $('racing-student-typing').oninput=()=>updateSubmitAvailability();
 }else{
  for(let i=0;i<(state.options||[]).length;i++){
   const b=document.createElement('button');b.type='button';b.className='racing-answer-button';
   const key=document.createElement('strong');key.textContent=(i+1)+'.';
   const label=document.createElement('span');label.textContent=String(state.options[i]);
   b.append(key,label);b.onclick=()=>selectAnswer(String(i+1));
   options.append(b);
  }
 }
 notice(state.type==='typing'?'정답을 입력한 뒤 제출하기를 눌러 주세요.':'보기를 선택한 뒤 제출하기를 눌러 주세요.');
}
function render(){
 const stage=$('racing-student-play');if(!code){stage.hidden=true;return;}
 const state=pub?.state||'lobby';stage.hidden=state!=='playing'&&state!=='finished';
 sound.setPlaying(state==='playing'&&!gameIsPaused(pub));
 if(lastPhase==='playing'&&state==='finished')sound.play('finish');
 lastPhase=state;
 syncAudioButtons();
 renderStudentPause(pub,!stage.hidden);
 if(stage.hidden)return;
 if(state==='playing'&&!stagePositioned){
  stagePositioned=true;
  requestAnimationFrame(()=>{if(code&&pub?.state==='playing')stage.scrollIntoView({block:'start',behavior:'instant'});});
 }
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
  $('racing-student-final').textContent='경주 종료! '+(ranking.findIndex(x=>x.uid===uid)+1||'—')+'위 · '+meters+'m 주행 기록';
  renderLearning(me);
 }else{
  timer();renderQuestion();updateSubmitAvailability();
  if(!me){$('racing-student-question-zone').hidden=true;notice('경기 참가 정보가 없습니다. 선생님께 참가 명단을 확인해 달라고 요청하세요.',true);}
  else if(own?.phase==='waiting')notice('준비된 문제를 모두 풀었습니다. 경주 종료를 기다려 주세요.');
  else if(!own)notice('선생님이 출발 신호를 보내는 중입니다.');
 }
 showResult(me);
}
function updateSubmitAvailability(){
 const candidate=own?.type==='typing'?$('racing-student-typing').value.trim():selectedAnswer;
 $('racing-student-submit').disabled=Boolean(!candidate||submitting||submittedNonce===own?.nonce||gameIsPaused(pub)||pub?.state!=='playing');
}
function selectAnswer(choice){
 if(!own||own.phase!=='question'||submitting||submittedNonce===own.nonce||gameIsPaused(pub))return;
 selectedAnswer=choice;
 $('racing-student-options').querySelectorAll('button').forEach((button,i)=>{
  const selected=String(i+1)===choice;
  button.classList.toggle('racing-answer-selected',selected);
  button.setAttribute('aria-pressed',String(selected));
 });
 updateSubmitAvailability();
 notice('선택했습니다. 아래 정답 제출하기를 눌러 확정하세요.');
}
async function submitAnswer(value){
 if(!code||!uid||pub?.state!=='playing'||gameIsPaused(pub)||own?.phase!=='question'||submitting)return;
 if(!String(value).trim()){notice('답을 입력해 주세요.',true);return}
 const nonce=own.nonce;if(!nonce||nonce===submittedNonce)return;
 submitting=true;submittedNonce=nonce;
 void sound.unlock().then(()=>sound.play('submit'));
 for(const button of $('racing-student-options').querySelectorAll('button'))button.disabled=true;
 $('racing-student-submit').disabled=true;
 notice('답을 제출했습니다. 선생님이 채점하는 중…');
 try{
  await set(ref(db,'v6/answers/'+code+'/'+uid+'/'+nonce),{value:String(value).slice(0,200),at:serverTimestamp()});
 }catch(err){
  submitting=false;submittedNonce='';notice('답안 제출 실패: '+formatError(err),true);
  for(const button of $('racing-student-options').querySelectorAll('button'))button.disabled=false;
  updateSubmitAvailability();
 }
}
export function stopRacingGame(){
 renderStudentPause(null,false);
 session++;stopFns.forEach(fn=>{try{fn()}catch(_){}});
 stopFns=[];code='';uid='';pub=null;own=null;submitting=false;selectedAnswer='';submittedNonce='';shownNonce='';
 clearTimeout(lastResultTimer);lastResultTimer=null;clearRoulette();sound.setPlaying(false);lastPhase='';stagePositioned=false;learningMode='first';learningSignature='';
 if(unlockListener){document.removeEventListener('pointerdown',unlockListener,true);unlockListener=null}
 $('racing-student-play').hidden=true;$('racing-student-question-zone').dataset.nonce='';
}
export function startRacingGame(nextCode,nextUid){
 stopRacingGame();code=nextCode;uid=nextUid;const token=session;
 $('racing-my-question-mode').value='first';
 $('racing-my-question-mode').onchange=e=>{learningMode=e.target.value==='all'?'all':'first';learningSignature='';renderLearning(pub?.scores?.[uid]);};
 $('racing-lobby-track').value=sound.trackId;
 $('racing-student-track').value=sound.trackId;
 $('racing-lobby-sound-toggle').onclick=()=>void toggleAudio();
 $('racing-student-sound-toggle').onclick=()=>void toggleAudio();
 // Audio may not autoplay on mobiles: unlock on the first car-choice tap.
 unlockListener=event=>{
  if(event.target?.closest?.('#racing-lobby-sound-toggle,#racing-student-sound-toggle'))return;
  document.removeEventListener('pointerdown',unlockListener,true);unlockListener=null;
  void sound.unlock().then(()=>{syncAudioButtons();sound.play('choose')});
 };
 document.addEventListener('pointerdown',unlockListener,true);
 syncAudioButtons();
 $('racing-student-submit').onclick=()=>void submitAnswer(own?.type==='typing'?$('racing-student-typing').value:selectedAnswer);
 $('racing-student-typing').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('racing-student-submit').focus();}};
 stopFns.push(onValue(ref(db,'v6/public/'+code),snap=>{if(session!==token)return;pub=snap.val();render()},e=>notice('실시간 경기 연결 실패: '+formatError(e),true)));
 stopFns.push(onValue(ref(db,'v6/memberState/'+code+'/'+uid),snap=>{if(session!==token)return;own=snap.val();render()},e=>notice('현재 문제 읽기 실패: '+formatError(e),true)));
}
setInterval(timer,1000);
