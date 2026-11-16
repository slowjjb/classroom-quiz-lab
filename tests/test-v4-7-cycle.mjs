import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shuffleGoldChoices, verifyGoldAnswer, displayedGoldCorrectIndex} from '../js/gold-core.js';
const choices=['가','나','다','라'];
const question={type:'multiple_choice',options:choices,correctIndex:3};
for(const rng of [Math.random,()=>0,()=>0.99999999]){
 for(let run=0;run<30;run++){
  let history=null,seen=new Set(),block=[];
  for(let i=0;i<120;i++){
   const current=shuffleGoldChoices(choices,history,rng,3);
   const fingerprint=current.optionOrder.join(',');
   if(i%24===0)seen.clear();
   assert(!seen.has(fingerprint),`duplicate permutation before 24: ${i} ${fingerprint}`);
   seen.add(fingerprint);
   const slot=displayedGoldCorrectIndex(question,current.optionOrder);
   if(i%4===0)block=[];
   assert(!block.includes(slot),`correct position reused inside a four-attempt block: ${slot} at ${i}`);
   block.push(slot);
   assert(verifyGoldAnswer(question,String(slot),current.optionOrder));
   for(const other of [1,2,3,4].filter(x=>x!==slot))assert(!verifyGoldAnswer(question,String(other),current.optionOrder));
   assert.deepEqual(current.options,current.optionOrder.map(index=>choices[index]));
   history=JSON.parse(JSON.stringify(current.history)); // Firebase-style persistence
  }
 }
}
// Confirm legacy v4.6 arrays are upgraded without forgetting their final position.
for(const previous of [[0,1,2,3],[1,0,3,2],[3,2,1,0]]){
 const prevSlot=previous.indexOf(2)+1;
 const current=shuffleGoldChoices(choices,previous,()=>0,3);
 assert.notDeepEqual(current.optionOrder,previous);
 assert.notEqual(displayedGoldCorrectIndex(question,current.optionOrder),prevSlot);
 assert.equal(typeof current.history.seenMask,'number');
}
const host=readFileSync(new URL('../js/gold-host.js',import.meta.url),'utf8');
assert.match(host,/optionHistory\[key\]=shuffled\.history/);
assert.match(host,/shuffleGoldChoices\(question\.options,optionHistory\[key\],Math\.random,question\.correctIndex\)/);
assert.match(host,/verifyGoldAnswer\(q,submission\.value,state\.optionOrder\)/);
const rooms=readFileSync(new URL('../rooms.html',import.meta.url),'utf8');
const join=readFileSync(new URL('../join.html',import.meta.url),'utf8');
assert.match(rooms,/js\/gold-host\.js\?v=4\.[78]/);
assert.match(join,/js\/join\.js\?v=4\.[78]/);
console.log('v4.7: 24 unique layouts, 4 correct slots per block, teacher grading, JSON persistence, cache busting: PASS');
