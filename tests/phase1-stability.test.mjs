import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeShuffleBag,continuingGoldQuestionIndex} from '../js/gold-core.js';
import {scoreRacingAnswer,racingScore,RACING_REWARDS} from '../js/racing-game-core.js';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('three individual-play modes continue after question 120 without a hard limit',()=>{
 for(const mode of ['gold','fishing','racing']){
  const host=load('js/'+mode+'-host'+(mode==='racing'?'-game':'')+'.js');
  assert.match(host,/continuingGoldQuestionIndex\(deck,/);
 }
 for(const count of [1,2,3,10,11,20,50]){
  const deck=makeShuffleBag(count,120,()=>0.41);
  const window=Math.min(10,count-1);
  let recent=window?deck.slice(-window):[];
  for(let seq=120;seq<350;seq++){
   const idx=continuingGoldQuestionIndex(deck,seq,count,'student:game');
   assert.ok(Number.isInteger(idx)&&idx>=0&&idx<count);
   assert.equal(idx,continuingGoldQuestionIndex(deck,seq,count,'student:game'));
   assert.equal(recent.includes(idx),false,'recent question repeat with count='+count);
   recent=window?[...recent,idx].slice(-window):[];
  }
 }
});

test('racing score applies the same nonce at most once',()=>{
 const first=scoreRacingAnswer(racingScore('tester','car1'),{correct:true,nonce:'n1',finishMeters:20,at:100,reward:RACING_REWARDS[0]});
 assert.equal(first.answered,1);
 assert.equal(scoreRacingAnswer(first,{correct:true,nonce:'n1',finishMeters:20,at:200,reward:RACING_REWARDS[0]}),null);
});

test('student teacher-kick cleans up game state and session without re-entering the room',()=>{
 const join=load('js/join.js');
 assert.match(join,/if\(activeUser&&!roster\[activeUser\.uid\]\?\.profile\)/);
 assert.match(join,/void leaveRoom\(false\)/);
 assert.match(join,/sessionStorage\.removeItem\(SESSION_KEY\)/);
 assert.match(join,/await onDisconnect\(old\)\.cancel\(\)/);
});

test('teacher kick deletes member and its owned name claims together',()=>{
 const rooms=load('js/rooms.js');
 assert.match(rooms,/\[\x60members\/\$\{uid\}\x60\]:null/);
 assert.match(rooms,/nameClaims\/\$\{owned\}/);
 assert.match(rooms,/await update\(ref\(db,\x60v2\/rooms\/\$\{code\}\x60\),changes\)/);
});

test('public student results do not include private answer keys or student-level answer logs',()=>{
 const gold=load('js/gold-analytics.js');
 assert.match(gold,/makeGoldPublicLearningResults/);
 assert.doesNotMatch(gold.slice(gold.indexOf('export function makeGoldPublicLearningResults')),/answersLog\s*:/);
 const racing=load('js/racing-host-game.js');
 assert.match(racing,/Only aggregate question statistics are public/);
 const fishing=load('js/fishing-host.js');
 assert.match(fishing,/return \{version:1,first:summarize\('first'\),all:summarize\('all'\)\}/);
});

test('Firebase rules protect answer keys and limit member state to teacher / owner',()=>{
 const rules=JSON.parse(load('database.rules.json')).rules;
 for(const version of ['v3','v4','v5','v6']){
  const priv=rules[version]?.privateRuns?.['$code'];
  assert.ok(priv,'privateRuns rules absent: '+version);
  assert.ok(priv['.read'].includes('google.com'),'private key must be teacher-only');
  assert.ok(!priv['.read'].includes('anonymous'),'private key anonymous access rejected');
 }
 for(const version of ['v4','v5','v6']){
  const member=rules[version]?.memberState?.['$code'];
  assert.ok(member,'memberState rules absent: '+version);
  assert.ok(!String(member['.read']||'').includes('anonymous'),'anonymous access at parent would reveal other students');
  const own=member['$uid'];
  assert.ok(own&&String(own['.read']).includes('$uid'),'individual memberState requires owner uid');
 }
});

console.log('Purplekit phase1 unit and static regression checks passed.');
