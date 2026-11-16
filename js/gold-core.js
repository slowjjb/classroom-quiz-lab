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

export function verifyGoldAnswer(question,answer,optionOrder=null){
  const accepted=optionsArray(question?.options);
  if(question?.type==='typing')return accepted.filter(Boolean).some(item=>normalizedAnswer(item)===normalizedAnswer(answer));
  const original=originalGoldChoiceIndex(answer,optionOrder,accepted.length);
  return original>0 && original===Number(question?.correctIndex);
}

// v4.6: each Gold Quest multiple-choice attempt gets a newly shuffled view.
// The canonical option order and correctIndex stay private on the teacher side.
// Returned order[i] is the ORIGINAL zero-based index displayed in slot i.
function validGoldOptionOrder(order,count){
  return Array.isArray(order) && order.length===count &&
    order.every(index=>Number.isInteger(index)&&index>=0&&index<count) &&
    new Set(order).size===count;
}
// v4.7: cycle across all distinct option permutations before reusing one.
// A compact bit mask tracks the 24 permutations of four choices per question,
// while a second mask makes the correct choice visit every position once in
// each four-attempt cycle. The student's private state keeps this progress.
// Legacy v4.6 previousOrder arrays are accepted and upgraded automatically.
export function shuffleGoldChoices(options,previousOrder=null,random=Math.random,correctIndex=0){
  const original=optionsArray(options);
  const count=original.length;
  const correctOriginal=Number(correctIndex)-1;
  const record=Array.isArray(previousOrder)?{last:previousOrder}:previousOrder||{};
  const previous=validGoldOptionOrder(record.last,count)?record.last:null;
  const perms=[];
  function enumerate(path,remaining){
    if(!remaining.length){perms.push(path);return;}
    for(let i=0;i<remaining.length;i++)enumerate([...path,remaining[i]],remaining.filter((_,j)=>j!==i));
  }
  // Four answers are the CSV standard; the small bound keeps enumeration safe.
  if(count<2||count>4){
    const order=Array.from({length:count},(_,i)=>i);
    for(let i=count-1;i>0;i--){const n=Number(random());const j=Math.min(i,Math.max(0,Math.floor((Number.isFinite(n)?n:0)*(i+1))));[order[i],order[j]]=[order[j],order[i]];}
    return {options:order.map(i=>original[i]),optionOrder:order,history:{last:order,seenMask:0,slotsMask:0}};
  }
  enumerate([],Array.from({length:count},(_,i)=>i));
  const key=arr=>arr.join(',');
  const lastIndex=previous?perms.findIndex(p=>key(p)===key(previous)):-1;
  let seenMask=Number.isInteger(record.seenMask)?record.seenMask>>>0:0;
  let slotsMask=Number.isInteger(record.slotsMask)?record.slotsMask>>>0:0;
  if(lastIndex>=0){seenMask|=(1<<lastIndex);if(!slotsMask&&correctOriginal>=0&&correctOriginal<count)slotsMask|=1<<previous.indexOf(correctOriginal);}
  const fullMask=(1<<perms.length)-1;
  if((seenMask&fullMask)===fullMask){seenMask=0;slotsMask=0;}
  const lastSlot=previous&&correctOriginal>=0&&correctOriginal<count?previous.indexOf(correctOriginal):-1;
  // Pool contains only permutations not already used in this 24-draw cycle.
  let pool=perms.map((order,index)=>({order,index,slot:order.indexOf(correctOriginal)}))
    .filter(item=>!(seenMask&(1<<item.index))&&item.index!==lastIndex);
  if(!pool.length){seenMask=0;slotsMask=0;pool=perms.map((order,index)=>({order,index,slot:order.indexOf(correctOriginal)})).filter(x=>x.index!==lastIndex);}
  if(correctOriginal>=0&&correctOriginal<count){
    if(slotsMask===(1<<count)-1)slotsMask=0;
    // First prefer a correct position not yet used in this group of four.
    let slotsPool=pool.filter(item=>!(slotsMask&(1<<item.slot)) && item.slot!==lastSlot);
    if(!slotsPool.length){slotsMask=0;slotsPool=pool.filter(item=>item.slot!==lastSlot);}
    if(slotsPool.length)pool=slotsPool;
  }
  const roll=Number(random());
  const chosen=pool[Math.min(pool.length-1,Math.max(0,Math.floor((Number.isFinite(roll)?roll:0)*pool.length)))];
  const order=chosen.order;
  const history={last:order,seenMask:(seenMask|(1<<chosen.index))>>>0,
    slotsMask:correctOriginal>=0&&correctOriginal<count?(slotsMask|(1<<chosen.slot))>>>0:0};
  return {options:order.map(index=>original[index]),optionOrder:order,history};
}
// A submission refers to the *displayed* slot, not the original CSV slot.
// Old v4.5 states without an optionOrder retain their original scoring.
export function originalGoldChoiceIndex(selected,optionOrder,optionCount=4){
  if(!/^[1-4]$/.test(String(selected)))return 0;
  const displayed=Number(selected);
  if(!validGoldOptionOrder(optionOrder,optionCount))return displayed;
  return optionOrder[displayed-1]+1;
}
export function displayedGoldCorrectIndex(question,optionOrder){
  const original=Number(question?.correctIndex||0);
  const count=optionsArray(question?.options).length;
  if(!validGoldOptionOrder(optionOrder,count))return original;
  const displayed=optionOrder.indexOf(original-1);
  return displayed>=0?displayed+1:original;
}

