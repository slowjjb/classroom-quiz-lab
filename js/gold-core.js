// Purplekit v4.0 Gold Quest: pure game logic (no Firebase, no DOM).
import { normalizedAnswer, optionsArray } from './classic-core.js';

export const GOLD_DURATION_MIN = 2;
export const GOLD_DURATION_MAX = 15;
export const GOLD_MAX_PLAYERS = 200;
export const GOLD_MAX_QUESTION_SEQUENCE = 120;
export const GOLD_CHESTS = 3;

export function makeShuffleBag(questionCount, length=GOLD_MAX_QUESTION_SEQUENCE, random=Math.random){
  const count=Math.trunc(Number(questionCount));
  if(!Number.isInteger(count)||count<1||count>2000)throw new Error('문항 수가 올바르지 않습니다.');
  const output=[], recent=[];
  const avoid=Math.min(10,Math.max(0,count-1));
  let pool=[];
  const shuffle=arr=>{
    const a=[...arr];
    for(let i=a.length-1;i>0;i--){const r=Number(random());const j=Math.min(i,Math.max(0,Math.floor((Number.isFinite(r)?r:0)* (i+1))));[a[i],a[j]]=[a[j],a[i]];}
    return a;
  };
  while(output.length<length){
    if(!pool.length)pool=shuffle(Array.from({length:count},(_,i)=>i));
    // Use a shuffle bag, avoiding the recent ten across bag boundaries when possible.
    let choice=pool.findIndex(index=>!recent.includes(index));
    if(choice<0)choice=0;
    const [index]=pool.splice(choice,1);
    output.push(index);recent.push(index);if(recent.length>avoid)recent.shift();
  }
  return output;
}

export function verifyGoldAnswer(question,answer){
  const accepted=optionsArray(question?.options);
  if(question?.type==='typing')return accepted.filter(Boolean).some(item=>normalizedAnswer(item)===normalizedAnswer(answer));
  return /^[1-4]$/.test(String(answer)) && Number(answer)===Number(question?.correctIndex);
}

export function chooseGoldOutcome(random=Math.random,{allowInteractions=true,playerCount=1}={}){
  const n=Math.min(0.999999,Math.max(0,Number(random())||0));
  if(n<.55)return {type:'coins',amount:[80,120,160,200,260][Math.min(4,Math.floor(n*10))]};
  if(n<.74)return {type:'bonus',amount:400};
  if(n<.86&&allowInteractions&&playerCount>1)return {type:'steal',amount:Math.round(100+(n-.74)/.12*200)};
  if(n<.94&&allowInteractions&&playerCount>1)return {type:'swap',portion:.2};
  return {type:'jackpot',amount:650};
}

export function applyGoldOutcome(scores,actorUid,outcome,targetUid=''){
  const roster=structuredClone(scores||{});
  if(!roster[actorUid])throw new Error('참가자 점수 기록이 없습니다.');
  const own=roster[actorUid];
  const current=uid=>Math.max(0,Math.floor(Number(roster[uid]?.gold||0)));
  const startedGold=current(actorUid);
  let message='', affected=[actorUid];
  if(['coins','bonus','jackpot'].includes(outcome?.type)){
    const gain=Math.max(0,Math.floor(Number(outcome.amount||0)));
    own.gold=startedGold+gain;
    message=`골드 +${gain.toLocaleString('ko-KR')}개!`;
  }else if(outcome?.type==='steal'&&targetUid&&targetUid!==actorUid&&roster[targetUid]){
    const stolen=Math.min(current(targetUid),Math.max(0,Math.floor(Number(outcome.amount||0))));
    roster[targetUid].gold=current(targetUid)-stolen;
    own.gold=startedGold+stolen;
    affected.push(targetUid);
    message=`${roster[targetUid].name}에게서 골드 ${stolen}개 획득!`;
  }else if(outcome?.type==='swap'&&targetUid&&targetUid!==actorUid&&roster[targetUid]){
    // In elementary classrooms, only 20% of the gold gap is transferred (never full wipeout).
    const other=current(targetUid);
    const difference=Math.max(0,other-startedGold);
    const transferred=Math.min(other,Math.floor(difference*Math.min(1,Math.max(0,Number(outcome.portion??.2)))));
    roster[targetUid].gold=other-transferred;own.gold=startedGold+transferred;
    affected.push(targetUid);
    message=transferred>0?`${roster[targetUid].name}와 골드 일부 교환! +${transferred}개`:'이미 앞서 있어요! 보너스 120개 지급';
    if(transferred===0)own.gold=startedGold+120;
  }else{
    own.gold=startedGold+180;message='보너스 골드 180개 획득!';
  }
  return {scores:roster,message,affected,gained:own.gold-startedGold};
}

export function goldRanking(scores){
  return Object.entries(scores||{}).map(([uid,x])=>({uid,...x}))
    .sort((a,b)=>Number(b.gold||0)-Number(a.gold||0)||Number(b.correct||0)-Number(a.correct||0)||String(a.name).localeCompare(String(b.name),'ko'));
}
