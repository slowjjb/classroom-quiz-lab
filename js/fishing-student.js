import {gameIsPaused,gameRemainingSeconds,renderStudentPause} from './game-pause.js?v=6.0.0-alpha.25';
// Purplekit v5.0 — Fishing Frenzy student interface.
import {db,formatError} from './firebase.js';
import {ref,onValue,set,serverTimestamp} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import {fullQuestionImageUrl} from './image-utils.js';
import {fishingRanking,CREATURES,FISHING_PENALTY_DURATION_MS} from './fishing-core.js?v=6.0.0-alpha.25';
import {createFishingCodex,updateFishingCodex} from './fishing-codex.js?v=6.0.0-alpha.10';
import {createFishingBgm,FISHING_TRACKS} from './fishing-bgm.js?v=6.0.0-alpha.25';
const $=id=>document.getElementById(id),stage=$('fishing-student');
let code='',uid='',pub=null,own=null,answer=null,subs=[],offset=0,selected='',pending=false;
let action=null,shownEvent='',eventTimer=null,animTimer=null,questionNonce='',rewardNonce='';
let audioEnabled=true,codex=null,hitPlayedNonce='',learningMode='first',learningSignature='';
const studentBgm=createFishingBgm({role:'student',fileElement:$('fishing-bgm')});
const now=()=>Date.now()+offset;
function notice(text,isError=false){$('fishing-message').textContent=text;$('fishing-message').dataset.kind=isError?'error':'';}
function lureAsset(level){const n=Math.min(8,Math.max(1,Math.floor(Number(level)||1)));return `images/fishing/lures/lure${n}.png?v=5.0.11`; }
function setAudioToggle(){const btn=$('fishing-audio-toggle');if(!btn)return;btn.textContent=audioEnabled?'🔊 소리 켜짐':'🔇 소리 꺼짐';btn.setAttribute('aria-pressed',audioEnabled?'true':'false');}
function safePlay(el,vol=.6){if(!el||!audioEnabled)return;el.volume=vol;try{el.currentTime=0;}catch{};el.play().catch(()=>{});}
function ensureBgm(){if(audioEnabled)studentBgm.setPlaying(true);}
function stopBgm(){studentBgm.setPlaying(false);}
function setAudioEnabled(flag){audioEnabled=!!flag;try{localStorage.setItem('purplekit_fishing_audio',audioEnabled?'on':'off');}catch{};studentBgm.setEnabled(audioEnabled);setAudioToggle();if(audioEnabled)ensureBgm();else stopBgm();}
function playResultSound(type,tier='normal'){
  if(type==='fish'&&tier==='legend')safePlay($('fishing-sfx-legend'),.64);
  else if(type==='broken')safePlay($('fishing-sfx-break'),.65);
  else if(type==='fish'||type==='upgrade'||type==='penalty')safePlay($('fishing-sfx-catch'),.48);
  else if(type)safePlay($('fishing-sfx-miss'),.48);
}
function setCodexOpen(open){
  const active=Boolean(open);
  stage.classList.toggle('fishing-codex-open',active);
  $('fishing-codex-backdrop').hidden=!active;
  $('fishing-codex-close').hidden=!active;
  $('fishing-codex-toggle').setAttribute('aria-expanded',String(active));
}
function renderCodex(){
  if(!codex)return;
  const best=pub?.scores?.[uid]?.bestBySpecies||{};
  const count=updateFishingCodex(codex,best);
  $('fishing-codex-left-count').textContent=`${count.left}/14`;
  $('fishing-codex-right-count').textContent=`${count.right}/14`;
  $('fishing-codex-total-mobile').textContent=`${count.total}/28종`;
}

