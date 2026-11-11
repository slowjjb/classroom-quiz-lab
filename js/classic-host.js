import { auth, db, formatError } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { ref, get, set, update, onValue, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import { makeRulesV3 } from './rules-v3.js';
import { gradeAnswer, correctDisplay, optionsArray, totalScores, ranking, escapeCsv, buildRoundReport, autoRevealAttendance } from './classic-core.js?v=3.4';
import { normalizeQuestionImage, fullQuestionImageUrl } from './image-utils.js?v=3.4';
import { createArcadeUi, renderPodium } from './arcade-ui.js?v=3.4';

const $ = x => document.getElementById(x);
const arcade = createArcadeUi('classic-focus',{role:'teacher'});
let teacher=null, code='', ready=false, room=null, run=null, publicRound=null, answers={}, grades={}, savedSet=null;
let unsub=[], operation=false, scorePublished='', grading=new Set(), clockOffset=0, autoRevealPending=false, checkToken=0;
let focusOpen=false, focusResults=false, reportPublished='', reportTimer=null;
let autoRevealPreference=true, completeSince=0, completeRound='';
const times = {};
function msg(str,kind=''){$('classic-message').textContent=str;$('classic-message').dataset.kind=kind;}
function badge(str,kind='neutral'){$('classic-badge').textContent=str;$('classic-badge').className=`pill pill-${kind}`;}
function getQuestions(r=run){
  const qs=r?.questions;return Array.isArray(qs)?qs:Object.keys(qs||{}).sort((a,b)=>Number(a)-Number(b)).map(k=>qs[k]);
}
function serverNow(){return Date.now()+clockOffset;}
function detach(){arcade.reset();checkToken++;for(const stop of unsub)stop();unsub=[];room=null;run=null;publicRound=null;answers={};grades={};savedSet=null;scorePublished='';reportPublished='';if(reportTimer)clearTimeout(reportTimer);reportTimer=null;grading.clear();focusOpen=false;focusResults=false;autoRevealPreference=true;completeSince=0;completeRound='';setVisibleFocus(false);}
function resetUi(){
  $('classic-panel').hidden=!code;
  $('classic-rules').hidden=true;
  $('classic-controls').hidden=true;
  $('classic-board').replaceChildren();
  $('classic-stats').replaceChildren();
  badge('대기 중');
  $('classic-focus-open').disabled=true;
}
async function checkRights(){
  if(!teacher||!code){ready=false;return;}
  const token=++checkToken;
  try{await get(ref(db,'v3/versionCheck'));if(token!==checkToken)return;ready=true;$('classic-rules').hidden=true;
    badge('v3 권한 확인','success');msg('채점은 교사 브라우저에서 수행됩니다. 게임 중 이 화면을 열어 두세요.');watch();}
  catch(e){if(token!==checkToken)return;ready=false;badge('v3 규칙 필요','error');$('classic-rules').hidden=false;msg('v3 통합 보안 규칙을 Firebase에 게시해야 클래식 퀴즈를 시작할 수 있습니다.','error');}
}
function bindRoom(nextCode){
  if(code===nextCode && (ready||unsub.length))return;
  detach();code=nextCode;ready=false;resetUi();if(code&&teacher)checkRights();
}
function watch(){
  if(!ready||!code||!teacher)return;
  const myCode=code;
  const bind=(path,callback)=>unsub.push(onValue(ref(db,path),snap=>{if(code===myCode){callback(snap.val());render();}},e=>msg(`Firebase 읽기 실패: ${formatError(e)}`,'error')));
  bind(`v2/rooms/${code}`,v=>{room=v;syncScores();scheduleReport();});
  bind(`v3/privateRuns/${code}`,v=>{run=v;if(v&&typeof v.autoReveal==='boolean')autoRevealPreference=v.autoReveal;gradePending();syncScores();scheduleReport();});
  bind(`v3/public/${code}`,v=>{publicRound=v;gradePending();syncScores();scheduleReport();});
  bind(`v3/answers/${code}`,v=>{answers=v||{};gradePending();scheduleReport();});
  bind(`v3/grades/${code}`,v=>{grades=v||{};syncScores();scheduleReport();});
}
function roomTitle(){return room?.meta?.title||'게임 방';}
function stateName(state){return ({ready:'게임 준비',question:'문제 진행',paused:'일시 정지',reveal:'정답 공개',finished:'게임 종료'})[state]||'시작 전';}
function render(){
  if(!ready||!code)return;
  $('classic-controls').hidden=false;
  const state=publicRound?.state||'';
  $('classic-room-label').textContent=`${code} · ${roomTitle()} · ${room?.meta?.setTitle||'문제 미선택'}`;
  $('classic-phase').textContent=stateName(state);
  $('classic-progress').textContent=run?`${Math.max(0,(publicRound?.index ?? -1)+1)} / ${getQuestions().length}문항`:'아직 게임을 준비하지 않았습니다.';
  const isClassic=room?.meta?.mode==='classic';
  const validSet=!!room?.meta?.setId;
  const canBegin=isClassic&&validSet&&room?.meta?.state!=='ended'&&!run;
  $('classic-prepare').disabled=!canBegin||operation;
  $('classic-next').disabled=!run||operation||!(state==='ready'||state==='reveal');
  $('classic-reveal').disabled=!run||operation||!(state==='question'||state==='paused');
  $('classic-pause').disabled=!run||operation||!(state==='question'||state==='paused');
  $('classic-pause').textContent=state==='paused'?'재개':'일시 정지';
  $('classic-extend').disabled=!run||operation||state!=='question';
  $('classic-end').disabled=!run||operation||state==='finished';
  $('classic-export').disabled=!run;
  $('classic-focus-open').disabled=!run||!(state==='question'||state==='paused'||state==='reveal'||state==='finished');
  for(const id of ['classic-auto-reveal','classic-focus-auto-reveal']){
    $(id).checked=autoRevealPreference;
    $(id).disabled=operation||state==='finished';
  }
  if(!isClassic)msg('클래식 모드로 만든 방에서만 v3 게임을 진행할 수 있습니다.','error');
  else if(!validSet)msg('게임 방을 생성할 때 v1 문제 세트를 선택해야 합니다. 새 클래식 방을 만들어 주세요.','error');
  else if(room?.meta?.state==='ended'&&!run)msg('이미 종료된 방입니다. 새 방을 만들어 주세요.','error');
  const currentQ=getQuestions()[publicRound?.index??-1];
  const pending=publicRound?.roundId ? Object.keys(answers?.[publicRound.roundId]||{}).length:0;
  $('classic-current').textContent=currentQ?`[${currentQ.number}번] ${currentQ.prompt}`:'문제 미출제';
  $('classic-current').title=currentQ?.prompt||'';
  $('classic-live').textContent=currentQ?`제출 ${pending}명 / 학생 ${Object.keys(room?.members||{}).length}명 · ${stateName(state)}`:'정답은 학생 화면에 전송되지 않습니다.';
  const list=$('classic-board');list.replaceChildren();
  const ranks=ranking(totalScores(grades,rosterMembers()));
  for(const [i,x] of ranks.entries()){
    const line=document.createElement('div');line.className='classic-rank-line';
    line.textContent=`${i+1}위  ${x.name}  ·  ${x.score.toLocaleString()}점  ·  ${x.correct}/${x.answered} 정답`;
    list.append(line);
  }
  if(!ranks.length)list.textContent='게임 참가자가 아직 없습니다.';
  const stats=$('classic-stats');stats.replaceChildren();
  const qs=getQuestions();
  qs.forEach((q,i)=>{
    const round=grades?.[`q${i+1}`]||{};const vals=Object.values(round);
    const box=document.createElement('div');box.className='classic-stat-line';
    box.textContent=`${i+1}번 · ${vals.length}명 제출 · ${vals.filter(x=>x.correct).length}명 정답 · 정답률 ${vals.length?Math.round(100*vals.filter(x=>x.correct).length/vals.length):0}%`;
    stats.append(box);
  });
  renderFocus();
}
function rosterMembers(){
  if(run?.roster){return Object.fromEntries(Object.entries(run.roster).map(([id,name])=>[id,{profile:{name}}]));}
  return room?.members||{};
}
function createSetSnapshot(source){
  return Object.values(source?.questions||{}).sort((a,b)=>a.number-b.number).map(q=>{
    const imageUrl=normalizeQuestionImage(q.imageUrl||'',new URL('./',location.href).href);
    return {number:Number(q.number),prompt:String(q.prompt),type:q.type,timeLimit:Number(q.timeLimit),
      options:optionsArray(q.options),correctIndex:Number(q.correctIndex||0),...(imageUrl?{imageUrl}:{})};
  });
}
async function mutate(fn){
  if(operation)return;operation=true;render();
  try{await fn();}catch(e){msg('실행 오류: '+formatError(e),'error');}
  finally{operation=false;render();}
}
async function prepareGame(){await mutate(async()=>{
  if(!teacher||!room||run||room.meta?.mode!=='classic'||!room.meta?.setId)throw Error('클래식 방과 문제 세트를 먼저 선택하세요.');
  const setSnap=await get(ref(db,`v1/questionSets/${room.meta.setId}`));
  if(!setSnap.exists())throw Error('선택한 문제 세트가 삭제되었습니다.');
  const qs=createSetSnapshot(setSnap.val());if(!qs.length)throw Error('문제가 없는 세트입니다.');
  if(!confirm(`${qs.length}문항으로 클래식 게임을 준비할까요? 학생들의 입장이 마감됩니다.`))return;
  const rosterSnap=await get(ref(db,`v2/rooms/${code}/members`));
  const roster=Object.fromEntries(Object.entries(rosterSnap.val()||{}).filter(([,m])=>m?.profile?.name).map(([uid,m])=>[uid,m.profile.name]));
  await set(ref(db,`v3/privateRuns/${code}`),{setId:room.meta.setId,setTitle:setSnap.val().title,questions:qs,roster,autoReveal:autoRevealPreference,createdAt:serverTimestamp()});
  await set(ref(db,`v3/public/${code}`),{state:'ready',index:-1,total:qs.length,title:roomTitle()});
  await update(ref(db,`v2/rooms/${code}/meta`),{state:'locked'});
  msg(`문제 ${qs.length}개가 준비됐습니다. '다음 문제 출제'를 누르세요.`,'success');
});}
async function nextQuestion(){await mutate(async()=>{
  const questions=getQuestions();if(!run||!questions.length)throw Error('게임 준비가 필요합니다.');
  const state=publicRound?.state;if(!(state==='ready'||state==='reveal'))throw Error('진행 중인 문제를 먼저 마감하세요.');
  const index=(Number(publicRound?.index??-1)+1);
  if(index>=questions.length){await finishGame();return;}
  const q=questions[index];const started=serverNow(), deadline=started+q.timeLimit*1000;
  const roundId=`q${index+1}`;
  // 교사 전용 시간 기록은 이전 문제의 지연 도착 답안도 검증할 수 있도록 보존합니다.
  await update(ref(db),{
    [`v3/privateRuns/${code}/timings/${roundId}`]:{startedAt:serverTimestamp(),deadline},
    [`v3/public/${code}`]:{state:'question',index,total:questions.length,roundId,questionNumber:q.number,
      prompt:q.prompt,type:q.type,timeLimit:q.timeLimit,options:q.type==='typing'?[]:optionsArray(q.options),imageUrl:q.imageUrl||'',startedAt:serverTimestamp(),deadline,title:roomTitle()}
  });
  focusOpen=true;focusResults=false;completeSince=0;completeRound='';setVisibleFocus(true);
  msg(`${index+1}번 문제가 전송됐습니다. 제한 시간 ${q.timeLimit}초.`,'success');
});}
async function setAutoReveal(next){
  autoRevealPreference=Boolean(next);
  for(const id of ['classic-auto-reveal','classic-focus-auto-reveal'])$(id).checked=autoRevealPreference;
  completeSince=0;completeRound='';
  if(!run||!code){return;}
  try{await update(ref(db,`v3/privateRuns/${code}`),{autoReveal:autoRevealPreference});
    msg(autoRevealPreference?'자동 정답 공개를 켰습니다.':'자동 공개를 껐습니다. 직접 정답 공개를 눌러주세요.','success');}
  catch(e){msg('자동 공개 설정 저장 실패: '+formatError(e),'error');}
}
async function revealQuestion(){await mutate(async()=>{
  if(!publicRound||!['question','paused'].includes(publicRound.state))return;
  const q=getQuestions()[publicRound.index];if(!q)return;
  await update(ref(db,`v3/public/${code}`),{state:'reveal',correctAnswer:correctDisplay(q)});
  scheduleReport();
  msg('정답을 공개했습니다. 결과를 확인한 뒤 다음 문제를 출제하세요.','success');
});}
async function pauseResume(){await mutate(async()=>{
  if(publicRound?.state==='question'){
    const remainingMs=Math.max(0,Math.round(Number(publicRound.deadline)-serverNow()));
    await update(ref(db,`v3/public/${code}`),{state:'paused',remainingMs});msg('게임이 일시 정지됐습니다. 학생 제출이 잠시 중단됩니다.');
  }else if(publicRound?.state==='paused'){
    const newDeadline=serverNow()+Number(publicRound.remainingMs||0);
    await update(ref(db),{[`v3/public/${code}/state`]:'question',
      [`v3/public/${code}/deadline`]:newDeadline,
      [`v3/privateRuns/${code}/timings/${publicRound.roundId}/deadline`]:newDeadline,
      [`v3/public/${code}/remainingMs`]:null});msg('게임을 재개했습니다.','success');
  }
});}
async function extendTime(){await mutate(async()=>{
  if(publicRound?.state!=='question')return;
  const deadline=Number(publicRound.deadline)+10000;
  await update(ref(db),{[`v3/public/${code}/deadline`]:deadline,
    [`v3/privateRuns/${code}/timings/${publicRound.roundId}/deadline`]:deadline});
  msg('제한 시간을 10초 연장했습니다.','success');
});}
async function finishGame(){
  if(!run)return;await update(ref(db,`v3/public/${code}`),{state:'finished'});
  msg('클래식 게임을 종료했습니다. 결과 CSV를 저장한 뒤 기존 방을 종료하세요.','success');
}
function gradePending(){
  if(!ready||!run||!teacher||!code)return;
  const questions=getQuestions();
  for(const [roundId, submissions] of Object.entries(answers||{})){
    const match=/^q([1-9]\d*)$/.exec(roundId);if(!match)continue;
    const q=questions[Number(match[1])-1];const timing=run.timings?.[roundId];if(!q||!timing)continue;
    for(const [uid,s] of Object.entries(submissions||{})){
      const key=`${roundId}/${uid}`;if(grades?.[roundId]?.[uid]||grading.has(key))continue;
      grading.add(key);
      const g=gradeAnswer(q,s.value,s.at,timing.startedAt,timing.deadline);
      const grade={...g,answer:String(s.value),questionNumber:q.number};
      // 원자적 선점: 같은 교사 계정의 탭을 두 개 열어도 답안 한 건당 채점 기록은 한 개입니다.
      runTransaction(ref(db,`v3/grades/${code}/${roundId}/${uid}`),v=>v===null?grade:undefined,{applyLocally:false})
        .catch(e=>msg('답안 채점 실패: '+formatError(e),'error')).finally(()=>grading.delete(key));
    }
  }
}
async function syncScores(){
  // 문제 풀이 중에는 점수 상승으로 정답 여부를 유추하지 못하도록 공개 점수를 갱신하지 않습니다.
  if(!ready||!run||!code||!['reveal','finished'].includes(publicRound?.state))return;
  const scores=totalScores(grades,rosterMembers());
  const json=JSON.stringify(scores);if(json===scorePublished)return;
  scorePublished=json;
  try{await set(ref(db,`v3/scores/${code}`),scores);}catch(e){scorePublished='';msg('점수 동기화 실패: '+formatError(e),'error');}
}
// 학생이 결과 확인을 누를 때 사용할 공개 결과는 교사 브라우저에서만 생성합니다.
// 기존 v3/public 경로에 저장하므로 Firebase 규칙 재배포가 필요하지 않습니다.
function scheduleReport(){
  if(!ready||!run||!publicRound||publicRound.state!=='reveal'||!publicRound.roundId)return;
  if(reportTimer)clearTimeout(reportTimer);
  reportTimer=setTimeout(publishRoundReport,180);
}
async function publishRoundReport(){
  reportTimer=null;
  if(!ready||!run||!publicRound||publicRound.state!=='reveal'||!code)return;
  const myCode=code, roundId=publicRound.roundId;
  const report=buildRoundReport(roundId,grades?.[roundId]||{},answers?.[roundId]||{},run.roster||{},totalScores(grades,rosterMembers()));
  const fingerprint=JSON.stringify(report);
  if(reportPublished===fingerprint)return;
  reportPublished=fingerprint;
  try{
    if(code!==myCode||publicRound?.roundId!==roundId||publicRound.state!=='reveal')return;
    await set(ref(db,`v3/public/${myCode}/roundResults`),report);
  }catch(err){reportPublished='';msg('결과 공개 동기화 실패: '+formatError(err),'error');}
}
function csvExport(){
  if(!run)return;
  const rows=[['학생','원본 문항번호','문제','학생 답','정답','정오','점수','응답 시간(초)','제출 여부']];
  const qs=getQuestions();
  for(const [uid,m] of Object.entries(rosterMembers())){
    if(!m?.profile?.name)continue;
    qs.forEach((q,i)=>{
      const g=grades?.[`q${i+1}`]?.[uid];
      rows.push([m.profile.name,q.number,q.prompt,g?.answer||'',correctDisplay(q),g?(g.correct?'정답':'오답'):'미제출',g?.points||0,g?(g.responseMs/1000).toFixed(2):'',g?'제출':'미제출']);
    });
  }
  const csv='\uFEFF'+rows.map(row=>row.map(escapeCsv).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`클래식_결과_${code}.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
async function copyRules(){
  if(!teacher)return;
  const json=makeRulesV3(teacher.uid);
  try{await navigator.clipboard.writeText(json);msg('v0~v3 통합 규칙 복사 완료. Firebase에 게시하고 GitHub 규칙 파일도 교체하세요.','success');}
  catch{const b=new Blob([json],{type:'application/json'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='database.rules.v3.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);msg('복사가 차단되어 규칙 JSON 파일을 다운로드했습니다.');}
}
function tick(){
  if(publicRound?.state==='question'){
    const now=serverNow();
    const ms=Number(publicRound.deadline)-now;
    $('classic-timer').textContent=`남은 시간 ${Math.ceil(Math.max(0,ms)/1000)}초`;
    if(autoRevealPreference && ready && !operation && !autoRevealPending && run){
      const roundId=publicRound.roundId;
      const status=autoRevealAttendance(run.roster||{},room?.members||{},answers?.[roundId]||{},grades?.[roundId]||{});
      if(completeRound!==roundId){completeRound=roundId;completeSince=0;}
      if(status.complete){if(!completeSince)completeSince=now;}
      else completeSince=0;
      // 마지막 정답이 서버에 저장된 뒤 잠깐 안정화하여, 순간적인 연결 상태 변화로 인한 조기 공개를 피합니다.
      const allReady=completeSince>0 && now-completeSince>=900;
      if(ms<=-350 || allReady){
        autoRevealPending=true;
        revealQuestion().finally(()=>{autoRevealPending=false;completeSince=0;});
      }
    }
  }else if(publicRound?.state==='paused')$('classic-timer').textContent=`일시 정지 · ${Math.ceil(Number(publicRound.remainingMs||0)/1000)}초`;
  else { $('classic-timer').textContent='—';completeSince=0; }
  if(focusOpen){
    $('classic-focus-timer').textContent=$('classic-timer').textContent;
    if(publicRound?.state==='question')arcade.updateTime(Math.ceil(Math.max(0,Number(publicRound.deadline)-serverNow())/1000),publicRound.timeLimit);
    else if(publicRound?.state==='paused')arcade.updateTime(0,publicRound.timeLimit);
  }
}
function setVisibleFocus(show){
  $('classic-focus').hidden=!show;
  document.body.classList.toggle('quiz-stage-active',show);
}
function openFocus(){
  if(!run)return;
  focusOpen=true;focusResults=false;completeSince=0;completeRound='';setVisibleFocus(true);renderFocus();
}
function closeFocus(){focusOpen=false;setVisibleFocus(false);}
function focusRow(entry,index,kind){
  const row=document.createElement('div');row.className='quiz-result-row';
  const rank=document.createElement('span');rank.className='quiz-result-place';rank.textContent=['🥇','🥈','🥉'][index-1]||`${index}위`;
  const info=document.createElement('div');info.className='quiz-result-person';
  const name=document.createElement('strong');name.textContent=entry.name||'학생';
  const status=document.createElement('small');status.textContent=kind==='total'?`${entry.correct||0}문제 정답`:
    ({correct:'정답',wrong:'오답',pending:'채점 중',missing:'미제출'})[entry.status]||'확인 중';
  info.append(name,status);
  const metrics=document.createElement('div');metrics.className='quiz-result-metrics';
  const points=document.createElement('strong');points.textContent=`${Number(kind==='total'?entry.score:entry.points||0).toLocaleString()}점`;
  const speed=document.createElement('small');speed.textContent=kind==='total'?'누적 점수':
    ['correct','wrong'].includes(entry.status)?`${(Number(entry.responseMs||0)/1000).toFixed(2)}초`:'—';
  metrics.append(points,speed);row.append(rank,info,metrics);return row;
}
function showFocusImage(path){
  const wrap=$('classic-focus-image-wrap'),img=$('classic-focus-image'),error=$('classic-focus-image-error');
  let url='';try{url=fullQuestionImageUrl(path||'',location.href);}catch{ /* invalid URL must not load */ }
  wrap.hidden=!url;if(!url)return;
  if(img.dataset.loadedSrc!==url){
    img.dataset.loadedSrc=url;error.hidden=true;img.hidden=false;
    img.onload=()=>{img.hidden=false;error.hidden=true;};
    img.onerror=()=>{img.hidden=true;error.hidden=false;};
    img.src=url;
  }
}
function renderFocus(){
  if(!focusOpen)return;
  setVisibleFocus(true);
  const state=publicRound?.state||'ready';
  arcade.sync({state,questionId:publicRound?.roundId||''});
  $('classic-focus-state').textContent=stateName(state);
  $('classic-focus-progress').textContent=run?`${Math.max(0,(publicRound?.index??-1)+1)} / ${getQuestions().length}문항`:'';
  $('classic-focus-timer').textContent=$('classic-timer').textContent;
  $('classic-focus-pause').disabled=operation||!['question','paused'].includes(state);
  $('classic-focus-pause').textContent=state==='paused'?'재개':'일시 정지';
  $('classic-focus-extend').disabled=operation||state!=='question';
  $('classic-focus-reveal').disabled=operation||!['question','paused'].includes(state);
  $('classic-focus-result').disabled=operation||!['reveal','finished'].includes(state);
  $('classic-focus-result').textContent=focusResults?'문제로 돌아가기':'결과 크게 보기';
  $('classic-focus-next').disabled=operation||!['ready','reveal'].includes(state);
  const id=publicRound?.roundId;
  const submitted=id?Object.keys(answers?.[id]||{}).length:0;
  $('classic-focus-submitted').textContent=`${submitted}명 제출 / 총 ${Object.keys(run?.roster||{}).length}명`;
  const viewingResults=focusResults&&['reveal','finished'].includes(state);
  $('classic-focus-question-view').hidden=viewingResults;
  $('classic-focus-results-view').hidden=!viewingResults;
  const q=getQuestions()[publicRound?.index??-1];
  $('classic-focus-question').textContent=q?`[${q.number}번] ${q.prompt}`:'문제를 준비 중입니다.';
  showFocusImage(q?.imageUrl);
  const choices=$('classic-focus-options');choices.replaceChildren();
  if(q){
    const reveal=state==='reveal'||state==='finished';
    if(q.type==='typing'){
      const item=document.createElement('div');item.className='quiz-reveal-option';
      item.textContent=reveal?`정답: ${correctDisplay(q)}`:'주관식 · 학생들이 정답을 입력합니다.';choices.append(item);
    }else{
      optionsArray(q.options).forEach((answer,i)=>{
        const item=document.createElement('div');item.className='quiz-large-option teacher-choice';
        if(reveal&&Number(q.correctIndex)===i+1)item.classList.add('is-correct');
        const digit=document.createElement('span');digit.className='quiz-option-number';digit.textContent=String(i+1);
        const text=document.createElement('span');text.textContent=answer;
        item.append(digit,text);choices.append(item);
      });
    }
  }
  const answerNode=$('classic-focus-answer');
  answerNode.hidden=!(q&&['reveal','finished'].includes(state));
  if(!answerNode.hidden)answerNode.textContent=`정답: ${correctDisplay(q)}`;
  if(!viewingResults)return;
  const report=buildRoundReport(id||'',grades?.[id]||{},answers?.[id]||{},run?.roster||{},totalScores(grades,rosterMembers()));
  $('classic-focus-summary').textContent=`${report.submittedCount}/${report.participantCount}명 제출 · ${report.correctCount}명 정답 · ${report.gradedCount}명 채점 완료`;
  const rows=$('classic-focus-round-list');rows.replaceChildren();
  const arr=Object.entries(report.entries).map(([userId,e])=>({uid:userId,...e}));
  const statusOrder={correct:0,wrong:1,pending:2,missing:3};
  arr.sort((a,b)=>(statusOrder[a.status]??4)-(statusOrder[b.status]??4)||b.points-a.points||a.responseMs-b.responseMs||a.name.localeCompare(b.name,'ko'));
  arr.forEach((r,i)=>rows.append(focusRow(r,i+1,'round')));
  if(!arr.length)rows.textContent='참가 학생이 없습니다.';
  const totals=$('classic-focus-total-list');totals.replaceChildren();
  const ranked=ranking(totalScores(grades,rosterMembers()));
  const podium=$('classic-focus-podium');podium.hidden=state!=='finished';
  if(state==='finished')renderPodium(podium,ranked);else podium.replaceChildren();
  ranked.forEach((r,i)=>totals.append(focusRow(r,i+1,'total')));
  if(!totals.childElementCount)totals.textContent='아직 결과가 없습니다.';
}
$('classic-auto-reveal').addEventListener('change',event=>setAutoReveal(event.target.checked));
$('classic-focus-auto-reveal').addEventListener('change',event=>setAutoReveal(event.target.checked));
$('classic-focus-open').addEventListener('click',openFocus);
$('classic-focus-close').addEventListener('click',closeFocus);
$('classic-focus-next').addEventListener('click',nextQuestion);
$('classic-focus-pause').addEventListener('click',pauseResume);
$('classic-focus-extend').addEventListener('click',extendTime);
$('classic-focus-reveal').addEventListener('click',revealQuestion);
$('classic-focus-result').addEventListener('click',()=>{arcade.showResults();focusResults=!focusResults;renderFocus();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&focusOpen)closeFocus();});

// 교사 인증과 rooms.js의 방 선택 이벤트가 각각 비동기로 도착합니다.
window.addEventListener('quizlab-room-open',e=>bindRoom(e.detail?.code||''));
if(auth)onAuthStateChanged(auth,user=>{
  teacher=user?.providerData?.some(p=>p.providerId==='google.com')?user:null;
  if(!teacher){detach();ready=false;resetUi();return;}
  if(code)checkRights();
});
if(db)onValue(ref(db,'.info/serverTimeOffset'),snap=>{clockOffset=Number(snap.val()||0);});
$('classic-retry').addEventListener('click',checkRights);
$('classic-copy-rules').addEventListener('click',copyRules);
$('classic-prepare').addEventListener('click',prepareGame);
$('classic-next').addEventListener('click',nextQuestion);
$('classic-reveal').addEventListener('click',revealQuestion);
$('classic-pause').addEventListener('click',pauseResume);
$('classic-extend').addEventListener('click',extendTime);
$('classic-end').addEventListener('click',()=>{if(confirm('클래식 퀴즈를 종료할까요?'))mutate(finishGame);});
$('classic-export').addEventListener('click',csvExport);
setInterval(tick,300);
