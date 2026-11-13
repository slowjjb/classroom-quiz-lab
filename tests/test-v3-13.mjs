import assert from 'node:assert/strict';
import fs from 'node:fs';
import { percent, accuracyTier, buildClassAccuracy } from '../js/classic-analytics.js';
const read=(p)=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const questions=[{number:3,prompt:'첫째 문제'},{number:7,prompt:'둘째 문제'},{number:9,prompt:'셋째 문제'},{number:13,prompt:'넷째 문제'}];
const roster={s1:'학생 1',s2:'학생 2',s3:'학생 3',s4:'학생 4'};
const grades={q1:{s1:{correct:true},s2:{correct:true},s3:{correct:false},s4:{correct:true}},
 q2:{s1:{correct:true},s2:{correct:false},s3:{correct:false},s4:{correct:true}},
 q3:{s1:{correct:true},s2:{correct:false},s3:{correct:false},s4:{correct:false}},
 q4:{s1:{correct:false},s2:{correct:false},s3:{correct:false}}};
assert.equal(percent(3,4),75);assert.equal(percent(2,4),50);assert.equal(percent(0,0),null);
assert.equal(accuracyTier(75),'high');assert.equal(accuracyTier(74),'mid');
assert.equal(accuracyTier(51),'mid');assert.equal(accuracyTier(50),'low');assert.equal(accuracyTier(null),'none');
let result=buildClassAccuracy({grades,roster,questions,completedCount:4});
const byName=Object.fromEntries(result.participants.map(x=>[x.uid,x]));
assert.equal(byName.s1.rate,75);assert.equal(byName.s2.rate,25);assert.equal(byName.s3.rate,0);
assert.equal(byName.s4.rate,50);assert.equal(byName.s4.answered,3);assert.equal(byName.s4.total,4);
assert.equal(result.questions[0].rate,75);assert.equal(result.questions[1].rate,50);
assert.equal(result.questions[2].rate,25);assert.equal(result.questions[3].rate,0);
assert.equal(result.questions[0].originalNumber,3);assert.equal(result.participantCount,4);
result=buildClassAccuracy({grades,roster,questions,completedCount:2});
assert.equal(result.questions.length,2);assert.equal(result.participants[0].total,2);
const host=read('js/classic-host.js'),ui=read('js/arcade-ui.js'),html=read('rooms.html'),css=read('arcade.css')+read('responsive-v3.6.css');
for(const id of ['classic-focus-answer-spotlight','classic-focus-answer-big','classic-focus-answer-rate','classic-focus-total-list','classic-focus-student-accuracy','classic-focus-question-accuracy','classic-focus-fanfare','classic-focus-hide-names']){
 assert.match(html,new RegExp('id="'+id+'"'));
}
assert.match(host,/renderAnalytics\(/);assert.match(host,/buildClassAccuracy/);assert.match(host,/arcade\.fanfare\(\)/);
assert.match(ui,/name==='fanfare'/);assert.match(ui,/effectsArmed/);assert.match(ui,/armEffects/);
assert.match(css,/teacher-analytics-grid/);assert.match(css,/teacher-answer-spotlight/);
assert.match(html,/classic-host\.js\?v=3\.(13|14)/);
console.log('v3.13 accuracy thresholds, absent answer, visual IDs, audio controls: PASS');
