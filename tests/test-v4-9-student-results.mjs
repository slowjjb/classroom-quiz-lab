import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildGoldAccuracy,makeGoldPublicLearningResults} from '../js/gold-analytics.js';
const file=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const fixture={
 roster:{s1:'가람',s2:'나은',s3:'다영',s4:'라온'},
 questions:[{number:1,prompt:'문제 1'},{number:2,prompt:'문제 2'},{number:3,prompt:'미응답 문항'}],
 scores:{s1:{name:'가람',gold:1},s2:{name:'나은',gold:999},s3:{name:'다영',gold:77},s4:{name:'라온',gold:1000}},
 answersLog:{s1:{a0_A:{questionIndex:0,correct:true,value:'1',at:1},a1_B:{questionIndex:1,correct:true,value:'1',at:2},a3_C:{questionIndex:0,correct:false,value:'2',at:4}},s2:{a0_D:{questionIndex:0,correct:false,value:'2',at:1}},s3:{a0_E:{questionIndex:0,correct:true,value:'1',at:2},a1_F:{questionIndex:1,correct:false,value:'1',at:3}}}
};
const first=buildGoldAccuracy({...fixture,mode:'first'});
assert.deepEqual(first.students.map(x=>x.uid),['s1','s3','s2','s4'],'students descending; no-attempt last');
assert.deepEqual(first.students.map(x=>x.rate),[100,50,0,null]);
const all=buildGoldAccuracy({...fixture,mode:'all'});
assert.deepEqual(all.students.map(x=>x.rate),[67,50,0,null]);
const published=makeGoldPublicLearningResults(fixture);
assert.equal(published.version,1);
assert.equal(published.first.questions[0].rate,67);
assert.equal(published.first.questions[2].rate,null,'unattempted question is not 0%');
assert.equal(published.all.questions[0].rate,50);
assert.equal(published.first.summary.total,5);
assert.equal(published.all.summary.total,6);
assert.deepEqual(published.first.students.map(x=>x.uid),['s1','s3','s2','s4']);
const json=JSON.stringify(published);
assert.ok(!json.includes('a0_A')&&!json.includes('"value"')&&!json.includes('"correctIndex"'), 'must not publish answer logs or keys');
assert.match(file('js/gold-host.js'),/learningResults,state:'finished'/,'learning results must be committed together with finished state');
assert.match(file('js/gold-host.js'),/get\(ref\(db,`v4\/privateRuns\/\$\{code\}\/answersLog`\)\)/,'host must fetch latest answer log');
assert.match(file('js/gold-student.js'),/renderStudentStudy\(\)/);
for(const id of ['gold-student-study-mode','gold-student-study-students','gold-student-study-questions','gold-student-study-summary'])assert.ok(file('join.html').includes(`id="${id}"`),id);
assert.match(file('js/gold-student.js'),/rate==null\?1:b\.rate==null\?-1:Number\(b\.rate\)-Number\(a\.rate\)/,'student visual sort desc');
assert.match(file('js/gold-analytics.js'),/b\.rate-a\.rate/,'teacher sort desc');
assert.match(file('js/rules-v4.js'),/public:\{'\$code':/,'existing public rule available');
console.log('v4.9 student/teacher analytics, first/all, no-attempt, safe public summary: PASS');
