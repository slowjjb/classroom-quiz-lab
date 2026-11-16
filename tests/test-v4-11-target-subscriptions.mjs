import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/gold-host.js',import.meta.url),'utf8');
const begin=source.indexOf('function syncTargetSubscriptions(){');
const end=source.indexOf('\nfunction watch(){',begin);
const calls=[],unsubs=[];
const context={
  run:{targetMode:'choose'},states:{},targets:{},targetSubs:new Map(),code:'ABCD12',
  ref:(_db,path)=>path,db:{},formatError:e=>String(e),notify:()=>{},
  onValue:(path,cb)=>{calls.push({path,cb});return()=>{unsubs.push(path);};},
  pump:()=>Promise.resolve(),console,Map,Object
};
vm.createContext(context);vm.runInContext(source.slice(begin,end)+'\nthis.sync = syncTargetSubscriptions;',context);
context.states.u1={phase:'target',nonce:'n1'};
context.states.u2={phase:'question',nonce:'n2'};
context.sync();
assert.deepEqual(calls.map(x=>x.path),['v4/targets/ABCD12/u1/n1']);
calls[0].cb({exists:()=>true,val:()=>({targetUid:'u2'})});
assert.equal(context.targets.u1.n1.targetUid,'u2');
context.states.u1={phase:'question',nonce:'n4'};
context.states.u2={phase:'target',nonce:'n3'};
context.sync();
assert.deepEqual(unsubs,['v4/targets/ABCD12/u1/n1']);
assert.equal(context.targets.u1,undefined);
assert.deepEqual(calls.map(x=>x.path),['v4/targets/ABCD12/u1/n1','v4/targets/ABCD12/u2/n3']);
context.sync();assert.equal(calls.length,2);
context.run={targetMode:'random'};context.sync();
assert.equal(context.targetSubs.size,0);
assert.equal(unsubs.length,2);
console.log('v4.11: active-target narrow listeners, cleanup, and room mode fallback: PASS');
