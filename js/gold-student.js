import { db, formatError } from './firebase.js';
import { ref, onValue, set, serverTimestamp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import { createAvatarImage } from './avatars.js';
import { fullQuestionImageUrl } from './image-utils.js';
import { goldRanking, describeGoldReveal } from './gold-core.js?v=4.11';
import { createArcadeUi, renderPodium } from './arcade-ui.js?v=4.5';

const $=id=>document.getElementById(id);
const stage=$('gold-student');
const sound=createArcadeUi('gold-student',{role:'student',mode:'gold'});
let code='',uid='',stopListeners=[],pub=null,own=null,ownAnswer=null,ownPick=null,ownTarget=null;
let selected='',selectedNonce='',submitting=false,picking=false,clockOffset=0,finishedShown=false;
let pendingPickNonce='',showingRewardNonce='',revealedRewardNonce='',rewardTimer=null;
let targetSelected='',targetSubmitting=false,targetSentNonce='',studentStudyMode='first';
const REWARD_DISPLAY_MS=3800;
function closeReward({rerender=true}={}){
  if(rewardTimer){clearTimeout(rewardTimer);rewardTimer=null;}
  $('gold-reward-reveal').hidden=true;
  if(showingRewardNonce)revealedRewardNonce=showingRewardNonce;
  showingRewardNonce='';pendingPickNonce='';
  if(rerender&&code&&uid)render();
}
function maybeRevealReward(){
  // Await a teacher-confirmed, persisted payout for the chest THIS device chose.
  // A stale result from an earlier session must not pop up on room entry.
  if(!pendingPickNonce||showingRewardNonce||revealedRewardNonce===pendingPickNonce)return;
  const me=pub?.scores?.[uid];
  if(!me||me.lastRewardNonce!==pendingPickNonce||!me.lastReward)return;
  const info=describeGoldReveal(me.lastReward);
  showingRewardNonce=pendingPickNonce;
  const panel=$('gold-reward-reveal');panel.dataset.mood=info.mood;
  $('gold-reward-icon').textContent=info.icon;
  $('gold-reward-title').textContent=info.heading;
  $('gold-reward-prize').textContent=info.prize;
  $('gold-reward-chest').textContent=info.chest;
  $('gold-reward-change').textContent=info.change;
  $('gold-reward-detail').textContent=info.description;
  $('gold-reward-balance').textContent=`현재 보유 골드: ${Math.floor(Number(me.gold||0)).toLocaleString('ko-KR')} G`;
  panel.hidden=false;
  sound.reward(info.mood);
  rewardTimer=setTimeout(()=>closeReward(),REWARD_DISPLAY_MS);
}

const clientTime=()=>Date.now()+clockOffset;
function message(text,type=''){
  $('gold-student-message').textContent=text;
  $('gold-student-message').dataset.kind=type;
  if(type==='error'&&stage.hidden){
    const lobby=$('join-feedback');
    if(lobby){lobby.textContent='골드 퀘스트 데이터를 읽지 못했습니다. 선생님께 v4 Firebase 보안 규칙을 확인해 달라고 말씀해 주세요. ('+text+')';lobby.dataset.kind='error';}
  }
}
function element(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=String(text);return el;}
function ranked(){return goldRanking(pub?.scores||{});}
function show(on){stage.hidden=!on;document.body.classList.toggle('quiz-stage-active',on);if(on)$('student-room').hidden=true;}
function rankList(container,limit=10){
  container.replaceChildren();
  ranked().slice(0,limit).forEach((player,i)=>{
    const line=element('div','gold-rank-row'+(player.uid===uid?' gold-rank-self':''));
    const rank=element('b','gold-rank-place',i<3?['🥇','🥈','🥉'][i]:`${i+1}위`);
    const title=element('strong','gold-rank-label',player.uid===uid?`나 · ${player.name}`:player.name);
    const coins=element('strong','gold-rank-gold',`${Number(player.gold||0).toLocaleString('ko-KR')} G`);
    line.append(rank,createAvatarImage(player.avatarId,{size:'sm',decorative:true}),title,coins);container.append(line);
  });
}
// The teacher publishes aggregate results in v4/public when the game ends.
// Students never subscribe to raw answer logs or correct-answer values.
function renderStudentStudy(){
  const summary=$('gold-student-study-summary');
  const students=$('gold-student-study-students');
  const questions=$('gold-student-study-questions');
  students.replaceChildren();questions.replaceChildren();
  const report=pub?.learningResults?.[studentStudyMode];
  if(!report){
    summary.textContent='이 방에는 공유된 학습 분석 자료가 없습니다. v4.9 이후 새로 종료한 게임부터 표시됩니다.';
    return;
  }
  const figures=report.summary||{};
  const kind=studentStudyMode==='first'?'첫 시도':'전체 시도';
  summary.textContent=`${kind} 기준 · 정답 ${figures.correct||0}/${figures.total||0}회 · 전체 정답률 ${figures.rate==null?'—':figures.rate+'%'}`;
  const toArray=value=>Array.isArray(value)?value:Object.values(value||{});
  function appendRow(container,label,detail,rate,tier,self=false){
    const row=element('div','gold-accuracy-row'+(self?' gold-study-self':''));
    const head=element('div','gold-accuracy-head');
    const name=element('strong','',label);name.title=label;
    const percent=element('b','tier-text-'+(tier||'none'),rate==null?'—':`${rate}%`);
    head.append(name,percent);
    const track=element('div','gold-accuracy-bar');
    const fill=element('span','gold-accuracy-fill tier-'+(tier||'none'));
    fill.style.width=rate==null?'0%':`${Math.max(0,Math.min(100,Number(rate)||0))}%`;
    track.append(fill);
    row.append(head,track,element('small','',detail));container.append(row);
  }
  toArray(report.students).sort((a,b)=>a.rate==null?1:b.rate==null?-1:Number(b.rate)-Number(a.rate)||String(a.name).localeCompare(String(b.name),'ko'))
    .forEach(entry=>appendRow(students,
      (entry.uid===uid?'나 · ':'')+String(entry.name||'참가자'),
      `${entry.correct||0}/${entry.total||0}회 정답 · 고유 ${entry.uniqueQuestions||0}문항`,
      entry.rate,entry.tier,entry.uid===uid));
  toArray(report.questions).sort((a,b)=>Number(a.number)-Number(b.number)).forEach(entry=>{
    const prompt=String(entry.prompt||'');
    appendRow(questions,`${entry.number}번 · ${prompt}`,
      entry.total?`${entry.correct||0}/${entry.total}회 정답 · ${entry.students||0}명 도전`:'아직 푼 학생이 없습니다.',
      entry.rate,entry.tier);
  });
}

function renderQuestion(){
  const question=$('gold-question');question.textContent=own?.prompt||'문제를 기다리는 중입니다.';
  const options=$('gold-answer-choices');options.replaceChildren();
  $('gold-question-n').textContent=`${Number(own?.answered||0)+1}번째 도전`;
  const card=$('gold-question-card'),figure=$('gold-question-image-wrap'),image=$('gold-question-image');
  // Only image questions use the wide two-column layout; stale image events cannot alter newer questions.
  const imageNonce=own?.nonce;
  card.classList.remove('has-image');figure.hidden=true;
  image.onerror=null;image.onload=null;image.removeAttribute('src');
  if(own?.imageUrl){
    try{
      const src=fullQuestionImageUrl(own.imageUrl,location.href);
      if(src){
        image.onerror=()=>{
          if(own?.nonce!==imageNonce || image.src!==src)return;
          figure.hidden=true;card.classList.remove('has-image');
        };
        image.src=src;figure.hidden=false;card.classList.add('has-image');
      }
    }catch(err){console.warn('[gold] question image unavailable:',err);}
  }
  if(selectedNonce!==own?.nonce){selected='';selectedNonce=own?.nonce||'';}
  if(own?.type==='typing'){
    const field=element('input','gold-answer-input');field.id='gold-answer-text';field.type='text';field.autocomplete='off';field.maxLength=200;field.placeholder='정답을 입력하세요';
    field.value=selected;field.addEventListener('input',()=>{selected=field.value;updateSubmitButton();});options.append(field);
  }else{
    const all=Array.isArray(own?.options)?own.options:Object.values(own?.options||{});
    all.forEach((option,i)=>{
      const button=element('button',`gold-choice gold-choice-${i+1}${selected===String(i+1)?' selected':''}`);
      button.type='button';button.dataset.choice=String(i+1);
      const icon=element('span','gold-choice-number',i+1),text=element('strong','gold-choice-text',option);
      button.append(icon,text);button.addEventListener('click',()=>{
        if(ownAnswer||submitting)return;
        selected=String(i+1);sound.choice();
        [...options.querySelectorAll('button')].forEach(b=>b.classList.toggle('selected',b===button));
        updateSubmitButton();
      });options.append(button);
    });
  }
  updateSubmitButton();
}
function updateSubmitButton(){
  const btn=$('gold-submit');
  btn.disabled=Boolean(ownAnswer||submitting||!String(selected||'').trim()||pub?.state!=='playing');
  btn.textContent=ownAnswer||submitting?'채점을 기다리고 있어요…':'정답 제출하고 보물 찾기';
  $('gold-answer-choices').querySelectorAll('button,input').forEach(el=>el.disabled=Boolean(ownAnswer||submitting));
}
function renderTarget(){
  const available=ranked().filter(player=>player.uid!==uid);
  const options=$('gold-target-options');
  if(options.dataset.nonce!==own?.nonce){
    options.dataset.nonce=own?.nonce||'';options.replaceChildren();targetSelected='';
    available.forEach(player=>{
      const btn=element('button','gold-target-option');btn.type='button';btn.dataset.target=player.uid;
      const photo=createAvatarImage(player.avatarId,{size:'sm',decorative:true});
      const name=element('strong','gold-target-name',player.name);
      const amount=element('span','gold-target-gold',`${Math.floor(Number(player.gold||0)).toLocaleString('ko-KR')} G`);
      btn.append(photo,name,amount);
      btn.addEventListener('click',()=>{
        if(ownTarget||targetSubmitting||targetSentNonce===own?.nonce)return;
        targetSelected=player.uid;sound.choice();
        options.querySelectorAll('button').forEach(node=>node.classList.toggle('selected',node.dataset.target===targetSelected));
        updateTargetButton();
      });
      options.append(btn);
    });
  }
  // Preserve scroll and selection while updating live balance text.
  options.querySelectorAll('[data-target]').forEach(btn=>{
    const person=pub?.scores?.[btn.dataset.target];
    if(person)btn.querySelector('.gold-target-gold').textContent=`${Math.floor(Number(person.gold||0)).toLocaleString('ko-KR')} G`;
  });
  const offer=own?.pendingOutcome||{};
  $('gold-target-title').textContent=offer.type==='swap'?'누구와 골드를 교환할까요?':'누구의 골드를 가져올까요?';
  $('gold-target-description').textContent=offer.type==='swap'
    ?'선택한 친구와 보유 골드 전체를 서로 교환합니다.'
    :`선택한 친구의 보유 골드 ${Math.round(Number(offer.fraction||0)*100)}%를 가져옵니다.`;
  const remaining=Math.max(0,Math.ceil((Number(own?.targetDeadline||0)-clientTime())/1000));
  $('gold-target-clock').textContent=remaining>0?`${remaining}초 안에 선택`:'자동 선택 중…';
  $('gold-target-feedback').textContent=(ownTarget||targetSentNonce===own?.nonce)?'선택을 접수했습니다. 보상 적용을 기다리고 있어요…':targetSubmitting?'선택을 보내는 중입니다…':'시간 안에 선택하지 않으면 무작위로 결정됩니다.';
  updateTargetButton();
}
function updateTargetButton(){
  const expired=Number(own?.targetDeadline||0)<=clientTime();
  const locked=Boolean(ownTarget||targetSubmitting||targetSentNonce===own?.nonce||expired);
  $('gold-target-submit').disabled=Boolean(!targetSelected||locked);
  $('gold-target-options').querySelectorAll('button').forEach(btn=>btn.disabled=locked);
}
async function selectTarget(){
  if(!code||!uid||own?.phase!=='target'||!targetSelected||ownTarget||targetSubmitting||targetSentNonce===own?.nonce||clientTime()>Number(own.targetDeadline||0))return;
  const nonce=own.nonce,targetUid=targetSelected;targetSubmitting=true;render();
  try{
    await set(ref(db,`v4/targets/${code}/${uid}/${nonce}`),{targetUid,at:serverTimestamp()});
    targetSentNonce=nonce;
    message('상대 선택이 접수되었습니다. 보상 적용을 기다리고 있어요.');
  }catch(err){message('상대 선택 실패: '+formatError(err),'error');}
  finally{targetSubmitting=false;render();}
}
function render(){
  if(!code||!uid)return;
  const phase=pub?.state||'ready';
  if(phase==='ready'||!pub){if(showingRewardNonce)closeReward({rerender:false});show(false);return;}
  show(true);
  if(phase==='finished'&&showingRewardNonce)closeReward({rerender:false});
  if(phase==='playing')maybeRevealReward();
  $('gold-student-state').textContent=phase==='finished'?'게임 종료':'골드 퀘스트';
  const me=pub?.scores?.[uid];
  $('gold-my-coins').textContent=`${Number(me?.gold||0).toLocaleString('ko-KR')} G`;
  $('gold-my-progress').textContent=`정답 ${me?.correct||0} / 풀이 ${me?.answered||0}`;
  $('gold-student-question-view').hidden=phase==='finished'||own?.phase!=='question';
  $('gold-student-treasure-view').hidden=phase==='finished'||own?.phase!=='treasure';
  $('gold-student-target-view').hidden=phase==='finished'||own?.phase!=='target';
  $('gold-student-finish-view').hidden=phase!=='finished';
  $('gold-student-wait-view').hidden=phase==='finished'||!(own?.phase==='waiting'||!own);
  if(phase==='finished'){
    sound.sync({state:'finished',questionId:'gold-ended'});
    if(!finishedShown){renderPodium($('gold-student-podium'),ranked().map(p=>({...p,score:Number(p.gold||0)})));finishedShown=true;}
    rankList($('gold-student-final-ranking'),100);
    renderStudentStudy();return;
  }
  // Do not announce the next question while the large reward result is visible.
  if(!showingRewardNonce)sound.sync({state:'question',questionId:own?.nonce||'wait'});
  const event=pub?.lastEvent;
  const recentlyTargeted=event?.targetUid===uid && Number(event.at||0)>0 && clientTime()-Number(event.at)<9000;
  $('gold-my-last').textContent=recentlyTargeted
    ?`⚠️ 다른 친구가 보물을 가져갔어요. ${event.message}`
    :(own?.lastMessage||'문제를 맞히고 보물상자를 열어 보세요!');
  $('gold-my-last').classList.toggle('gold-notice-win',own?.lastCorrect==='reward'||own?.lastCorrect==='yes');
  const rank=ranked();const position=rank.findIndex(x=>x.uid===uid);
  $('gold-my-place').textContent=position>=0?`${position+1}위 / ${rank.length}명`:'순위 계산 중';
  if(own?.phase==='question'){
    // Rebuild only on new nonce so selected answer and keyboard focus survive live leaderboard updates.
    if($('gold-answer-choices').dataset.nonce!==own.nonce){
      $('gold-answer-choices').dataset.nonce=own.nonce;renderQuestion();
      message('정답을 선택하거나 입력해 주세요.');
    }else updateSubmitButton();
  }
  if(own?.phase==='target')renderTarget();
  if(own?.phase==='treasure'){
    $('gold-chest-feedback').textContent=ownPick||picking?'보물상자를 여는 중…':'세 개 중 하나를 선택해 주세요!';
    $('gold-chest-buttons').querySelectorAll('button').forEach(btn=>btn.disabled=Boolean(ownPick||picking));
  }
  rankList($('gold-student-leaders'),5);
}
async function submit(){
  if(!code||!uid||!own?.nonce||own.phase!=='question'||ownAnswer||submitting||!String(selected).trim())return;
  const nonce=own.nonce;submitting=true;render();sound.submit();
  try{await set(ref(db,`v4/answers/${code}/${uid}/${nonce}`),{value:String(selected).trim(),at:serverTimestamp()});
    message('제출했습니다! 선생님 화면에서 채점하는 중입니다.');
  }catch(err){message('정답 제출 실패: '+formatError(err),'error');}
  finally{submitting=false;render();}
}
async function pick(choice){
  if(!code||!uid||!own?.nonce||own.phase!=='treasure'||ownPick||picking)return;
  const nonce=own.nonce;picking=true;pendingPickNonce=nonce;sound.choice();render();
  try{await set(ref(db,`v4/picks/${code}/${uid}/${nonce}`),{choice,at:serverTimestamp()});
    $('gold-chest-feedback').textContent='보물상자를 열고 있습니다…';
  }catch(err){pendingPickNonce='';message('보물상자 선택 실패: '+formatError(err),'error');}
  finally{picking=false;render();}
}
export function stopGoldView(){
  for(const un of stopListeners)un();stopListeners=[];
  closeReward({rerender:false});revealedRewardNonce='';
  code='';uid='';pub=null;own=null;ownAnswer=null;ownPick=null;ownTarget=null;selected='';selectedNonce='';submitting=false;picking=false;targetSelected='';targetSubmitting=false;targetSentNonce='';finishedShown=false;
  studentStudyMode='first';$('gold-student-study-mode').value='first';
  $('gold-target-options').dataset.nonce='';
  $('gold-answer-choices').dataset.nonce='';sound.reset();show(false);
}
export function startGoldView(roomCode,userUid){
  stopGoldView();code=roomCode;uid=userUid;
  const c=code,u=uid;
  let targetUnsub=null;
  stopListeners.push(()=>{if(targetUnsub)targetUnsub();});
  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;if(code===c&&uid===u)render();});};
  const watch=(path,callback)=>stopListeners.push(onValue(ref(db,path),snap=>{if(code===c&&uid===u){callback(snap.val());schedule();}},err=>message('실시간 연결 오류: '+formatError(err),'error')));
  watch(`v4/public/${c}`,value=>pub=value);
  watch(`v4/memberState/${c}/${u}`,value=>{
    const old=own?.nonce;own=value;
    if(old!==own?.nonce){selected='';selectedNonce='';ownAnswer=null;ownPick=null;ownTarget=null;targetSelected='';targetSentNonce='';$('gold-answer-choices').dataset.nonce='';$('gold-target-options').dataset.nonce='';}
    // v4.7 rooms have no /targets permission, so never subscribe until needed.
    if(own?.phase==='target'&&!targetUnsub){
      targetUnsub=onValue(ref(db,`v4/targets/${c}/${u}`),snap=>{
        if(code===c&&uid===u){ownTarget=snap.val()?.[own?.nonce]||null;render();}
      },err=>message('상대 선택 기록 읽기 실패: '+formatError(err),'error'));
    }
  });
  watch(`v4/answers/${c}/${u}`,value=>ownAnswer=value?.[own?.nonce]||null);
  watch(`v4/picks/${c}/${u}`,value=>ownPick=value?.[own?.nonce]||null);
}
$('gold-student-study-mode').addEventListener('change',event=>{studentStudyMode=event.target.value==='all'?'all':'first';if(pub?.state==='finished')renderStudentStudy();});
$('gold-submit').addEventListener('click',()=>void submit());
$('gold-target-submit').addEventListener('click',()=>void selectTarget());
$('gold-reward-next').addEventListener('click',()=>closeReward());
$('gold-chest-buttons').querySelectorAll('[data-chest]').forEach(button=>button.addEventListener('click',()=>void pick(Number(button.dataset.chest))));
setInterval(()=>{
  if(!code||!uid||pub?.state!=='playing')return;
  const remain=Math.max(0,Math.ceil((Number(pub.endsAt||0)-clientTime())/1000));
  $('gold-student-clock').textContent=`${Math.floor(remain/60)}:${String(remain%60).padStart(2,'0')}`;
  if(own?.phase==='target'){
    // The countdown changes every half-second, but all 20 avatars do not.
    const remaining=Math.max(0,Math.ceil((Number(own.targetDeadline||0)-clientTime())/1000));
    $('gold-target-clock').textContent=remaining>0?`${remaining}초 안에 선택`:'자동 선택 중…';
    if(remaining<=0)updateTargetButton();
  }
},500);
if(db)onValue(ref(db,'.info/serverTimeOffset'),snap=>clockOffset=Number(snap.val()||0));
