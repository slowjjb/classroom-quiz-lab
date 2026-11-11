import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildRoundReport } from '../js/classic-core.js';
const roster={a:'테스트학생1',b:'테스트학생2',c:'테스트학생3',d:'테스트학생4'};
const grades={a:{correct:true,points:850,responseMs:6700},b:{correct:false,points:0,responseMs:9500}};
const answers={a:{value:'1'},b:{value:'3'},c:{value:'2'}};
const cumulative={a:{name:'테스트학생1',score:1650,correct:2,totalMs:9000},b:{name:'테스트학생2',score:700,correct:1,totalMs:14000},c:{name:'테스트학생3',score:200,correct:0,totalMs:7000},d:{name:'테스트학생4',score:0,correct:0,totalMs:0}};
const report=buildRoundReport('q2',grades,answers,roster,cumulative);
assert.deepEqual([report.participantCount,report.submittedCount,report.gradedCount,report.correctCount],[4,3,2,1]);
assert.equal(report.entries.a.status,'correct');assert.equal(report.entries.a.points,850);
assert.equal(report.entries.a.responseMs,6700);assert.equal(report.entries.a.cumulative,1650);
assert.equal(report.entries.a.cumulativeRank,1);
assert.equal(report.entries.b.status,'wrong');
assert.equal(report.entries.c.status,'pending');
assert.equal(report.entries.d.status,'missing');
assert.equal('answer' in report.entries.a,false);
const read=(file)=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const student=read('js/classic-student.js'),host=read('js/classic-host.js');
const html=read('join.html'),teacher=read('rooms.html'),css=read('styles.css');
assert.match(host,/publicRound\.state!=='reveal'/);
assert.match(host,/v3\/public\/\$\{myCode\}\/roundResults/);
assert.match(host,/!\['reveal','finished'\]\.includes\(publicRound\?\.state\)/);
assert.match(host,/function renderFocus/);
assert.match(student,/quiz-show-results/);
assert.match(student,/quiz-results-view/);
assert.match(student,/Date\.now\(\)\+clockOffset/);
assert.match(html,/id="quiz-stage-error"/);
assert.match(html,/id="quiz-results-view"/);
assert.match(teacher,/id="classic-focus"/);
assert.match(css,/\.quiz-stage\[hidden\]/);
const ids=(page)=>[...page.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
for(const [file,source] of [['join.html',html],['rooms.html',teacher]]){
  const values=ids(source);assert.equal(new Set(values).size,values.length,file+' has duplicated element IDs');
}
for(const [module,source,sourceHtml] of [['student',student,html],['host',host,teacher]]){
  for(const match of source.matchAll(/\$\('([\w-]+)'\)/g)){
    assert.ok(ids(sourceHtml).includes(match[1]) || (module==='student' && match[1]==='quiz-typing'),`${module}: missing HTML element #${match[1]}`);
  }
}
console.log('v3.1 report computation, security gating, markup IDs, DOM bindings: PASS');
