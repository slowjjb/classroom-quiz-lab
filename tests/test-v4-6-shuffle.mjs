import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shuffleGoldChoices,verifyGoldAnswer,originalGoldChoiceIndex,displayedGoldCorrectIndex} from '../js/gold-core.js';
const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const question={number:7,type:'multiple_choice',options:['가','나','다','라'],correctIndex:3};
// Correctness must follow the shuffled display, not the original CSV slot.
for(let correctPosition=1;correctPosition<=4;correctPosition++){
  const order=Array.from({length:4},(_,i)=>i);
  [order[correctPosition-1],order[2]]=[order[2],order[correctPosition-1]];
  assert.equal(displayedGoldCorrectIndex(question,order),correctPosition);
  for(let chosen=1;chosen<=4;chosen++){
    assert.equal(verifyGoldAnswer(question,String(chosen),order),chosen===correctPosition);
    assert.equal(originalGoldChoiceIndex(String(chosen),order),order[chosen-1]+1);
  }
}
assert.equal(verifyGoldAnswer(question,'3'),true,'legacy unshuffled room must still work');
assert.equal(verifyGoldAnswer(question,'2'),false);
assert.equal(verifyGoldAnswer(question,'0'),false);
assert.equal(verifyGoldAnswer(question,'x'),false);
assert.equal(verifyGoldAnswer({type:'typing',options:['합동','모양과 크기가 같음']},'합동',[2,0,3,1]),true,'typing unchanged');
const unmodified=[...question.options];
let last=null;
let lastCorrect=0;
for(let n=0;n<180;n++){
  // Constant RNG would otherwise repeat the exact same order forever.
  const {options,optionOrder}=shuffleGoldChoices(question.options,last,()=>0,question.correctIndex);
  assert.deepEqual(options,optionOrder.map(i=>question.options[i]));
  if(last){
    assert.notDeepEqual(optionOrder,last,'repeat attempt must not use identical permutation');
    assert.notEqual(displayedGoldCorrectIndex(question,optionOrder),lastCorrect,'correct slot must move on a repeated question');
  }
  assert.equal(verifyGoldAnswer(question,String(optionOrder.indexOf(2)+1),optionOrder),true);
  last=optionOrder;lastCorrect=displayedGoldCorrectIndex(question,optionOrder);
}
assert.deepEqual(question.options,unmodified,'the imported set must not be changed');
let seed=9401;
const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
let previous=null;let previousCorrect=0;const permutations=new Set(),correctPositions=new Set();
for(let i=0;i<250;i++){
  const trial=shuffleGoldChoices(question.options,previous,rand,question.correctIndex);
  permutations.add(trial.optionOrder.join(','));
  correctPositions.add(displayedGoldCorrectIndex(question,trial.optionOrder));
  if(previous){
    assert.notDeepEqual(trial.optionOrder,previous);
    assert.notEqual(displayedGoldCorrectIndex(question,trial.optionOrder),previousCorrect);
  }
  previous=trial.optionOrder;previousCorrect=displayedGoldCorrectIndex(question,trial.optionOrder);
}
assert.ok(permutations.size>=20,'many option permutations should be reachable');
assert.deepEqual([...correctPositions].sort(),[1,2,3,4]);
const host=src('js/gold-host.js');
assert.match(host,/shuffleGoldChoices\(question\.options,optionHistory\[key\],Math\.random,question\.correctIndex\)/);
assert.match(host,/optionHistory,?/);
assert.match(host,/verifyGoldAnswer\(q,submission\.value,state\.optionOrder\)/);
assert.match(host,/originalGoldChoiceIndex\(submission\.value,state\.optionOrder\)/);
assert.match(host,/displayedGoldCorrectIndex\(q,state\.optionOrder\)/);
assert.ok(!src('js/gold-student.js').includes('correctIndex'),'student never gets original correctIndex');
assert.match(src('js/join.js'),/gold-student\.js\?v=4\.7/);
assert.match(src('rooms.html'),/js\/gold-host\.js\?v=4\.7/);
console.log('v4.6 per-attempt choice shuffle, no immediate repeat, mapped scoring, typing and legacy compatibility: PASS');
