import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {GOLD_REWARD_TABLE,GOLD_REWARD_WEIGHT_TOTAL} from '../js/gold-core.js';

const file=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const host=file('js/gold-host.js');
const student=file('js/gold-student.js');
const room=file('rooms.html');
const src=host.slice(host.indexOf('function nextGoldJob('),host.indexOf('\nasync function pump(){'));
const now=Date.now();
const context={
  run:{roster:{a:'A',b:'B',c:'C',d:'D'}},
  states:{
    a:{phase:'question',nonce:'n1'},
    b:{phase:'treasure',nonce:'n2'},
    c:{phase:'target',nonce:'n3',targetDeadline:now+10000},
    d:{phase:'target',nonce:'n4',targetDeadline:now-1000}
  },
  answers:{a:{n1:{value:'1'}}},picks:{b:{n2:{choice:1}}},
  targets:{c:{n3:{targetUid:'a'}}},processingKeys:new Set(),offset:0,Date,Math,Object,Set,Map
};
vm.createContext(context);vm.runInContext(src+'\nthis.choose = nextGoldJob;',context);
const seen=new Set();
const first=context.choose(seen);assert.equal(first.uid,'c');assert.equal(first.priority,0);seen.add(first.key);
const second=context.choose(seen);assert.equal(second.uid,'d');assert.equal(second.priority,1);seen.add(second.key);
const third=context.choose(seen);assert.equal(third.uid,'b');seen.add(third.key);
const fourth=context.choose(seen);assert.equal(fourth.uid,'a');seen.add(fourth.key);
assert.equal(context.choose(seen),undefined);
// New selected target must preempt an answer after any awaited operation.
context.states.c.targetDeadline=now+30000;context.targets.c.n3={targetUid:'d'};
assert.equal(context.choose(new Set()).uid,'c');
assert.match(host,/function syncTargetSubscriptions\(/);
assert.match(host,/`v4\/targets\/\$\{roomCode\}\/\$\{uid\}\/\$\{nonce\}`/);
assert.doesNotMatch(host,/onValue\(ref\(db,`v4\/targets\/\$\{c\}`\)/);
assert.match(host,/function renderSettingsOdds\(/);
assert.match(room,/id="gold-odds-settings"/);
assert.doesNotMatch(room,/내 골드 10% 10% · 50% 5%/);
assert.match(room,/‘상대 골드 50% 빼앗기’는 남아/);
assert.equal(GOLD_REWARD_WEIGHT_TOTAL,2000);
assert(!GOLD_REWARD_TABLE.some(r=>r.type==='lose' && r.fraction===.5));
assert(GOLD_REWARD_TABLE.some(r=>r.type==='lose' && r.fraction===.3 && r.weight===60));
assert(GOLD_REWARD_TABLE.some(r=>r.type==='steal' && r.fraction===.5 && r.weight===100));
assert.match(student,/targetSentNonce===own\?\.nonce/);
assert.match(student,/requestAnimationFrame/);
assert.match(student,/const remaining=Math\.max\(0,Math\.ceil\(\(Number\(own\.targetDeadline/);
console.log('v4.11: target queue priority, focused listeners, target submission lock, dynamic odds and reward table: PASS');
