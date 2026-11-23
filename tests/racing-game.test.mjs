import test from 'node:test';
import assert from 'node:assert/strict';
import {racingScore,scoreRacingAnswer,racingStandings,chooseRacingReward,RACING_REWARDS} from '../js/racing-game-core.js';
const answer=(score,correct,nonce,reward=RACING_REWARDS[0])=>scoreRacingAnswer(score,{correct,nonce,finishMeters:20,reward,at:1234});
test('정답을 맞히면 1m 전진하고 오답은 이동하지 않음',()=>{
 let score=racingScore('학생01','01');
 score=answer(score,true,'q1');assert.equal(score.meters,1);
 score=answer(score,false,'q2');assert.equal(score.meters,1);
 assert.equal(score.answered,2);assert.equal(score.correct,1);
});
test('같은 nonce는 중복 채점하지 않음',()=>{
 const saved=answer(racingScore('학생01','01'),true,'q1');
 assert.equal(answer(saved,true,'q1'),null);
});
test('정답 3회마다 자동 룰렛 보너스',()=>{
 let s=racingScore('학생01','01');
 s=answer(s,true,'q1');s=answer(s,true,'q2');
 assert.equal(s.meters,2);assert.equal(s.lastResult.spin,false);
 s=answer(s,true,'q3',RACING_REWARDS[1]);
 assert.equal(s.meters,5);assert.equal(s.lastResult.spin,true);assert.equal(s.lastResult.bonus,2);
});
test('마이너스 보상은 거리를 0 아래로 만들 수 없음',()=>{
 let s=racingScore('학생01','01');
 s={...s,correct:2,meters:0};
 s=answer(s,true,'q3',RACING_REWARDS[4]);
 assert.equal(s.meters,0);
});
test('결승선 20m 상한 및 도착 시각 기록',()=>{
 const start={...racingScore('학생01','01'),meters:19,correct:1};
 const done=answer(start,true,'q1');
 assert.equal(done.meters,20);assert.equal(done.finishedAt,1234);
});
test('동점은 정답 수와 결승선 도착순으로 정렬',()=>{
 const rank=racingStandings({a:{name:'가',meters:10,correct:3},b:{name:'나',meters:11,correct:0},c:{name:'다',meters:10,correct:4}});
 assert.deepEqual(rank.map(x=>x.uid),['b','c','a']);
});
test('룰렛 확률 경계값도 유효한 보상 중 하나',()=>{
 const ids=new Set(RACING_REWARDS.map(x=>x.id));
 assert(ids.has(chooseRacingReward(()=>0).id));assert(ids.has(chooseRacingReward(()=>.999999).id));
});