// Purplekit v4.2: exactly 1000 integer-weighted chances per chest.
// Probabilities apply independently to each chosen chest; all three have the same table.
// Interactions that are disabled or impossible (one player) are excluded and
// the remaining outcomes are renormalized. There is no hidden minimum payout.
export const GOLD_REWARD_TABLE = Object.freeze([
  {type:'coins',amount:10,weight:100,label:'+10G'},
  {type:'coins',amount:20,weight:130,label:'+20G'},
  {type:'coins',amount:35,weight:120,label:'+35G'},
  {type:'coins',amount:50,weight:100,label:'+50G'},
  {type:'coins',amount:80,weight:70,label:'+80G'},
  {type:'coins',amount:120,weight:48,label:'+120G'},
  {type:'coins',amount:250,weight:17,label:'+250G 대박'},
  {type:'multiply',factor:2,weight:10,label:'보유 골드 2배'},
  {type:'multiply',factor:3,weight:2,label:'보유 골드 3배'},
  {type:'steal',fraction:.1,weight:120,label:'상대 골드 10% 빼앗기'},
  {type:'steal',fraction:.5,weight:50,label:'상대 골드 50% 빼앗기'},
  {type:'steal',fraction:1,weight:1,label:'상대 골드 전부 빼앗기'},
  {type:'swap',weight:1,label:'상대와 골드 전부 교환'},
  {type:'lose',fraction:.1,weight:100,label:'내 골드 10% 잃기'},
  {type:'lose',fraction:.5,weight:50,label:'내 골드 50% 잃기'},
  {type:'lose',fraction:1,weight:1,label:'내 골드 전부 잃기'},
  {type:'empty',weight:80,label:'빈 상자'}
]);
export const GOLD_REWARD_WEIGHT_TOTAL=GOLD_REWARD_TABLE.reduce((sum,r)=>sum+r.weight,0);

export function chooseGoldOutcome(random=Math.random,{allowInteractions=true,playerCount=1}={}){
  const candidates=GOLD_REWARD_TABLE.filter(entry=>
    allowInteractions&&playerCount>1 || !['steal','swap'].includes(entry.type));
  const total=candidates.reduce((sum,entry)=>sum+entry.weight,0);
  const raw=Number(random());
  let n=Math.min(0.999999999999,Math.max(0,Number.isFinite(raw)?raw:0))*total;
  for(const entry of candidates){
    if(n<entry.weight)return {...entry};
    n-=entry.weight;
  }
  return {...candidates[candidates.length-1]};
}

// Effective percentages: disallowed interactions are removed and weights renormalized.
export function goldRewardOdds({allowInteractions=true,playerCount=1}={}){
  const pool=GOLD_REWARD_TABLE.filter(entry=>
    (allowInteractions&&playerCount>1) || !['steal','swap'].includes(entry.type));
  const total=pool.reduce((sum,entry)=>sum+entry.weight,0);
  return pool.map(entry=>({...entry,percent:total?entry.weight/total*100:0}));
}
export function validGoldTarget(scores,actorUid,targetUid){
  return Boolean(targetUid&&targetUid!==actorUid&&Object.prototype.hasOwnProperty.call(scores||{},targetUid));
}

