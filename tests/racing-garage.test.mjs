import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCarRequest,normalizedRacingGarage} from '../js/racing-garage-core.js';
const alice='fakeuid00000000000000001',bob='fakeuid00000000000000002';
const claim=(carId,seq)=>({action:'claim',carId,seq});
const cancel=seq=>({action:'cancel',carId:'00',seq});
test('한 자동차는 두 학생이 동시에 선택할 수 없다',()=>{
 let g=applyCarRequest(null,alice,claim('01',1));
 assert.equal(g.slots['01'],alice);
 g=applyCarRequest(g,bob,claim('01',2));
 assert.equal(g.slots['01'],alice);
 assert.equal(g.byUid[bob],undefined);
 assert.equal(g.lastAction[bob].status,'already_taken');
});
test('한 학생은 취소 없이 두 대를 선택할 수 없다',()=>{
 let g=applyCarRequest(null,alice,claim('01',1));
 g=applyCarRequest(g,alice,claim('02',2));
 assert.equal(g.byUid[alice],'01');
 assert.equal(g.slots['02'],undefined);
 assert.equal(g.lastAction[alice].status,'cancel_first');
});
test('선택 취소 후 다른 학생이 그 차를 가져갈 수 있다',()=>{
 let g=applyCarRequest(null,alice,claim('01',1));
 g=applyCarRequest(g,alice,cancel(2));
 assert.equal(g.slots['01'],undefined);
 assert.equal(g.byUid[alice],undefined);
 g=applyCarRequest(g,bob,claim('01',3));
 assert.equal(g.slots['01'],bob);
});
test('재접속 같은 UID로 신청해도 원래 차 유지',()=>{
 let g=applyCarRequest(null,alice,claim('17',100));
 g=applyCarRequest(g,alice,claim('17',101));
 assert.equal(g.byUid[alice],'17');
 assert.equal(Object.values(g.slots).filter(uid=>uid===alice).length,1);
});
test('중복 처리된 요청은 트랜잭션을 중단한다',()=>{
 const g=applyCarRequest(null,alice,claim('17',100));
 assert.equal(applyCarRequest(g,alice,claim('17',100)),undefined);
 assert.equal(applyCarRequest(g,alice,claim('18',99)),undefined);
});
test('30종 전부 서로 다른 학생에게 배정 가능하고 31번째는 거부',()=>{
 let g=normalizedRacingGarage(null);
 for(let i=1;i<=30;i++){
  const uid='student_'+String(i).padStart(10,'0');
  g=applyCarRequest(g,uid,claim(String(i).padStart(2,'0'),i));
 }
 assert.equal(Object.keys(g.slots).length,30);
 assert.equal(new Set(Object.values(g.slots)).size,30);
 const fail=applyCarRequest(g,'student_0000000031',claim('01',31));
 assert.equal(fail.lastAction['student_0000000031'].status,'already_taken');
});
test('잘못된 번호와 UID는 반영하지 않는다',()=>{
 assert.equal(applyCarRequest(null,alice,claim('31',1)),undefined);
 assert.equal(applyCarRequest(null,'bad',claim('01',1)),undefined);
 assert.equal(applyCarRequest(null,alice,claim('0',1)),undefined);
});
test('순수 함수는 이전 레지스트리를 변경하지 않는다',()=>{
 const before=applyCarRequest(null,alice,claim('01',1));
 const snapshot=JSON.stringify(before);
 applyCarRequest(before,bob,claim('02',2));
 assert.equal(JSON.stringify(before),snapshot);
});
