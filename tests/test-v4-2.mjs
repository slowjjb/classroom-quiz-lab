import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GOLD_REWARD_TABLE,GOLD_REWARD_WEIGHT_TOTAL,chooseGoldOutcome,applyGoldOutcome} from '../js/gold-core.js';
import {buildGoldAccuracy,goldPercent,goldTier} from '../js/gold-analytics.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

assert.equal(GOLD_REWARD_TABLE.length,17);
assert.equal(GOLD_REWARD_WEIGHT_TOTAL,1000);
const seen=new Map();
for(let i=0;i<1000;i++){
  const out=chooseGoldOutcome(()=>(i+.5)/1000,{allowInteractions:true,playerCount:20});
  const key=out.label;
  seen.set(key,(seen.get(key)||0)+1);
}
for(const item of GOLD_REWARD_TABLE){
  assert.equal(seen.get(item.label),item.weight,`${item.label} probability`);
}
for(let i=0;i<1000;i++){
  for(const opts of [{allowInteractions:false,playerCount:20},{allowInteractions:true,playerCount:1}]){
    assert.ok(!['steal','swap'].includes(chooseGoldOutcome(()=>(i+.5)/1000,opts).type));
  }
}
const coins={a:{name:'가',gold:0},b:{name:'나',gold:349}};
for(const factor of [2,3]){
  const result=applyGoldOutcome(coins,'a',{type:'multiply',factor});
  assert.equal(result.scores.a.gold,0,'0G multiplier must remain 0');
}
assert.equal(applyGoldOutcome(coins,'a',{type:'empty'}).scores.a.gold,0);
assert.equal(applyGoldOutcome(coins,'a',{type:'coins',amount:250}).scores.a.gold,250);
assert.equal(applyGoldOutcome(coins,'a',{type:'steal',fraction:.1},'b').scores.a.gold,34);
assert.equal(applyGoldOutcome(coins,'a',{type:'steal',fraction:.5},'b').scores.a.gold,174);
assert.equal(applyGoldOutcome(coins,'a',{type:'steal',fraction:1},'b').scores.a.gold,349);
assert.equal(applyGoldOutcome(coins,'a',{type:'swap'},'b').scores.b.gold,0);
assert.equal(applyGoldOutcome({a:{gold:350}},'a',{type:'lose',fraction:.1}).scores.a.gold,315);
assert.equal(applyGoldOutcome({a:{gold:350}},'a',{type:'lose',fraction:.5}).scores.a.gold,175);
assert.equal(applyGoldOutcome({a:{gold:350}},'a',{type:'lose',fraction:1}).scores.a.gold,0);
assert.equal(coins.b.gold,349,'pure reward reducer must not mutate original state');

assert.equal(goldPercent(3,4),75);
assert.equal(goldPercent(1,2),50);
assert.equal(goldPercent(0,0),null);
for(const [rate,tier] of [[75,'high'],[74,'mid'],[51,'mid'],[50,'low'],[0,'low'],[null,'none']])assert.equal(goldTier(rate),tier);
const data={roster:{a:'가',b:'나',c:'다'},scores:{a:{avatarId:'a03'}},questions:[
  {number:1,prompt:'첫 문제'},{number:2,prompt:'둘째 문제'},{number:3,prompt:'아무도 안 푼 문제'}
],answersLog:{a:{
  a0_aaa:{questionIndex:0,correct:false,at:100},
  a1_bbb:{questionIndex:1,correct:true,at:200},
  a3_ccc:{questionIndex:0,correct:true,at:400}
},b:{a0_ddd:{questionIndex:0,correct:true,at:100}}}};
const first=buildGoldAccuracy({...data,mode:'first'});
assert.equal(first.allAttempts,4);
assert.equal(first.firstAttempts,3);
assert.equal(first.summary.correct,2);
assert.equal(first.summary.total,3);
assert.equal(first.questions[0].rate,50,'first attempt: 1 of 2');
assert.equal(first.questions[1].rate,100);
assert.equal(first.questions[2].rate,null,'unanswered is not 0%');
assert.equal(first.students.find(p=>p.uid==='a').rate,50);
assert.equal(first.students.find(p=>p.uid==='c').rate,null);
const all=buildGoldAccuracy({...data,mode:'all'});
assert.equal(all.questions[0].rate,67);
assert.equal(all.students.find(p=>p.uid==='a').rate,67);
assert.equal(all.summary.total,4);
for(const id of ['gold-stats-ranking','gold-stats-students','gold-stats-questions','gold-stats-mode','gold-podium-toggle'])assert.ok(read('rooms.html').includes(`id="${id}"`),id);
assert.match(read('js/gold-host.js'),/runTransaction/);
assert.match(read('js/gold-host.js'),/lastRewardNonce/);
console.log('v4.2 17 rewards, exact probabilities, zero-gold multipliers, analytics first/all, transaction: PASS');
