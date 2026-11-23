// Purplekit Racing v6 alpha5 — deterministic, testable scoring.
// The host alone evaluates answers and commits race movement in Firebase.
export const RACING_MIN_METERS=20;
export const RACING_MAX_METERS=100;
export const RACING_REWARDS=Object.freeze([
  {id:'boost1',name:'⚡ 터보 +1m',delta:1,weight:43},
  {id:'boost2',name:'🚀 부스터 +2m',delta:2,weight:20},
  {id:'boost3',name:'🌟 슈퍼 부스터 +3m',delta:3,weight:6},
  {id:'slip1',name:'🌀 미끄러짐 -1m',delta:-1,weight:15},
  {id:'slip2',name:'🌧️ 빗길 -2m',delta:-2,weight:5},
  {id:'shield',name:'🛡️ 안전 주행',delta:0,weight:11}
]);
export function chooseRacingReward(random=Math.random){
  const v=Math.max(0,Math.min(.999999,Number(random())||0))*RACING_REWARDS.reduce((n,x)=>n+x.weight,0);
  let cursor=0;for(const item of RACING_REWARDS){cursor+=item.weight;if(v<cursor)return item}
  return RACING_REWARDS[0];
}
export function racingScore(name,carId){return {name:String(name||'참가자'),carId:String(carId),meters:0,answered:0,correct:0,finishedAt:0}}
export function scoreRacingAnswer(score,{correct,nonce,finishMeters,at=0,reward=null}){
  if(!score||!nonce||score.lastAnswerNonce===nonce)return null;
  const was=Number(score.meters||0),hits=Number(score.correct||0)+(correct?1:0),attempts=Number(score.answered||0)+1;
  const spin=correct&&hits%3===0;
  const prize=spin?(reward||RACING_REWARDS[0]):null;
  const bonus=spin?Number(prize.delta||0):0;
  const meters=Math.min(Number(finishMeters)||20,Math.max(0,was+(correct?1:0)+bonus));
  return {...score,meters,answered:attempts,correct:hits,lastAnswerNonce:nonce,
    ...(meters>=finishMeters&&!score.finishedAt?{finishedAt:Number(at)||Date.now()}:{}),
    lastResult:{nonce,correct,delta:meters-was,bonus,spin,reward:prize?{id:prize.id,name:prize.name,delta:prize.delta}:null,meters,at:Number(at)||Date.now()}};
}
export function racingStandings(scores={}){
  return Object.entries(scores||{}).map(([uid,s])=>({uid,...s})).sort((a,b)=>
    Number(b.meters||0)-Number(a.meters||0) ||
    Number(b.correct||0)-Number(a.correct||0) ||
    Number(a.finishedAt||Infinity)-Number(b.finishedAt||Infinity) ||
    String(a.name||'').localeCompare(String(b.name||''),'ko'));
}
