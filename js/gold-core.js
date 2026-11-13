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

export function goldRanking(scores){
  return Object.entries(scores||{}).map(([uid,x])=>({uid,...x}))
    .sort((a,b)=>Number(b.gold||0)-Number(a.gold||0)||Number(b.correct||0)-Number(a.correct||0)||String(a.name).localeCompare(String(b.name),'ko'));
}
