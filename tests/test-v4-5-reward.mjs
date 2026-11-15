import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {describeGoldReveal,applyGoldOutcome,GOLD_REWARD_TABLE} from '../js/gold-core.js';
const src=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const cases=[
  [{type:'coins',description:'골드 +120G!',gained:120},'positive','+120 G'],
  [{type:'steal',description:'상대에게서 골드 빼앗기',gained:35},'positive','+35 G'],
  [{type:'lose',description:'골드 25G 잃기',gained:-25},'negative','−25 G'],
  [{type:'swap',description:'상대와 교환',gained:-200},'negative','−200 G'],
  [{type:'swap',description:'상대와 교환',gained:0},'neutral','0 G'],
  [{type:'multiply',description:'골드 2배! 0→0',gained:0},'neutral','0 G'],
  [{type:'empty',description:'빈 상자!',gained:0},'neutral','0 G'],
];
for(const [reward, mood, change] of cases){
  const info=describeGoldReveal(reward);
  assert.equal(info.mood,mood);assert.equal(info.change,change);
  assert.ok(info.heading&&info.description&&info.icon);
}
const scores={a:{gold:0,name:'가'},b:{gold:240,name:'나'}};
const doubled=applyGoldOutcome(scores,'a',{type:'multiply',factor:3});
assert.equal(doubled.scores.a.gold,0);
assert.equal(describeGoldReveal({type:'multiply',gained:doubled.gained}).mood,'neutral');
const swap=applyGoldOutcome({a:{gold:350,name:'가'},b:{gold:80,name:'나'}},'a',{type:'swap'},'b');
assert.equal(swap.gained,-270);
assert.equal(describeGoldReveal({type:'swap',gained:swap.gained}).mood,'negative');
assert.equal(GOLD_REWARD_TABLE.length,17,'Keep v4.2 reward table unchanged');
for(const id of ['gold-reward-reveal','gold-reward-icon','gold-reward-title','gold-reward-change','gold-reward-detail','gold-reward-balance','gold-reward-next'])assert.ok(src('join.html').includes(`id="${id}"`),id);
const student=src('js/gold-student.js'),css=src('gold.css'),arcade=src('js/arcade-ui.js');
assert.match(student,/lastRewardNonce!==pendingPickNonce/);
assert.match(student,/sound\.reward\(info\.mood\)/);
assert.match(student,/REWARD_DISPLAY_MS=3000/);
assert.match(student,/showingRewardNonce.*closeReward/);
assert.match(student,/pendingPickNonce=nonce/);
assert.match(css,/\.gold-reward-reveal:not\(\[hidden\]\)/);
for(const fx of ['reward-positive','reward-negative','reward-neutral'])assert.ok(arcade.includes(fx),fx);
assert.match(src('js/join.js'),/gold-student\.js\?v=4\.[56]/);
assert.match(src('join.html'),/gold\.css\?v=4\.[56]/);
console.log('v4.5 reward reveal classes, event binding, actual committed payout, styles and original jingles: PASS');
