import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
 CREATURES,FISHING_DURABILITY,FISHING_PENALTY_CHANCE,FISHING_PENALTY_COOLDOWN_MS,
 weightRange,legendChance,tierOdds,pickCreature,lureInterval,lureRetryInterval,freshScore,resolveCatch,fishingRanking
} from '../js/fishing-core.js';
import {makeRulesV5} from '../js/rules-v5.js';

assert.equal(CREATURES.length,23);
for(const [tier,n] of [['normal',8],['big',5],['rare',5],['legend',5]])assert.equal(CREATURES.filter(c=>c.tier===tier).length,n);
assert.equal(new Set(CREATURES.map(c=>c.id)).size,23);
for(let l=1;l<=60;l++){
 const odds=tierOdds(l),total=Object.values(odds).reduce((a,b)=>a+b,0);
 assert.ok(Math.abs(total-1)<1e-10,`odds level ${l}`);
 const [lo,hi]=weightRange(l);
 assert.ok(lo>0&&hi>lo,`range level ${l}`);
 assert.equal(lureInterval(l,()=>0),l<=3?3:l<=6?4:5);
 assert.equal(lureRetryInterval(()=>0),1);
 assert.equal(lureRetryInterval(()=>.999999),3);
}
assert.equal(legendChance(4),0);assert.equal(legendChance(5),.01);assert.equal(legendChance(8),.07);
assert.deepEqual(weightRange(1),[1,10]);assert.deepEqual(weightRange(8),[80,165]);
assert.equal(FISHING_DURABILITY,5);assert.equal(FISHING_PENALTY_CHANCE,.045);assert.equal(FISHING_PENALTY_COOLDOWN_MS,30000);
for(let i=0;i<1000;i++){
 const low=pickCreature(1,Math.random);assert.notEqual(low.tier,'legend');assert.ok(low.kg<=10&&low.kg>=1);
}
// The legendary branch is selected by a roll of zero at level 5.
const rolls=[0,0,.7];let pointer=0;
const legend=pickCreature(5,()=>rolls[pointer++%rolls.length]);
assert.equal(legend.tier,'legend');
let score=freshScore('테스트','a01',()=>0);
const total=score.kg;
for(let n=0;n<4;n++){const ret=resolveCatch(score,{correct:false});score=ret.score;assert.equal(score.kg,total);assert.equal(score.durability,4-n);}
const broken=resolveCatch(score,{correct:false});assert.equal(broken.result.type,'broken');assert.equal(broken.score.level,1);assert.equal(broken.score.durability,5);assert.equal(broken.score.kg,total);
// Lure failure preserves the same level; after 1..3 ordinary correct answers, it can be retried.
const upgraded=resolveCatch(score,{correct:true,upgrade:true});
assert.equal(upgraded.score.level,2);assert.equal(upgraded.score.durability,1);
const retry=resolveCatch({...upgraded.score,durability:5},{correct:false,upgrade:true,rng:()=>0});
assert.equal(retry.score.level,2);assert.equal(retry.score.nextUpgradeAt,1);
assert.equal(retry.score.progress,0);
const fish=resolveCatch(score,{correct:true,canPenalty:false,rng:()=>.5});
assert.equal(fish.result.type,'fish');assert.ok(fish.score.kg>0);
// A room-authorized global penalty does not seize a child's already earned kg.
const penalty=resolveCatch(fish.score,{correct:true,canPenalty:true,rng:()=>0});
assert.equal(penalty.result.type,'penalty');assert.equal(penalty.score.kg,fish.score.kg);
assert.equal(fishingRanking({b:{name:'학생B',kg:10},a:{name:'학생A',kg:20}})[0].uid,'a');
const rules=JSON.parse(makeRulesV5('ExampleTeacherUid01234'));
for(const k of ['v0','v1','v2','v3','v4','v5'])assert.ok(rules.rules[k]);
assert.ok(rules.rules.v5.actions.$code.$uid.$nonce.$action['.write'].includes('biteAt'));
assert.ok(rules.rules.v5.public.$code['.write'].includes('google.com'));
const html=fs.readFileSync('join.html','utf8');
for(const id of ['fishing-cast-button','fishing-submit','fishing-next','fishing-penalty','fishing-catch-image'])assert.ok(html.includes(`id="${id}"`));
for(const fish of CREATURES)assert.ok(fs.existsSync(`images/fishing/${fish.id}.png`),fish.id);
console.log('v5 fishing: 23 species, tiers, growth, durability, penalties, rules, assets, UI PASS');
