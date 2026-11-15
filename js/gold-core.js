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
export function shuffleGoldChoices(options,previousOrder=null,random=Math.random,correctIndex=0){
  const original=optionsArray(options);
  const count=original.length;
  const previous=validGoldOptionOrder(previousOrder,count)?previousOrder:null;
  const correctOriginal=Number(correctIndex)-1;
  const lastCorrectSlot=previous&&correctOriginal>=0&&correctOriginal<count?previous.indexOf(correctOriginal):-1;
  // Do not randomize free-text accepted answers (handled by the host).
  const draw=()=>{
    const indices=Array.from({length:count},(_,i)=>i);
    for(let i=count-1;i>0;i--){
      const roll=Number(random());
      const j=Math.min(i,Math.max(0,Math.floor((Number.isFinite(roll)?roll:0)*(i+1))));
      [indices[i],indices[j]]=[indices[j],indices[i]];
    }
    return indices;
  };
  let order=draw();
  // Repeated questions must change not just the layout but the correct button.
  // Otherwise students could still click the same number from memory.
  const repeats=()=>previous && (order.every((index,i)=>index===previous[i]) ||
    (lastCorrectSlot>=0 && order.indexOf(correctOriginal)===lastCorrectSlot));
  if(previous && count>1){
    for(let attempt=0;attempt<12 && repeats();attempt++)order=draw();
    if(repeats()){
      if(lastCorrectSlot>=0){
        const spot=order.indexOf(correctOriginal),other=(spot+1)%count;
        [order[spot],order[other]]=[order[other],order[spot]];
      }else [order[0],order[1]]=[order[1],order[0]];
    }
  }
  return {options:order.map(index=>original[index]),optionOrder:order};
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

// Returns new scores without mutating the input. Percentage rewards are floored
// to whole gold to avoid stealing/spending more than a player owns.
export function applyGoldOutcome(scores,actorUid,outcome,targetUid=''){
  const roster=structuredClone(scores||{});
  if(!roster[actorUid])throw new Error('참가자 점수 기록이 없습니다.');
  const own=roster[actorUid];
  const current=uid=>Math.max(0,Math.floor(Number(roster[uid]?.gold||0)));
  const startedGold=current(actorUid);
  const validTarget=targetUid&&targetUid!==actorUid&&roster[targetUid];
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
