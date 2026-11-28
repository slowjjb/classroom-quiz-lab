import { auth, db, formatError } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { ref, get, onValue, update, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import { makeShuffleBag, continuingGoldQuestionIndex, verifyGoldAnswer, shuffleGoldChoices, originalGoldChoiceIndex, displayedGoldCorrectIndex, chooseGoldOutcome, applyGoldOutcome, goldRanking, goldRewardOdds, validGoldTarget } from './gold-core.js?v=6.0.0-alpha.23';
import { optionsArray, escapeCsv } from './classic-core.js';
import { buildGoldAccuracy, makeGoldPublicLearningResults } from './gold-analytics.js?v=6.0.0-alpha.14';
import { normalizeQuestionImage } from './image-utils.js';
import { createAvatarImage } from './avatars.js';
import { createArcadeUi, renderPodium } from './arcade-ui.js?v=4.3';
import { makeRulesV6 } from './rules-v6.js?v=6.0.0-alpha.4';

const $=id=>document.getElementById(id);
const arcade=createArcadeUi('gold-focus',{role:'teacher',mode:'gold'});
let teacher=null,code='',room=null,run=null,pub=null,states={},answers={},picks={},targets={};
let ready=false,unsubs=[],metaUnsub=null,targetSubs=new Map(),modeHint='',rightsState='idle',processLock=false,operation=false,offset=0,focusOpen=false,checkToken=0;
let processingKeys=new Set(),previousRankSignature='',lastFinished=false;
let podiumCollapsed=false,resultsMode='first',hideResultsNames=false,oddsSignature='',settingsOddsSignature='';
const TARGET_WAIT_MS=15000;
const roomCode=()=>code;
function notify(text,type=''){$('gold-message').textContent=text;$('gold-message').dataset.kind=type;}
function stop(){
  ++checkToken;
  if(metaUnsub){metaUnsub();metaUnsub=null;}
  for(const {unsub} of targetSubs.values())unsub();targetSubs.clear();
  for(const unsubscribe of unsubs)unsubscribe();
  unsubs=[];room=null;run=null;pub=null;states={};answers={};picks={};targets={};ready=false;
  rightsState='idle';processLock=false;processingKeys.clear();previousRankSignature='';
  lastFinished=false;focusOpen=false;podiumCollapsed=false;oddsSignature='';settingsOddsSignature='';$('gold-focus').hidden=true;
  document.body.classList.remove('quiz-stage-active');arcade.reset();
}
// v2 room metadata is already readable with the existing classroom rules.
// Always watch it BEFORE checking v4 permissions: otherwise, if v4 access is denied,
// the gold panel itself stays hidden and no rule-installation instructions can be seen.
function watchRoomMeta(){
  if(!code||!teacher||metaUnsub)return;
  const activeCode=code;
  metaUnsub=onValue(ref(db,`v2/rooms/${activeCode}/meta`),snap=>{
    if(activeCode!==code)return;
    const meta=snap.val();
    if(meta){modeHint=meta.mode||modeHint;room={...(room||{}),meta};}
    else room=null;
    render();
  },err=>{
    if(activeCode===code)notify('방 정보 읽기 실패: '+formatError(err),'error');
  });
}
function bindRoom(next,hint=''){
  if(code===next&&ready)return;
  stop();code=next;modeHint=hint||'';
  if(code&&teacher){watchRoomMeta();void checkRights();}
  render();
}
// Subscribe only to the pending decision for each active student.
// The former single listener on /v4/targets/{room} retransmitted the entire
// growing choice history on every choice, which is unnecessary during class.
function syncTargetSubscriptions(){
  const desired=new Map();
  if(run?.targetMode==='choose'){
    for(const [uid,state] of Object.entries(states||{})){
      if(state?.phase==='target'&&state.nonce)desired.set(uid,state.nonce);
    }
  }
  for(const [uid,sub] of targetSubs){
    if(desired.get(uid)!==sub.nonce){
      sub.unsub();targetSubs.delete(uid);delete targets[uid];
    }
  }
  for(const [uid,nonce] of desired){
    if(targetSubs.has(uid))continue;
    const roomCode=code;
    const choiceRef=ref(db,`v4/targets/${roomCode}/${uid}/${nonce}`);
    const unsub=onValue(choiceRef,snap=>{
      if(code!==roomCode)return;
      if(!targets[uid])targets[uid]={};
      if(snap.exists())targets[uid][nonce]=snap.val();
      else delete targets[uid][nonce];
      void pump();
    },err=>notify('학생 상대 선택 기록 읽기 실패: '+formatError(err),'error'));
    targetSubs.set(uid,{nonce,unsub});
  }
}
function watch(){
  if(!ready||!teacher||!code)return;
  const c=code;
  for(const [path,key] of [
    [`v2/rooms/${c}`,'room'],[`v4/privateRuns/${c}`,'run'],[`v4/public/${c}`,'pub'],
    [`v4/memberState/${c}`,'states'],[`v4/answers/${c}`,'answers'],[`v4/picks/${c}`,'picks']
  ])unsubs.push(onValue(ref(db,path),snap=>{if(code!==c)return;
    const value=snap.val();
    if(key==='room')room=value;else if(key==='run')run=value;else if(key==='pub')pub=value;
    else if(key==='states')states=value||{};else if(key==='answers')answers=value||{};else if(key==='picks')picks=value||{};
    if(key==='run'||key==='states')syncTargetSubscriptions();
    // Answers/picks/state callbacks do not change the teacher's leaderboard UI.
    if(key==='room'||key==='run'||key==='pub')render();
    void pump();
  },err=>notify('골드 퀘스트 읽기 실패: '+formatError(err),'error')));
}
async function checkRights(){
  if(!teacher||!code)return;
  const token=++checkToken;
  ready=false;rightsState='checking';render();
  notify('v4 골드 퀘스트 권한을 확인하고 있습니다.');
  try{
    await get(ref(db,'v4/versionCheck'));
    if(token!==checkToken||!teacher||!code)return;
    ready=true;rightsState='ready';render();watch();
    notify('v4 골드 퀘스트 권한 확인 완료! 「보물찾기 준비」를 눌러 주세요.','success');
  }catch(err){
    if(token!==checkToken)return;
    ready=false;rightsState='denied';render();
    notify('v4 보안 규칙이 아직 적용되지 않았습니다. 위에서 전체 규칙을 복사해 Firebase에 게시한 뒤 「권한 다시 확인」을 눌러 주세요. ('+formatError(err)+')','error');
  }
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
  const isGold=Boolean(code&&(room?.meta?.mode==='gold'||modeHint==='gold'));
  $('gold-panel').hidden=!isGold;
  if(!isGold){$('gold-focus').hidden=true;document.body.classList.remove('quiz-stage-active');return;}
  // Never hide the installation instructions merely because v4 access failed.
  $('gold-rules').hidden=ready;
  $('gold-retry-rights').disabled=rightsState==='checking'||!teacher;
  $('gold-rules-state').textContent=rightsState==='checking'
    ?'Firebase 보안 권한 확인 중입니다…'
    :rightsState==='denied'
      ?'v4 보안 규칙을 게시해야 골드 퀘스트를 준비할 수 있습니다.'
      :'Firebase 규칙을 처음 설치하는 경우 아래 버튼으로 통합 규칙을 복사해 주세요.';
  $('gold-room-label').textContent=`${code} · ${room?.meta?.title||'방 정보 확인 중'} · ${room?.meta?.setTitle||'문제 미선택'}`;
  const state=pub?.state||'lobby';
  $('gold-status').textContent=({lobby:'대기실',ready:'게임 준비 완료',playing:'진행 중',finished:'게임 종료'})[state]||'대기 중';
  $('gold-status').className=`pill pill-${state==='playing'?'success':state==='finished'?'error':'neutral'}`;
  $('gold-prepare').disabled=!ready||operation||Boolean(run)||room?.meta?.state==='ended'||!room?.meta?.setId;
  $('gold-start').disabled=!ready||operation||!run||state!=='ready';
  $('gold-end').disabled=!ready||operation||state!=='playing';
  $('gold-pause').disabled=!ready||operation||state!=='playing';
  $('gold-pause').textContent=pub?.pauseStartedAt?'▶️ 계속하기':'⏸️ 일시정지';
  $('gold-export').disabled=!run;
  $('gold-focus-open').disabled=!run;
  $('gold-settings').hidden=Boolean(run);
  $('gold-target-mode').disabled=!$('gold-interactions').checked;
  renderSettingsOdds();
  $('gold-count').textContent=`${Object.keys(run?.roster||{}).length}명 · ${run?.questions?.length||0}문항`;
  $('gold-live-count').textContent=`${Object.values(pub?.scores||{}).reduce((n,x)=>n+Number(x.answered||0),0)}회 풀이`;
  rankRows($('gold-live-ranking'));
  if(focusOpen)renderFocus();
}
function updateGoldTop3(state,alias){
  const container=$('gold-focus-top3');container.replaceChildren();
  const leaders=goldRanking(pub?.scores||{}).slice(0,3);
  if(!leaders.length){$('gold-focus-lead').hidden=false;$('gold-focus-lead').textContent='친구들의 첫 보물을 기다리고 있습니다.';return;}
  $('gold-focus-lead').hidden=true;
  leaders.forEach((player,i)=>{
    const item=document.createElement('div');item.className=`gold-top-card gold-top-card-${i+1}`;
    const rank=document.createElement('strong');rank.className='gold-top-rank';rank.textContent=['🥇 1위','🥈 2위','🥉 3위'][i];
    const name=document.createElement('span');name.className='gold-top-name';
    name.textContent=state==='finished'&&hideResultsNames?alias(player.uid):player.name;
    const gold=document.createElement('b');gold.className='gold-top-amount';gold.textContent=`${Number(player.gold||0).toLocaleString('ko-KR')} G`;
    item.append(rank,name,gold);container.append(item);
  });
}
function renderSettingsOdds(){
  const container=$('gold-odds-settings');if(!container)return;
  const allowed=$('gold-interactions').checked;
  const key=String(allowed);
  if(key===settingsOddsSignature)return;
  settingsOddsSignature=key;
  const current=goldRewardOdds({allowInteractions:allowed,playerCount:20});
  const groups=[
    ['골드 획득',x=>x.type==='coins'],
    ['배수·빈 상자',x=>x.type==='multiply'||x.type==='empty'],
    ['빼앗기·교환',x=>x.type==='steal'||x.type==='swap'],
    ['내 골드 잃기',x=>x.type==='lose']
  ];
  container.replaceChildren();
  const fmt=p=>Number(p.toFixed(4)).toString()+'%';
  for(const [title,filter] of groups){
    const items=current.filter(filter);
    if(!items.length)continue;
    const block=document.createElement('div'),heading=document.createElement('strong');
    const paragraph=document.createElement('p');heading.textContent=title;
    paragraph.textContent=items.map(x=>`${x.label} ${fmt(x.percent)}`).join(' · ');
    block.append(heading,paragraph);container.append(block);
  }
}
function updateGoldOdds(){
  const isOn=run?.allowInteractions!==false;
  const playerCount=Object.keys(run?.roster||pub?.scores||{}).length;
  const odds=goldRewardOdds({allowInteractions:isOn,playerCount});
  const signature=JSON.stringify({isOn,playerCount});
  if(signature===oddsSignature)return;
  oddsSignature=signature;
  const grid=$('gold-focus-odds-grid');grid.replaceChildren();
  const groups=[{key:'coins',label:'🪙 골드 획득'},
    {key:'special',label:'✨ 배수·빈 상자'},
    {key:'steal',label:'🎯 빼앗기·교환'},
    {key:'lose',label:'💥 골드 잃기'}];
  for(const group of groups){
    const list=odds.filter(e=>group.key==='special'?['multiply','empty'].includes(e.type):group.key==='steal'?['steal','swap'].includes(e.type):e.type===group.key);
    if(!list.length)continue;
    const card=document.createElement('div');card.className='gold-odds-card';
    const title=document.createElement('h3');title.textContent=group.label;card.append(title);
    list.forEach(x=>{
      const row=document.createElement('div');row.className='gold-odds-row';
      const label=document.createElement('span');label.textContent=x.label;
      const pct=document.createElement('b');pct.textContent=`${Number(x.percent.toFixed(2))}%`;
      row.append(label,pct);card.append(row);
    });
    grid.append(card);
  }
  $('gold-focus-odds-note').textContent=isOn&&playerCount>1
    ?'상자 3개 동일 확률 · 공격 허용'
    :'공격 제외 · 나머지 보상 확률 재조정';
}
function renderFocus(){
  if(!focusOpen)return;
  $('gold-focus').hidden=false;document.body.classList.add('quiz-stage-active');
  const state=pub?.state||'ready';
  $('gold-focus').classList.toggle('gold-is-finished',state==='finished');
  arcade.sync({state:state==='playing'?'question':state==='finished'?'finished':'ready',questionId:'gold-'+(pub?.startedAt||'')});
  $('gold-focus-state').textContent=state==='playing'?'보물 찾는 중!':state==='finished'?'게임 종료':'시작 준비';
  const time=state==='playing'?Math.max(0,Math.ceil((Number(pub.endsAt||0)-(Number(pub.pauseStartedAt||0)||(Date.now()+offset)))/1000)):0;
  $('gold-focus-clock').textContent=state==='playing'?`${Math.floor(time/60)}:${String(time%60).padStart(2,'0')}`:'—';
  const names=Object.keys(run?.roster||{}).sort();
  const alias=uid=>`참가자 ${Math.max(0,names.indexOf(uid))+1}`;
  updateGoldTop3(state,alias);
  updateGoldOdds();
  $('gold-focus-prepare').disabled=$('gold-prepare').disabled;
  $('gold-focus-start').disabled=$('gold-start').disabled;
  $('gold-focus-end').disabled=$('gold-end').disabled;
  $('gold-focus-pause').disabled=$('gold-pause').disabled;
  $('gold-focus-pause').textContent=$('gold-pause').textContent;
  rankRows($('gold-focus-ranking'),true);
  $('gold-focus-podium').hidden=state!=='finished';
  $('gold-focus-top3').hidden=state==='finished';
  $('gold-focus-odds').hidden=state==='finished';
  $('gold-finish-stats').hidden=state!=='finished';
  $('gold-focus-main').classList.toggle('gold-podium-collapsed',state==='finished'&&podiumCollapsed);
  $('gold-podium-toggle').textContent=podiumCollapsed?'시상대 펼치기':'시상대 접기';
  if(state==='finished'){
    const signature=JSON.stringify({top:goldRanking(pub?.scores||{}).slice(0,3),hideResultsNames});
    if(previousRankSignature!==signature){renderPodium($('gold-focus-podium'),goldRanking(pub?.scores||{}).map(x=>({...x,name:hideResultsNames?alias(x.uid):x.name,score:Number(x.gold||0)})));previousRankSignature=signature;}
    renderGoldAnalytics();
  }
  if(state==='finished'&&!lastFinished){lastFinished=true;arcade.fanfare();}
}

function analyticsBar({rate,tier}){
  const wrap=document.createElement('div');wrap.className='gold-accuracy-bar';
  const fill=document.createElement('span');fill.className='gold-accuracy-fill tier-'+tier;
  fill.style.width=rate===null?'0%':`${Math.max(0,Math.min(100,rate))}%`;
  wrap.append(fill);return wrap;
}
function renderGoldAnalytics(){
  if(!run || pub?.state!=='finished')return;
  const results=buildGoldAccuracy({roster:run.roster||{},scores:pub?.scores||{},questions:run.questions||[],
    answersLog:run.answersLog||{},mode:resultsMode});
  const firstLabel=resultsMode==='first'?'첫 시도':'전체 시도';
  $('gold-stats-summary').textContent=`${results.participantCount}명 참여 · ${firstLabel} ${results.summary.correct}/${results.summary.total}회 정답 · ${results.summary.rate===null?'정답률 계산 중':results.summary.rate+'%'}`;
  $('gold-students-caption').textContent=resultsMode==='first'?'학생별 서로 다른 문항의 첫 시도 기준':'학생별 모든 응답(반복 풀이 포함) 기준';
  $('gold-questions-caption').textContent=resultsMode==='first'?'문항별 학생의 첫 시도 기준':'문항별 모든 응답(반복 풀이 포함) 기준';
  const identifiers=Object.keys(run?.roster||{}).sort();
  const nameOf=(name,uid)=>hideResultsNames?`참가자 ${Math.max(0,identifiers.indexOf(uid))+1}`:name;
  const makeRow=(label,meta,rate,tier)=>{
    const row=document.createElement('div');row.className='gold-accuracy-row';
    const header=document.createElement('div');header.className='gold-accuracy-head';
    const name=document.createElement('strong');name.textContent=label;name.title=label;
    const percent=document.createElement('b');percent.className='tier-text-'+tier;percent.textContent=rate===null?'—':`${rate}%`;
    header.append(name,percent);
    const detail=document.createElement('small');detail.textContent=meta;
    row.append(header,analyticsBar({rate,tier}),detail);return row;
  };
  const rank=$('gold-stats-ranking');rank.replaceChildren();
  goldRanking(pub?.scores||{}).forEach((entry,i)=>{
    const row=document.createElement('div');row.className='gold-analytics-rank';
    const place=document.createElement('b');place.textContent=i<3?['🥇','🥈','🥉'][i]:`${i+1}위`;
    const icon=createAvatarImage(entry.avatarId,{size:'sm',decorative:true});
    const name=document.createElement('span');name.textContent=nameOf(entry.name||'참가자',entry.uid);
    const gold=document.createElement('strong');gold.textContent=`${Number(entry.gold||0).toLocaleString('ko-KR')}G`;
    row.append(place,icon,name,gold);rank.append(row);
  });
  const students=$('gold-stats-students');students.replaceChildren();
  results.students.forEach(entry=>students.append(makeRow(nameOf(entry.name,entry.uid),
    `${entry.correct}/${entry.total}회 정답 · 고유 ${entry.uniqueQuestions}문항 · 전체 ${entry.attempts}회`,entry.rate,entry.tier)));
  const questions=$('gold-stats-questions');questions.replaceChildren();
  results.questions.forEach(q=>{
    const label=`${q.number}번 · ${q.prompt}`;
    questions.append(makeRow(label,
      q.total?`${q.correct}/${q.total}회 정답 · ${q.students}명 도전`:'아직 이 문항을 푼 학생이 없습니다.',q.rate,q.tier));
  });
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
  // Keep a compact 24-order history for EACH question on this student's private state.
  // The next attempt is shuffled once (teacher-side) and survives refresh/reconnect.
  const optionHistory={...(previous?.optionHistory||{})};
  const key=String(question.index);
  const shuffled=question.type==='typing'?null:shuffleGoldChoices(question.options,optionHistory[key],Math.random,question.correctIndex);
  if(shuffled)optionHistory[key]=shuffled.history;
  return {phase:'question',nonce:`a${seq}_${crypto.randomUUID().slice(0,12)}`,questionIndex:question.index,
    sequence:seq,number:question.number,prompt:question.prompt,type:question.type,
    options:shuffled?shuffled.options:[],
    ...(shuffled?{optionOrder:shuffled.optionOrder}:{}),optionHistory,
    imageUrl:question.imageUrl||'',
    answered:previous?.answered||0,correct:previous?.correct||0,
    lastMessage:previous?.lastMessage||'',lastCorrect:previous?.lastCorrect||'',
    lastWrongNonce:previous?.lastWrongNonce||'',lastWrongAnswer:previous?.lastWrongAnswer||''};
}
function nextQuestionFor(uid,seq,old){
  const deck=run?.decks?.[uid]||[];
  const questions=Array.isArray(run?.questions)?run.questions:Object.values(run?.questions||{});
  // The original 120-entry deck is a precomputed buffer, not a gameplay cap.
  // Continue deterministically after its end, preserving recent-10 avoidance.
  const index=continuingGoldQuestionIndex(deck,seq,questions.length,uid+':'+String(run?.createdAt||''));
  const q=questions[index];
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
    const targetMode=allowInteractions&&$('gold-target-mode').value==='choose'?'choose':'random';
    if(targetMode==='choose'){
      try{await get(ref(db,'v4/targetChoiceCheck'));}
      catch{throw Error('학생 상대 선택을 사용하려면 먼저 v4.8 이상 Firebase 보안 규칙을 게시해야 합니다. 보안 규칙 복사 버튼을 눌러 주세요.');}
    }
    const changes={
      [`v4/privateRuns/${code}`]:{setId:room.meta.setId,title:source.title||'골드 퀘스트',questions,decks,roster,durationSec,allowInteractions,targetMode,createdAt:serverTimestamp()},
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
  // Select a new adventure track and request audio within the Start click.
  // Actual playback begins when Firebase confirms the playing state.
  arcade.newGameMusic();arcade.autoStartGameMusic();
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
    focus(true);notify('게임을 시작했습니다! 교사 브라우저를 열어 두세요.','success');
  }catch(err){notify('시작 오류: '+formatError(err),'error');}finally{operation=false;render();}
}

async function toggleGamePause(){
 if(!code||operation||!pub||pub.state!=='playing')return;
 operation=true;
 try{
  for(let i=0;i<125&&processLock;i++)await new Promise(r=>setTimeout(r,40));
  if(processLock)throw Error('처리 중인 답안이 있습니다. 다시 눌러 주세요.');
  const c=code;
  const snap=await get(ref(db,'v4/public/'+c)),live=snap.val();
  if(c!==code||live?.state!=='playing')throw Error('게임이 이미 종료되었거나 방이 바뀌었습니다.');
  if(!live.pauseStartedAt){
   await update(ref(db,'v4/public/'+c),{pauseStartedAt:Date.now()+offset});
   notify('게임을 일시정지했습니다.','success');
  }else{
   const delta=Math.max(0,Date.now()+offset-Number(live.pauseStartedAt));
   const changes={['v4/public/'+c+'/pauseStartedAt']:null,['v4/public/'+c+'/endsAt']:Number(live.endsAt||0)+delta};
   const targetsSnap=await get(ref(db,'v4/memberState/'+c));
   for(const [uid,state] of Object.entries(targetsSnap.val()||{})){
    if(state?.phase==='target'&&Number(state.targetDeadline||0)>0)
     changes['v4/memberState/'+c+'/'+uid+'/targetDeadline']=Number(state.targetDeadline)+delta;
   }
   await update(ref(db),changes);
   notify('일시정지를 해제하고 게임을 재개했습니다.','success');
  }
 }catch(e){notify('일시정지 처리 오류: '+formatError(e),'error');}
 finally{operation=false;render();}
}
async function finish(){
  if(operation||pub?.state!=='playing')return;
  if(pub?.pauseStartedAt){notify('일시정지를 해제한 뒤 종료해 주세요.','error');return;}
  operation=true;
  try{
    // Credit pending chest interactions at the timer, even if a student did not pick a target.
    if(processLock){
      for(let attempts=0;attempts<100&&processLock;attempts++)await new Promise(resolve=>setTimeout(resolve,50));
    }
    if(processLock)throw Error('진행 중인 채점이 완료되지 않았습니다. 잠시 후 종료를 다시 시도해 주세요.');
    // Drain already-received valid answers before publishing the final statistics.
    const pendingAnswers=(await get(ref(db,`v4/answers/${code}`))).val()||{};
    answers=pendingAnswers;
    await pump();
    for(const uid of Object.keys(run?.roster||{})){
      let member=states?.[uid];
      if(member?.phase==='treasure'&&picks?.[uid]?.[member.nonce]){
        await processTreasure(uid,member,picks[uid][member.nonce]);
        member=states?.[uid];
      }
      if(member?.phase==='target')await processTarget(uid,member,targets?.[uid]?.[member.nonce],{force:true});
    }
    // Publish aggregate learning results only once, at game finish.  Students
    // cannot read privateRuns/answersLog; never expose raw responses or keys.
    // Fetch after pending treasure processing so the last accepted answers count.
    const finalLog=(await get(ref(db,`v4/privateRuns/${code}/answersLog`))).val()||{};
    const learningResults=makeGoldPublicLearningResults({
      roster:run?.roster||{},scores:pub?.scores||{},questions:run?.questions||[],answersLog:finalLog
    });
    await update(ref(db,`v4/public/${code}`),{
      learningResults,state:'finished',finishedAt:serverTimestamp()
    });
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
  if(pub?.state!=='playing'||pub?.pauseStartedAt||!run||!submission?.value||!run.questions?.[state.questionIndex]||!pub?.scores?.[uid])return;
  const key=`answer/${uid}/${state.nonce}`;
  if(processingKeys.has(key))return;
  processingKeys.add(key);
  try{
    if(pub?.state!=='playing'||!run||!submission?.value)return;
    const q=run.questions?.[state.questionIndex];if(!q)return;
    const correct=verifyGoldAnswer(q,submission.value,state.optionOrder);
    // Update only this student's answered/correct counters via a transaction.
    // Cloning an old score object here would overwrite gold moved by a chest.
    const scoreRef=ref(db,`v4/public/${code}/scores/${uid}`);
    const nonce=state.nonce;
    const tx=await runTransaction(scoreRef,current=>{
      if(!current||current.lastAnswerNonce===nonce)return;
      return {...current,
        answered:Number(current.answered||0)+1,
        correct:Number(current.correct||0)+(correct?1:0),
        lastAnswerNonce:nonce};
    },{applyLocally:false});
    let saved=tx.snapshot.val();
    if(!saved||saved.lastAnswerNonce!==nonce)saved=(await get(scoreRef)).val();
    if(!saved||saved.lastAnswerNonce!==nonce)throw Error('채점 트랜잭션을 확인하지 못했습니다.');
    const answerLabel=q.type==='typing'?q.options.filter(Boolean).join(' / ')
      :`${displayedGoldCorrectIndex(q,state.optionOrder)}번 · ${q.options[Number(q.correctIndex)-1]||''}`;
    const oldState={...state,answered:Number(saved.answered||0),correct:Number(saved.correct||0),
      lastMessage:correct?'✨ 정답입니다! 보물상자를 골라 주세요.':`다음 문제에 도전하세요! 정답: ${answerLabel}`,
      lastCorrect:correct?'yes':'no',
      ...(!correct?{lastWrongNonce:nonce,lastWrongAnswer:answerLabel}:{lastWrongNonce:'',lastWrongAnswer:''})};
    const next=correct?{...oldState,phase:'treasure'}:nextQuestionFor(uid,Number(state.sequence||0)+1,oldState);
    await update(ref(db),{
      [`v4/memberState/${code}/${uid}`]:next,
      [`v4/privateRuns/${code}/answersLog/${uid}/${nonce}`]:{
        questionNumber:q.number,questionIndex:state.questionIndex,correct,
        value:String(submission.value),
        // A shuffled displayed index is meaningless without its original choice.
        ...(q.type==='typing'?{}:{
          originalChoiceIndex:originalGoldChoiceIndex(submission.value,state.optionOrder),
          selectedText:String(q.options[originalGoldChoiceIndex(submission.value,state.optionOrder)-1]||'')
        }),
        at:Number(submission.at)||Date.now()
      }
    });
    states[uid]=next;
  }catch(err){processingKeys.delete(key);notify('채점 처리 오류: '+formatError(err),'error');}
}
async function payGoldReward(uid,state,outcome,target,choice){
  const scoreRef=ref(db,`v4/public/${code}/scores`),nonce=state.nonce;
  const tx=await runTransaction(scoreRef,current=>{
    if(!current?.[uid] || current[uid].lastRewardNonce===nonce)return;
    // Always validate the target against the CURRENT scoreboard, not a stale snapshot.
    const safeTarget=['steal','swap'].includes(outcome.type)&&validGoldTarget(current,uid,target)?target:'';
    const result=applyGoldOutcome(current,uid,outcome,safeTarget);
    result.scores[uid].lastRewardNonce=nonce;
    result.scores[uid].lastReward={type:outcome.type,targetUid:safeTarget,
      description:result.message,gained:result.gained,choice:Number(choice),
      ...(outcome.fraction?{fraction:outcome.fraction}:{}),
      ...(outcome.factor?{factor:outcome.factor}:{}),
      ...(outcome.amount?{amount:outcome.amount}:{})};
    return result.scores;
  },{applyLocally:false});
  let actor=tx.snapshot.val()?.[uid];
  if(!actor || actor.lastRewardNonce!==nonce){actor=(await get(ref(db,`v4/public/${code}/scores/${uid}`))).val();}
  if(!actor || actor.lastRewardNonce!==nonce)throw Error('보상 트랜잭션 결과를 확인하지 못했습니다.');
  const saved=actor.lastReward;
  const after={...state,lastMessage:`🎁 ${saved.description}`,lastCorrect:'reward'};
  const next=nextQuestionFor(uid,Number(state.sequence||0)+1,after);
  const changes={
    [`v4/memberState/${code}/${uid}`]:next,
    [`v4/privateRuns/${code}/treasuresLog/${uid}/${nonce}`]:{
      choice:Number(saved.choice),type:saved.type,targetUid:saved.targetUid||'',
      gained:Number(saved.gained||0),description:saved.description
    },
    [`v4/public/${code}/lastEvent`]:{
      at:serverTimestamp(),type:saved.type,actorUid:uid,
      targetUid:saved.targetUid||'',message:saved.description
    }
  };
  await update(ref(db),changes);
  states[uid]=next;
}
async function processTreasure(uid,state,pick){
  if(pub?.state!=='playing'||pub?.pauseStartedAt||!run||!pick?.choice||!pub?.scores?.[uid])return;
  const key=`pick/${uid}/${state.nonce}`;
  if(processingKeys.has(key))return;
  processingKeys.add(key);
  try{
    const outcome=chooseGoldOutcome(Math.random,{
      allowInteractions:run.allowInteractions!==false,
      playerCount:Object.keys(pub.scores).length
    });
    if(run.targetMode==='choose' && ['steal','swap'].includes(outcome.type)){
      // The teacher fixes the random prize before asking the student for a target.
      // Its value stays in private-to-student memberState through reconnects.
      const pending={...state,phase:'target',pendingOutcome:outcome,
        targetDeadline:Date.now()+offset+TARGET_WAIT_MS,targetChoice:Number(pick.choice),
        lastMessage:'🎯 특별 보상! 빼앗거나 교환할 상대를 선택하세요.',lastCorrect:'yes'};
      await update(ref(db,`v4/memberState/${code}/${uid}`),pending);
      states[uid]=pending;
    }else{
      const target=['steal','swap'].includes(outcome.type)?pickTarget(uid):'';
      await payGoldReward(uid,state,outcome,target,pick.choice);
    }
  }catch(err){processingKeys.delete(key);notify('보물 처리 오류: '+formatError(err),'error');}
}
async function processTarget(uid,state,selection,{force=false}={}){
  if(!run||pub?.pauseStartedAt||!pub?.scores?.[uid]||!state?.pendingOutcome)return;
  const key=`target/${uid}/${state.nonce}`;
  if(processingKeys.has(key))return;
  const now=Date.now()+offset;
  if(!force&&!selection?.targetUid&&now<Number(state.targetDeadline||0))return;
  processingKeys.add(key);
  try{
    const proposed=String(selection?.targetUid||'');
    const selected=validGoldTarget(pub?.scores||{},uid,proposed)?proposed:pickTarget(uid);
    await payGoldReward(uid,state,state.pendingOutcome,selected,state.targetChoice);
  }catch(err){processingKeys.delete(key);notify('선택 대상 보상 처리 오류: '+formatError(err),'error');}
}
// Teacher-side payout stays single-writer, preserving the score-tree transaction
// and exact nonce checks. A new target choice jumps ahead of queued answers
// instead of waiting for the fixed student-roster order to finish.
function nextGoldJob(attempted){
  const jobs=[];
  for(const uid of Object.keys(run?.roster||{})){
    const state=states?.[uid];if(!state?.nonce)continue;
    const nonce=state.nonce;
    if(state.phase==='target'){
      const selection=targets?.[uid]?.[nonce];
      const isDue=Date.now()+offset>=Number(state.targetDeadline||0);
      if(selection?.targetUid||isDue){
        const key=`target/${uid}/${nonce}`;
        if(!attempted.has(key)&&!processingKeys.has(key))jobs.push({uid,state,selection,key,priority:selection?.targetUid?0:1,type:'target'});
      }
    }else if(state.phase==='treasure'&&picks?.[uid]?.[nonce]){
      const key=`pick/${uid}/${nonce}`;
      if(!attempted.has(key)&&!processingKeys.has(key))jobs.push({uid,state,key,priority:2,type:'treasure',pick:picks[uid][nonce]});
    }else if(state.phase==='question'&&answers?.[uid]?.[nonce]){
      const key=`answer/${uid}/${nonce}`;
      if(!attempted.has(key)&&!processingKeys.has(key))jobs.push({uid,state,key,priority:3,type:'answer',answer:answers[uid][nonce]});
    }
  }
  jobs.sort((a,b)=>a.priority-b.priority);
  return jobs[0];
}
async function pump(){
  if(processLock||!ready||!run||pub?.state!=='playing'||pub?.pauseStartedAt||!code)return;
  processLock=true;
  const attempted=new Set();
  try{
    // Re-check live snapshots after every awaited operation; this lets a target
    // selected during another student's payout be handled next. Erroring jobs
    // are attempted only once per pass; the next 250ms poll may retry them.
    const limit=Math.max(40,Object.keys(run?.roster||{}).length*4);
    for(let n=0;n<limit&&pub?.state==='playing';n++){
      const job=nextGoldJob(attempted);
      if(!job)break;
      attempted.add(job.key);
      if(job.type==='target')await processTarget(job.uid,job.state,job.selection);
      else if(job.type==='treasure')await processTreasure(job.uid,job.state,job.pick);
      else await processAnswer(job.uid,job.state,job.answer);
    }
  }finally{processLock=false;}
}

function clockTick(){
  if(!ready||!code||!run||pub?.state!=='playing')return;
  const seconds=Math.ceil((Number(pub.endsAt||0)-(Number(pub.pauseStartedAt||0)||(Date.now()+offset)))/1000);
  $('gold-time').textContent=`${Math.floor(Math.max(0,seconds)/60)}:${String(Math.max(0,seconds)%60).padStart(2,'0')}`;
  if(focusOpen)$('gold-focus-clock').textContent=$('gold-time').textContent;
  if(seconds<=0&&!pub?.pauseStartedAt&&!operation&&!processLock){void finish();}
}
function downloadCsv(){
  if(!run)return;
  const rows=[['학생','문항번호','제출 답','정답 여부','골드 결과','보상 변화']];
  for(const [uid,name] of Object.entries(run.roster||{})){
    const attempts=run.answersLog?.[uid]||{},rewards=run.treasuresLog?.[uid]||{};
    for(const [nonce,info] of Object.entries(attempts))rows.push([name,info.questionNumber,info.selectedText?`${info.value}번: ${info.selectedText}`:info.value,info.correct?'정답':'오답',rewards[nonce]?.description||'',rewards[nonce]?.gained??'']);
  }
  const csv='\ufeff'+rows.map(row=>row.map(escapeCsv).join(',')).join('\r\n');
  const a=document.createElement('a'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.href=url;a.download=`퍼플킷_골드퀘스트_${code}.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function applyTeacher(user){
  const next=user?.providerData?.some(x=>x.providerId==='google.com')?user:null;
  if(teacher?.uid===next?.uid)return;
  teacher=next;stop();
  if(teacher&&code){watchRoomMeta();void checkRights();}
}
window.addEventListener('quizlab-room-open',event=>bindRoom(event.detail?.code||'',event.detail?.mode||''));
// rooms.js broadcasts the metadata as soon as the existing v2 listener receives it.
window.addEventListener('quizlab-room-meta',event=>{
  const info=event.detail;
  if(!info||info.code!==code||!info.meta)return;
  room={...(room||{}),meta:info.meta};modeHint=info.meta.mode||modeHint;
  render();
});
if(window.__purplekitOpenRoomCode)bindRoom(window.__purplekitOpenRoomCode);
if(auth)onAuthStateChanged(auth,applyTeacher);
if(db)onValue(ref(db,'.info/serverTimeOffset'),snap=>offset=Number(snap.val()||0));
$('gold-retry-rights').addEventListener('click',()=>void checkRights());
$('gold-prepare').addEventListener('click',()=>void prepare());
$('gold-interactions').addEventListener('change',render);
$('gold-start').addEventListener('click',()=>void start());
$('gold-pause').addEventListener('click',()=>void toggleGamePause());
$('gold-focus-pause').addEventListener('click',()=>void toggleGamePause());
$('gold-end').addEventListener('click',()=>{if(confirm('골드 퀘스트를 지금 종료할까요?'))void finish();});
$('gold-export').addEventListener('click',downloadCsv);
$('gold-focus-open').addEventListener('click',()=>focus(true));
$('gold-focus-close').addEventListener('click',()=>focus(false));
$('gold-stats-mode').addEventListener('change',event=>{resultsMode=event.target.value==='all'?'all':'first';renderGoldAnalytics();});
$('gold-stats-hide-names').addEventListener('change',event=>{hideResultsNames=Boolean(event.target.checked);renderFocus();});
$('gold-podium-toggle').addEventListener('click',()=>{podiumCollapsed=!podiumCollapsed;renderFocus();});
$('gold-focus-prepare').addEventListener('click',()=>void prepare());
$('gold-focus-start').addEventListener('click',()=>void start());
$('gold-focus-end').addEventListener('click',()=>{if(confirm('골드 퀘스트를 종료할까요?'))void finish();});
$('gold-copy-rules').addEventListener('click',async()=>{
  if(!teacher)return;
  try{await navigator.clipboard.writeText(makeRulesV6(teacher.uid));notify('v6 통합 규칙을 복사했습니다. Firebase Realtime Database → 규칙에 게시하세요.','success');}
  catch(err){notify('규칙 복사 실패: '+formatError(err),'error');}
});
$('gold-download-rules').addEventListener('click',()=>{
  if(!teacher)return;
  const contents=makeRulesV6(teacher.uid);
  const url=URL.createObjectURL(new Blob([contents],{type:'application/json;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download='database.rules.json';
  document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  notify('v4 규칙 JSON을 다운로드했습니다. Firebase에 게시한 내용과 GitHub 규칙 파일을 일치시켜 주세요.','success');
});
setInterval(clockTick,500);
// Process answers arriving while a prior batch is in flight.
// Firebase callbacks can fire during an awaited write; polling closes that small scheduling gap.
setInterval(()=>{if(pub?.state==='playing'&&!pub?.pauseStartedAt)void pump();},250);
render();