function setLureVisual(level){const icon=$('fishing-lure-icon');if(icon)icon.src=lureAsset(level);$('fishing-level').textContent=`Lv.${level||1}`;}
function show(flag){stage.hidden=!flag;if(flag){document.body.classList.add('quiz-stage-active');$('student-room').hidden=true;}else document.body.classList.remove('quiz-stage-active');}
function rankList(){
  const items=fishingRanking(pub?.scores||{}),out=$('fishing-leaders');out.replaceChildren();
  items.slice(0,pub?.state==='finished'?100:5).forEach((s,i)=>{
    const row=document.createElement('div');row.className='fishing-rank-row'+(s.uid===uid?' fishing-rank-me':'');
    const name=document.createElement('span');name.textContent=`${i<3?['🥇','🥈','🥉'][i]:`${i+1}위`} ${s.name||'친구'} · Lv.${s.level}`;
    const weight=document.createElement('strong');weight.textContent=`${Number(s.kg||0).toFixed(1)} kg`;
    row.append(name,weight);out.append(row);
  });
  const me=items.findIndex(s=>s.uid===uid);
  $('fishing-place').textContent=me<0?'—':`${me+1}위 / ${items.length}명`;
}
function revealContent(){
  const result=own?.result||{},score=pub?.scores?.[uid]||{};
  const creature=CREATURES.find(x=>x.id===result.creatureId);
  const sprite=$('fishing-catch-image');sprite.hidden=true;
  $('fishing-catch-emoji').hidden=false;
  $('fishing-catch-emoji').textContent=result.emoji||'🎣';
  $('fishing-reward').dataset.rarity=result.tier||'normal';
  $('fishing-reward').classList.toggle('fishing-break-effect',result.type==='broken');
  let title='다음 낚시에 도전하세요!',desc='';
  if(result.type==='fish'){
    title=`${result.name||creature?.name||'물고기'}!`;
    desc=`+${Number(result.kg||0).toFixed(1)} kg 획득!`;
    if(creature){
      sprite.src=`images/fishing/${creature.id}.png?v=5.0.11`;sprite.alt=title;
      sprite.hidden=false;$('fishing-catch-emoji').hidden=true;
      sprite.onerror=()=>{sprite.hidden=true;$('fishing-catch-emoji').hidden=false;};
    }
  }else if(result.type==='upgrade'){
    title=`✨ 루어 ${result.newLevel}단계 강화 성공!`;
    desc='이제 더 무거운 바다 생물을 만날 수 있어요.';
    const newLevel=result.newLevel||((score.level||1));
    sprite.src=lureAsset(newLevel);sprite.alt=`루어 ${newLevel}단계`;sprite.hidden=false;$('fishing-catch-emoji').hidden=true;
    $('fishing-reward').dataset.rarity='rare';
  }else if(result.type==='broken'){
    title='💥 낚싯대가 부러졌습니다!';
    desc='루어가 1단계로 돌아왔어요. 이미 잡은 kg은 그대로 유지됩니다.';
    $('fishing-catch-emoji').textContent='🪵';
  }else if(result.type==='upgrade-miss'){
    title='루어를 놓쳤어요!';desc='내구도 -1. 정답 1~3개 뒤 같은 단계 루어가 다시 등장합니다.';
    $('fishing-catch-emoji').textContent='💨';
  }else if(result.type==='penalty'){
    title='🪼 깜짝 방해 이벤트!';
    desc='나를 제외한 모든 친구에게 잠깐 방해 효과가 나타납니다.';
    $('fishing-catch-emoji').textContent='🌊';
  }else{
    title='물고기가 도망갔어요!';desc='내구도 -1. 다음 낚시로 다시 도전해요.';
    $('fishing-catch-emoji').textContent='💦';
  }
  $('fishing-reward-title').textContent=title;
  $('fishing-reward-detail').textContent=desc;
  $('fishing-reward-total').textContent=`현재 누적 ${Number(score.kg||0).toFixed(1)} kg`;
  const review=$('fishing-correct-review');
  review.hidden=!(result.correct===false&&result.correctAnswer);
  if(!review.hidden)review.textContent='📖 이번 문제의 정답: '+String(result.correctAnswer);
  playResultSound(result.type,result.tier);
}
function renderQuestion(){
  if(!own||own.phase!=='question')return;
  const opts=$('fishing-choices'),figure=$('fishing-question-image-wrap');
  const image=$('fishing-question-image'),warning=$('fishing-question-image-warning');
  const card=$('fishing-question-card');
  card.classList.remove('has-image');
  opts.replaceChildren();
  selected='';pending=false;questionNonce=own.nonce;
  $('fishing-question').textContent=own.prompt||'문제 대기 중';
  $('fishing-question-label').textContent=`📖 ${own.number||''}번 문제`;
  $('fishing-submit').disabled=true;
  // Choices MUST render before attempting to resolve an optional image URL.
  if(own.type==='typing'){
    const field=document.createElement('input');field.type='text';field.maxLength=180;
    field.autocomplete='off';field.placeholder='정답을 입력하세요';field.className='fishing-typing';
    field.addEventListener('input',()=>{selected=field.value.trim();$('fishing-submit').disabled=!selected||pending;});
    field.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void submitAnswer();}});
    opts.append(field);
  }else{
    const options=(Array.isArray(own.options)?own.options:Object.values(own.options||{}))
      .filter(value=>value!==null&&value!==undefined&&String(value).trim());
    for(const [i,label] of options.entries()){
      const button=document.createElement('button');button.type='button';button.className='fishing-choice';
      const num=document.createElement('b');num.textContent=String(i+1);
      const text=document.createElement('span');text.textContent=String(label);
      button.append(num,text);
      button.addEventListener('click',()=>{
        selected=String(i+1);opts.querySelectorAll('button').forEach(b=>b.classList.toggle('chosen',b===button));
        $('fishing-submit').disabled=false;
      });opts.append(button);
    }
    if(!options.length){
      const info=document.createElement('p');info.className='fishing-question-image-warning';
      info.textContent='보기 정보를 불러오지 못했습니다. 선생님께 알려 주세요.';opts.append(info);
    }
  }
  // A missing, invalid or failed question image must never suppress inputs/choices.
  image.onload=null;image.onerror=null;image.removeAttribute('src');figure.hidden=true;warning.hidden=true;
  const imageNonce=own.nonce;
  if(own.imageUrl){
    try{
      const url=fullQuestionImageUrl(own.imageUrl,location.href);
      if(url){
        image.onerror=()=>{
          if(questionNonce!==imageNonce || own?.nonce!==imageNonce || image.src!==url)return;
          figure.hidden=true;warning.hidden=false;card.classList.remove('has-image');
        };
        image.src=url;figure.hidden=false;card.classList.add('has-image');
      }
    }catch(err){
      console.warn('[fishing] question image unavailable:',err);
      warning.hidden=false;
    }
  }
}
function learningTier(rate){return rate>=75?'high':rate>=50?'mid':'low'}
function renderFishingLearning(score){
 const answered=Number(score.answered||0),correct=Number(score.correct||0);
 const rate=answered?Math.round(correct*100/answered):null;
 $('fishing-my-rate').textContent=rate===null?'자료 없음':rate+'%';
 $('fishing-my-rate-detail').textContent=correct+'/'+answered+'회 정답 · 실제 제출한 모든 답안 기준';
 const fill=$('fishing-my-rate-fill');fill.style.width=(rate===null?0:rate)+'%';fill.dataset.tier=rate===null?'none':learningTier(rate);
 const data=pub?.learningResults?.[learningMode]?.questions;
 const signature=JSON.stringify({learningMode,data});
 if(signature===learningSignature)return;
 learningSignature=signature;
 const target=$('fishing-learning-list');target.replaceChildren();
 if(!data){const p=document.createElement('p');p.textContent='교사 화면에서 학습 결과를 집계하는 중입니다.';target.append(p);return;}
 const rows=Array.isArray(data)?data:Object.values(data);
 if(!rows.length){const p=document.createElement('p');p.textContent='문항별 풀이 기록이 없습니다.';target.append(p);return;}
 for(const entry of rows){
  const rate=entry.rate==null?null:Number(entry.rate);
  const row=document.createElement('div');row.className='fishing-learning-row';
  if(rate!==null)row.dataset.tier=learningTier(rate);
  const top=document.createElement('div');top.className='fishing-learning-row-head';
  const title=document.createElement('strong');title.textContent=String(entry.number||'')+'번. '+String(entry.prompt||'');
  const number=document.createElement('b');number.textContent=rate===null?'—':rate+'%';
  top.append(title,number);row.append(top);
  const detail=document.createElement('small');detail.textContent=Number(entry.correct||0)+'/'+Number(entry.total||0)+'회 정답 · 참여 '+Number(entry.students||0)+'명';
  row.append(detail);
  const track=document.createElement('div');track.className='fishing-learning-track';
  const fill=document.createElement('span');fill.style.width=(rate===null?0:Math.max(0,Math.min(100,rate)))+'%';
  track.append(fill);row.append(track);target.append(row);
 }
}
function render(){
  if(!code||!uid||!pub){renderStudentPause(null,false);show(false);return;}
  const phase=pub.state||'lobby';
  show(['ready','playing','finished'].includes(phase));
  renderStudentPause(pub,!stage.hidden);
  if(stage.hidden)return;
  const score=pub?.scores?.[uid]||{};
  $('fishing-clock').textContent=phase==='playing'?formatClock(gameRemainingSeconds(pub,now())):'—';
  $('fishing-weight').textContent=`${Number(score.kg||0).toFixed(1)} kg`;
  setLureVisual(score.level||1);
  $('fishing-durability').textContent='❤️'.repeat(score.durability||0)+'🖤'.repeat(Math.max(0,5-(score.durability||0)));
  $('fishing-progress').textContent=`정답 ${score.correct||0} / 풀이 ${score.answered||0}`;
  rankList();
  renderCodex();
  for(const id of ['fishing-wait','fishing-cast-view','fishing-question-view','fishing-reward','fishing-finished'])$(id).hidden=true;
  if(phase==='finished'){$('fishing-finished').hidden=false;$('fishing-finish-weight').textContent=`${Number(score.kg||0).toFixed(1)} kg`;renderFishingLearning(score);return;}
  if(phase==='ready'||phase==='lobby'||!own){$('fishing-wait').hidden=false;return;}
  if(own.phase==='waiting'){$('fishing-wait').hidden=false;$('fishing-wait').textContent='준비한 문제를 모두 풀었어요! 선생님의 종료 안내를 기다려 주세요.';return;}
  if(own.phase==='cast'||own.phase==='bite'){
    $('fishing-cast-view').hidden=false;
    const bite=own.phase==='bite',hit=bite&&(gameIsPaused(pub)?Number(pub.pauseStartedAt):now())>=Number(own.biteAt||Infinity);
    const button=$('fishing-cast-button');
    button.textContent=bite?(hit?'🎣 HIT! 지금 낚아 올리기!':'🐟 입질을 기다리는 중…'):'🎣 낚싯대 던지기 · CAST!';
    button.disabled=(bite&&!hit)||pending||(action?.nonce===own.nonce&&action?.type===(bite?'hook':'cast'));
    $('fishing-boat').dataset.phase=bite?(hit?'hit':'waiting'):'cast';
    if(hit&&hitPlayedNonce!==own.nonce){hitPlayedNonce=own.nonce;safePlay($('fishing-sfx-hit'),.53);} 
    $('fishing-cast-hint').textContent=bite?(hit?'입질이 왔어요! 한 번 더 눌러 문제를 풀어요.':'1~3초 뒤에 입질이 옵니다.'): '눌러서 바다에 낚싯대를 던져 보세요!';
    return;
  }
  if(own.phase==='question'){
    $('fishing-question-view').hidden=false;
    if(questionNonce!==own.nonce)renderQuestion();
    else $('fishing-submit').disabled=pending||!!answer||!selected;
    return;
  }
  if(own.phase==='result'){$('fishing-reward').hidden=false;if(rewardNonce!==own.nonce){rewardNonce=own.nonce;revealContent();}$('fishing-next').disabled=pending||(action?.nonce===own.nonce&&action?.type==='next');}
}
function formatClock(sec){const v=Math.max(0,Math.ceil(sec));return `${Math.floor(v/60)}:${String(v%60).padStart(2,'0')}`;}
async function sendAction(type){
  if(!code||!uid||!own||pending||pub?.state!=='playing'||gameIsPaused(pub))return;
  const nonce=own.nonce;
  ensureBgm();
  if(type==='cast')safePlay($('fishing-sfx-cast'),.49);
  pending=true;render();notice(type==='cast'?'낚싯대를 던지는 중…':type==='hook'?'물고기를 끌어올리는 중…':'다음 낚시 준비 중…');
  try{await set(ref(db,`v5/actions/${code}/${uid}/${nonce}/${type}`),{at:serverTimestamp()});action={nonce,type};}
  catch(err){action=null;notice('낚시 진행 실패: '+formatError(err),true);}finally{pending=false;render();}
}
async function submitAnswer(){
  if(!code||!uid||!own||own.phase!=='question'||!selected||answer||pending||pub?.state!=='playing'||gameIsPaused(pub))return;
  ensureBgm();
  const nonce=own.nonce;pending=true;render();
  try{
    await set(ref(db,`v5/answers/${code}/${uid}/${nonce}`),{value:selected,at:serverTimestamp()});
    notice('제출했습니다. 정답을 확인하고 있어요.');
  }catch(err){notice('제출 실패: '+formatError(err),true);}finally{pending=false;render();}
}
function showPenalty(evt){
  if(!evt||evt.actorUid===uid||evt.id===shownEvent||!code||pub?.state!=='playing')return;
  shownEvent=evt.id;
  const ms=Math.max(0,Number(evt.durationMs||FISHING_PENALTY_DURATION_MS)-(now()-Number(evt.at||0)));
  if(ms<=0)return;
  const layer=$('fishing-penalty');layer.hidden=false;layer.dataset.effect=evt.effect||'school';
  $('fishing-penalty-description').textContent=({school:'🐟 물고기 떼 출몰!',jelly:'🪼 해파리가 떠다녀요!',ink:'🐙 먹물이 바다를 뒤덮어요!',shrink:'🌊 화면이 작아졌어요!'})[evt.effect]||'깜짝 벌칙!';
  stage.classList.toggle('fishing-shrunken',evt.effect==='shrink');
  // Re-trigger CSS animations without disabling question controls.
  layer.classList.remove('fishing-penalty-playing');
  void layer.offsetWidth;
  layer.classList.add('fishing-penalty-playing');
  if(eventTimer)clearTimeout(eventTimer);
  eventTimer=setTimeout(()=>{layer.hidden=true;layer.classList.remove('fishing-penalty-playing');stage.classList.remove('fishing-shrunken');},ms);
}
export function stopFishingView(){
  renderStudentPause(null,false);
  subs.forEach(fn=>fn());subs=[];code='';uid='';pub=null;own=null;answer=null;
  questionNonce='';rewardNonce='';selected='';pending=false;shownEvent='';action=null;hitPlayedNonce='';learningMode='first';learningSignature='';
  if(eventTimer)clearTimeout(eventTimer);if(animTimer)clearTimeout(animTimer);
  $('fishing-penalty').hidden=true;$('fishing-penalty').classList.remove('fishing-penalty-playing');stage.classList.remove('fishing-shrunken');setCodexOpen(false);stopBgm();show(false);
}
export function startFishingView(roomCode,userUid){
  stopFishingView();code=roomCode;uid=userUid;
  $('fishing-learning-mode').value='first';
  $('fishing-learning-mode').onchange=e=>{learningMode=e.target.value==='all'?'all':'first';learningSignature='';renderFishingLearning(pub?.scores?.[uid]||{});};
  codex=createFishingCodex($('fishing-codex-left'),$('fishing-codex-right'),CREATURES);
  try{audioEnabled=(localStorage.getItem('purplekit_fishing_audio')||'on')!=='off';}catch{audioEnabled=true;}
  studentBgm.setEnabled(audioEnabled);
  $('fishing-student-track').value=studentBgm.trackId;
  setAudioToggle();
  for(const [key,path] of [['pub',`v5/public/${code}`],['own',`v5/memberState/${code}/${uid}`],['answer',`v5/answers/${code}/${uid}`]]){
    const currentCode=code;
    subs.push(onValue(ref(db,path),snap=>{
      if(currentCode!==code)return;
      if(key==='pub'){pub=snap.val();if(pub?.penaltyEvent)showPenalty(pub.penaltyEvent);}
      else if(key==='own'){
        const prev=own?.nonce,prevPhase=own?.phase;own=snap.val();if(prev!==own?.nonce){answer=null;questionNonce='';action=null;}else if(prevPhase!==own?.phase)action=null;
      }else answer=own?.nonce?snap.val()?.[own.nonce]||null:null;
      render();
    },err=>notice('실시간 게임 연결 오류: '+formatError(err),true)));
  }
  subs.push(onValue(ref(db,'.info/serverTimeOffset'),s=>{if(code)offset=Number(s.val()||0);}));
  animTimer=setInterval(()=>{
    if(pub?.state!=='playing')return;
    $('fishing-clock').textContent=formatClock((Number(pub.endsAt||0)-now())/1000);
    if(own?.phase==='bite'&&!stage.hidden)render();
  },200);
}
$('fishing-cast-button').addEventListener('click',()=>{
  if(own?.phase==='cast')void sendAction('cast');
  else if(own?.phase==='bite'&&now()>=Number(own.biteAt||Infinity))void sendAction('hook');
});
$('fishing-submit').addEventListener('click',()=>void submitAnswer());
$('fishing-next').addEventListener('click',()=>void sendAction('next'));

for(const track of FISHING_TRACKS){
 const option=document.createElement('option');option.value=track.id;option.textContent=track.name;
 $('fishing-student-track').append(option);
}
$('fishing-student-track').addEventListener('change',e=>{
 studentBgm.setTrack(e.target.value);
 if(audioEnabled&&pub?.state==='playing')ensureBgm();
});
$('fishing-audio-toggle')?.addEventListener('click',()=>setAudioEnabled(!audioEnabled));

$('fishing-codex-toggle').addEventListener('click',()=>setCodexOpen(!stage.classList.contains('fishing-codex-open')));
$('fishing-codex-close').addEventListener('click',()=>setCodexOpen(false));
$('fishing-codex-backdrop').addEventListener('click',()=>setCodexOpen(false));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&stage.classList.contains('fishing-codex-open'))setCodexOpen(false);});
