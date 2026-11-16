import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GOLD_REWARD_TABLE,goldRewardOdds,chooseGoldOutcome,applyGoldOutcome,validGoldTarget,GOLD_REWARD_WEIGHT_TOTAL} from '../js/gold-core.js';
import {makeRulesV4} from '../js/rules-v4.js';
const text=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const host=text('js/gold-host.js'),student=text('js/gold-student.js'),teacherHtml=text('rooms.html'),studentHtml=text('join.html');
const ruleJson=makeRulesV4('teacher-uid');
const rule=JSON.parse(ruleJson).rules;
assert.equal(GOLD_REWARD_WEIGHT_TOTAL,1000);
const probabilities=goldRewardOdds({allowInteractions:true,playerCount:20});
assert.equal(probabilities.length,17);
assert.equal(Math.round(probabilities.reduce((sum,x)=>sum+x.percent,0)*100000)/100000,100);
for(const [allowInteractions,playerCount] of [[false,20],[true,1]]){
  const list=goldRewardOdds({allowInteractions,playerCount});
  assert.equal(list.filter(x=>['steal','swap'].includes(x.type)).length,0);
  assert.equal(Math.round(list.reduce((sum,x)=>sum+x.percent,0)*100000)/100000,100);
}
for(const reward of GOLD_REWARD_TABLE){
 const chance=probabilities.find(x=>x.label===reward.label);
 assert.equal(chance.weight,reward.weight);
 assert(Math.abs(chance.percent-reward.weight/10)<1e-10);
}
const scores={a:{name:'가',gold:100},b:{name:'나',gold:850},c:{name:'다',gold:370}};
assert(validGoldTarget(scores,'a','b'));
assert(!validGoldTarget(scores,'a','a'));
assert(!validGoldTarget(scores,'a','missing'));
for(const fraction of [.1,.5,1]){
 const after=applyGoldOutcome(scores,'a',{type:'steal',fraction},'b');
 const stolen=Math.floor(850*fraction);
 assert.equal(after.scores.a.gold,100+stolen);
 assert.equal(after.scores.b.gold,850-stolen);
 assert.equal(after.scores.c.gold,370);
 assert.equal(scores.b.gold,850);
}
const swapped=applyGoldOutcome(scores,'a',{type:'swap'},'c');
assert.equal(swapped.scores.a.gold,370);
assert.equal(swapped.scores.c.gold,100);
assert.equal(swapped.scores.b.gold,850);
for(const outcome of [{type:'steal',fraction:.5},{type:'swap'}]){
 const invalid=applyGoldOutcome(scores,'a',outcome,'a');
 assert.equal(invalid.scores.a.gold,100);
 assert.equal(invalid.scores.b.gold,850);
}
assert.match(host,/targetMode\s*===\s*['"]choose['"]/);
assert.match(host,/pendingOutcome/);
assert.match(host,/TARGET_WAIT_MS\s*=\s*15000/);
assert.match(host,/processTarget\(uid,state,targets\?\.\[uid\]\?\.\[state\.nonce\]/);
assert.match(host,/runTransaction\(scoreRef/);
assert.match(host,/lastRewardNonce\s*===\s*nonce/);
assert.match(host,/targetChoiceCheck/);
assert.match(host,/goldRewardOdds\(/);
assert.match(student,/v4\/targets\/\$\{code\}\/\$\{uid\}\/\$\{nonce\}/);
assert.match(student,/gold-target-options/);
assert.match(student,/gold-target-submit/);
assert.match(teacherHtml,/id="gold-focus-top3"/);
assert.match(teacherHtml,/id="gold-focus-odds-grid"/);
assert.match(teacherHtml,/id="gold-target-mode"/);
assert.match(studentHtml,/id="gold-student-target-view"/);
assert.match(studentHtml,/id="gold-target-clock"/);
assert.equal(rule.v4.targets.$code.$uid.$nonce['.validate'].includes('scores/'),true);
assert.equal(rule.v4.targets.$code.$uid.$nonce['.write'].includes("phase').val() === 'target'"),true);
assert.equal(rule.v4.targets.$code.$uid.$nonce['.write'].includes('!data.exists()'),true);
assert.equal(rule.v4.targets.$code.$uid.$nonce['.write'].includes('targetDeadline'),true);
assert(rule.v4.targetChoiceCheck);
console.log('v4.8: 17 reward odds, 15s target choice, invalid target prevention, transaction idempotence wiring, permissions and UI elements: PASS');
