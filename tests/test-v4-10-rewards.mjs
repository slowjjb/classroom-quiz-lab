import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  GOLD_REWARD_TABLE,GOLD_REWARD_WEIGHT_TOTAL,chooseGoldOutcome,goldRewardOdds,
  applyGoldOutcome,describeGoldReveal
} from '../js/gold-core.js';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
assert.equal(GOLD_REWARD_TABLE.length,17);
assert.equal(GOLD_REWARD_WEIGHT_TOTAL,2000,'exact 0.05% granularity');
const prob=goldRewardOdds({allowInteractions:true,playerCount:20});
assert.ok(Math.abs(prob.reduce((a,b)=>a+b.percent,0)-100)<1e-9);
const prize=(type,field,val)=>GOLD_REWARD_TABLE.find(x=>x.type===type && x[field]===val);
assert.equal(prize('lose','fraction',.1).weight,160);
assert.equal(prize('lose','fraction',.3).weight,60);
assert.equal(prize('lose','fraction',1).weight,1);
assert.ok(!prize('lose','fraction',.5));
assert.equal(prize('coins','amount',10).weight,240);
assert.equal(prize('coins','amount',20).weight,280);
assert.equal(prize('coins','amount',35).weight,260);
assert.equal(prize('coins','amount',250).weight,35);
const frequencies=new Map();
for(let i=0;i<2000;i++){
  const outcome=chooseGoldOutcome(()=>(i+.5)/2000,{allowInteractions:true,playerCount:20});
  frequencies.set(outcome.label,(frequencies.get(outcome.label)||0)+1);
}
for(const reward of GOLD_REWARD_TABLE)assert.equal(frequencies.get(reward.label),reward.weight,reward.label);
assert.equal(frequencies.get('내 골드 전부 잃기'),1,'0.05% = 1 in 2,000');
for(const params of [{allowInteractions:false,playerCount:20},{allowInteractions:true,playerCount:1}]){
  const available=goldRewardOdds(params);
  assert.ok(available.every(x=>!['steal','swap'].includes(x.type)));
  assert.ok(Math.abs(available.reduce((a,b)=>a+b.percent,0)-100)<1e-9);
}
assert.equal(applyGoldOutcome({u:{name:'A',gold:500}},'u',{type:'lose',fraction:.3}).scores.u.gold,350);
assert.equal(applyGoldOutcome({u:{name:'A',gold:1}},'u',{type:'lose',fraction:.3}).scores.u.gold,1,'round down fraction');
const loss=describeGoldReveal({type:'lose',fraction:.3,gained:-150,choice:2,description:'골드 150G 잃기!'});
assert.equal(loss.prize,'내 골드 30% 잃기!');
assert.equal(loss.chest,'2번 상자에서 나온 보상');
assert.equal(loss.change,'−150 G');
assert.equal(loss.mood,'negative');
assert.equal(describeGoldReveal({type:'lose',fraction:1,gained:-50}).prize,'내 골드 전부 잃기!');
assert.equal(describeGoldReveal({type:'coins',amount:35,gained:35,choice:1}).prize,'+35G 획득!');
assert.equal(describeGoldReveal({type:'multiply',factor:3,gained:0}).prize,'내 골드 3배!');
assert.equal(describeGoldReveal({type:'steal',fraction:.1,gained:90}).prize,'상대 골드 10% 빼앗기!');
assert.equal(describeGoldReveal({type:'swap',gained:-50}).prize,'친구와 골드 전부 교환!');
assert.equal(describeGoldReveal({type:'empty',gained:0}).prize,'빈 상자!');
for(const id of ['gold-reward-prize','gold-reward-chest','gold-reward-change','gold-reward-title'])
  assert.ok(read('join.html').includes(`id="${id}"`),id);
assert.match(read('js/gold-student.js'),/gold-reward-prize/);
assert.match(read('js/gold-student.js'),/gold-reward-chest/);
assert.match(read('gold.css'),/\.gold-reward-prize/);
assert.match(read('js/gold-host.js'),/goldRewardOdds\(/,'teacher odds display reads true probabilities');
assert.match(read('js/gold-host.js'),/runTransaction\(scoreRef/,'Firebase payout transaction unchanged');
console.log('v4.10: 17 rewards, exactly 2000 tickets, lower losses, 0.05% rare loss, prize+chest reveal: PASS');
