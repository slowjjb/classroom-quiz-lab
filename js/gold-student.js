import { db, formatError } from './firebase.js';
import { ref, onValue, set, serverTimestamp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import { createAvatarImage } from './avatars.js';
import { fullQuestionImageUrl } from './image-utils.js';
import { goldRanking } from './gold-core.js';
import { createArcadeUi, renderPodium } from './arcade-ui.js';

const $=id=>document.getElementById(id);
const stage=$('gold-student');
const sound=createArcadeUi('gold-student',{role:'student',mode:'gold'});
let code='',uid='',stopListeners=[],pub=null,own=null,ownAnswer=null,ownPick=null;
let selected='',selectedNonce='',submitting=false,picking=false,clockOffset=0,finishedShown=false;
const clientTime=()=>Date.now()+clockOffset;
function message(text,type=''){$('gold-student-message').textContent=text;$('gold-student-message').dataset.kind=type;}
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
function renderQuestion(){
  const question=$('gold-question');question.textContent=own?.prompt||'문제를 기다리는 중입니다.';
  const options=$('gold-answer-choices');options.replaceChildren();
  $('gold-question-n').textContent=`${Number(own?.answered||0)+1}번째 도전`;
  $('gold-question-image-wrap').hidden=true;
  if(own?.imageUrl){
    try{const src=fullQuestionImageUrl(own.imageUrl,location.href);
      if(src){$('gold-question-image-wrap').hidden=false;$('gold-question-image').src=src;}
    }catch{}
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
function render(){
  if(!code||!uid)return;
  const phase=pub?.state||'ready';
  if(phase==='ready'||!pub){show(false);return;}
  show(true);
  $('gold-student-state').textContent=phase==='finished'?'게임 종료':'골드 퀘스트';
  const me=pub?.scores?.[uid];
  $('gold-my-coins').textContent=`${Number(me?.gold||0).toLocaleString('ko-KR')} G`;
  $('gold-my-progress').textContent=`정답 ${me?.correct||0} / 풀이 ${me?.answered||0}`;
  $('gold-student-question-view').hidden=phase==='finished'||own?.phase==='treasure'||own?.phase==='waiting';
  $('gold-student-treasure-view').hidden=phase==='finished'||own?.phase!=='treasure';
  $('gold-student-finish-view').hidden=phase!=='finished';
  $('gold-student-wait-view').hidden=phase==='finished'||!(own?.phase==='waiting'||!own);
  if(phase==='finished'){
    sound.sync({state:'finished',questionId:'gold-ended'});
    if(!finishedShown){renderPodium($('gold-student-podium'),ranked().map(p=>({...p,score:Number(p.gold||0)})));finishedShown=true;}
    rankList($('gold-student-final-ranking'),100);return;
  }
  sound.sync({state:'question',questionId:own?.nonce||'wait'});
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
  const nonce=own.nonce;picking=true;sound.choice();render();
  try{await set(ref(db,`v4/picks/${code}/${uid}/${nonce}`),{choice,at:serverTimestamp()});
    $('gold-chest-feedback').textContent='보물상자를 열고 있습니다…';
  }catch(err){message('보물상자 선택 실패: '+formatError(err),'error');}
  finally{picking=false;render();}
}
export function stopGoldView(){
  for(const un of stopListeners)un();stopListeners=[];
  code='';uid='';pub=null;own=null;ownAnswer=null;ownPick=null;selected='';selectedNonce='';submitting=false;picking=false;finishedShown=false;
  $('gold-answer-choices').dataset.nonce='';sound.reset();show(false);
}
export function startGoldView(roomCode,userUid){
  stopGoldView();code=roomCode;uid=userUid;
  const c=code,u=uid;
  const watch=(path,callback)=>stopListeners.push(onValue(ref(db,path),snap=>{if(code===c&&uid===u){callback(snap.val());render();}},err=>message('실시간 연결 오류: '+formatError(err),'error')));
  watch(`v4/public/${c}`,value=>pub=value);
  watch(`v4/memberState/${c}/${u}`,value=>{
    const old=own?.nonce;own=value;
    if(old!==own?.nonce){selected='';selectedNonce='';ownAnswer=null;ownPick=null;$('gold-answer-choices').dataset.nonce='';}
  });
  watch(`v4/answers/${c}/${u}`,value=>ownAnswer=value?.[own?.nonce]||null);
  watch(`v4/picks/${c}/${u}`,value=>ownPick=value?.[own?.nonce]||null);
}
$('gold-submit').addEventListener('click',()=>void submit());
$('gold-chest-buttons').querySelectorAll('[data-chest]').forEach(button=>button.addEventListener('click',()=>void pick(Number(button.dataset.chest))));
setInterval(()=>{
  if(!code||!uid||pub?.state!=='playing')return;
  const remain=Math.max(0,Math.ceil((Number(pub.endsAt||0)-clientTime())/1000));
  $('gold-student-clock').textContent=`${Math.floor(remain/60)}:${String(remain%60).padStart(2,'0')}`;
},500);
if(db)onValue(ref(db,'.info/serverTimeOffset'),snap=>clockOffset=Number(snap.val()||0));
