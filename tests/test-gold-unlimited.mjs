import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeShuffleBag,continuingGoldQuestionIndex} from '../js/gold-core.js';

// The existing 120 answers remain unchanged; #121 onward must never enter waiting.
for(const count of [1,2,5,10,11,20,50]){
 const deck=makeShuffleBag(count,120,()=>0.47);
 const seed='member-A:2026-11-27';
 let history=deck.slice(-Math.min(10,count-1));
 for(let seq=120;seq<265;seq++){
  const next=continuingGoldQuestionIndex(deck,seq,count,seed);
  assert.ok(Number.isInteger(next)&&next>=0&&next<count);
  assert.equal(next,continuingGoldQuestionIndex(deck,seq,count,seed),'repeat/reconnect deterministic');
  assert.ok(!history.includes(next),'recent ten should not repeat where sufficient alternatives exist');
  history.push(next);history=history.slice(-Math.min(10,count-1));
 }
 assert.equal(continuingGoldQuestionIndex(deck,119,count,seed),deck[119]);
}
// Different students produce different continuation sequences for a nontrivial set.
const deck=makeShuffleBag(30,120);
const a=Array.from({length:30},(_,i)=>continuingGoldQuestionIndex(deck,120+i,30,'A'));
const b=Array.from({length:30},(_,i)=>continuingGoldQuestionIndex(deck,120+i,30,'B'));
assert.notDeepEqual(a,b);
const host=readFileSync(new URL('../js/gold-host.js',import.meta.url),'utf8');
assert.match(host,/continuingGoldQuestionIndex\(deck,seq,questions\.length,/);
assert.ok(!host.includes("seq>=deck.length)return"),'no hard-coded 120 question stop');
console.log('Gold Quest unlimited question sequence and determinism: PASS');