// Returns new scores without mutating the input. Percentage rewards are floored
// to whole gold to avoid stealing/spending more than a player owns.
export function applyGoldOutcome(scores,actorUid,outcome,targetUid=''){
  const roster=structuredClone(scores||{});
  if(!roster[actorUid])throw new Error('참가자 점수 기록이 없습니다.');
  const own=roster[actorUid];
  const current=uid=>Math.max(0,Math.floor(Number(roster[uid]?.gold||0)));
  const startedGold=current(actorUid);
  const validTarget=validGoldTarget(roster,actorUid,targetUid);
  let message='',affected=[actorUid];
  const percent=fraction=>Math.max(0,Math.min(1,Number(fraction)||0));
  if(outcome?.type==='coins'){
    const gain=Math.max(0,Math.floor(Number(outcome.amount||0)));
    own.gold=startedGold+gain;
    message=`골드 +${gain.toLocaleString('ko-KR')}G!`;
  }else if(outcome?.type==='multiply'){
    const factor=[2,3].includes(Number(outcome.factor))?Number(outcome.factor):1;
    own.gold=startedGold*factor;
    message=`골드 ${factor}배! ${startedGold.toLocaleString('ko-KR')}G → ${own.gold.toLocaleString('ko-KR')}G`;
  }else if(outcome?.type==='steal'&&validTarget){
    const other=current(targetUid);
    const stolen=Math.floor(other*percent(outcome.fraction));
    roster[targetUid].gold=other-stolen;
    own.gold=startedGold+stolen;
    affected.push(targetUid);
    message=`${roster[targetUid].name||'상대'}에게서 골드 ${stolen.toLocaleString('ko-KR')}G 빼앗기!`;
  }else if(outcome?.type==='swap'&&validTarget){
    const other=current(targetUid);
    own.gold=other;
    roster[targetUid].gold=startedGold;
    affected.push(targetUid);
    message=`${roster[targetUid].name||'상대'}와 골드 전부 교환! (${startedGold}G ↔ ${other}G)`;
  }else if(outcome?.type==='lose'){
    const loss=Math.floor(startedGold*percent(outcome.fraction));
    own.gold=startedGold-loss;
    message=percent(outcome.fraction)===1?'골드를 전부 잃었습니다!':`골드 ${loss.toLocaleString('ko-KR')}G 잃기!`;
  }else if(outcome?.type==='empty'){
    own.gold=startedGold;
    message='빈 상자! 아무것도 얻지 못했어요.';
  }else{
    // A stale/invalid target never creates gold or wipes anyone out.
    own.gold=startedGold;
    message='상대를 찾지 못해 골드 변화가 없습니다.';
  }
  return {scores:roster,message,affected,gained:own.gold-startedGold};
}

// v4.5: presentation-only interpretation of an already committed reward.
// The actual balance change remains authoritative in Firebase; this helper
// never rolls a reward or modifies gold.
export function describeGoldReveal(reward){
  const kind=String(reward?.type||'empty');
  const delta=Number(reward?.gained||0);
  const positive=delta>0,negative=delta<0;
  const mood=positive?'positive':negative?'negative':'neutral';
  const heading={
    coins:'황금 보상을 획득했어요!',
    multiply:positive?'골드가 크게 늘었어요!':'배수 보상! 그런데…',
    steal:positive?'다른 친구의 골드를 가져왔어요!':'골드를 가져오지 못했어요!',
    swap:'친구와 골드를 교환했어요!',
    lose:negative?'앗! 골드를 잃었어요!':'잃을 골드가 없어요!',
    empty:'빈 상자!',
  }[kind]||'상자 결과를 확인하세요!';
  const icon=kind==='empty'?'📦':kind==='swap'?'🔄':negative?'💥':positive?'✨':'🎲';
  const change=`${delta>0?'+':delta<0?'−':''}${Math.abs(delta).toLocaleString('ko-KR')} G`;
  return {mood,heading,icon,change,description:String(reward?.description||'골드 변화가 없습니다.')};
}

export function goldRanking(scores){
  return Object.entries(scores||{}).map(([uid,x])=>({uid,...x}))
    .sort((a,b)=>Number(b.gold||0)-Number(a.gold||0)||Number(b.correct||0)-Number(a.correct||0)||String(a.name).localeCompare(String(b.name),'ko'));
}
