import assert from 'node:assert/strict';
import fs from 'node:fs';
import { autoRevealAttendance } from '../js/classic-core.js';
import { normalizeQuestionImage,fullQuestionImageUrl } from '../js/image-utils.js';
import { questionToDraft,makeDraftRows,parseCSV,toCSV,validateRows } from '../js/csv.js';
import { makeRulesV3 } from '../js/rules-v3.js';

const base='https://slowjjb.github.io/classroom-quiz-lab/';
assert.equal(normalizeQuestionImage('도형 5.png',base),'images/questions/%EB%8F%84%ED%98%95%205.png');
assert.equal(normalizeQuestionImage('images/questions/sample.webp',base),'images/questions/sample.webp');
assert.equal(normalizeQuestionImage(base+'images/questions/sample.jpg',base),'images/questions/sample.jpg');
assert.equal(fullQuestionImageUrl('sample.jpg',base+'join.html'),base+'images/questions/sample.jpg');
for (const s of ['javascript:alert(1)','https://other.com/thing.png','images/questions/../secret.png','images/questions/evil.svg','images/questions/a.png?x=1','images/questions/%2Ffoo.png'])
  assert.throws(()=>normalizeQuestionImage(s,base),undefined,'Rejected: '+s);
const row=questionToDraft({number:1,prompt:'문제',options:['가','나','다','라'],timeLimit:30,type:'multiple_choice',correctIndex:1,imageUrl:'images/questions/sample.png'},0);
assert.equal(row.imageUrl,'images/questions/sample.png');
assert.equal(row.fields.length,10);
const fromCSV=makeDraftRows(parseCSV(toCSV([row])));
assert.equal(fromCSV[0].imageUrl,''); // 10열 블루킷 CSV 내보내기 호환 유지
assert.equal(validateRows(fromCSV).issues.length,0);
const roster={u1:'학생1',u2:'학생2',u3:'학생3'};
const members={u1:{connections:{a:1}},u2:{connections:{b:1}},u3:{connections:{}}};
let check=autoRevealAttendance(roster,members,{u1:{},u2:{}},{u1:{},u2:{}});
// Answers here must be actual non-empty objects; test realistic values.
check=autoRevealAttendance(roster,members,{u1:{value:'1'},u2:{value:'2'}},{u1:{correct:true},u2:{correct:false}});
assert.equal(check.complete,true);assert.equal(check.eligible,2);assert.equal(check.submitted,2);
assert.equal(autoRevealAttendance(roster,members,{u1:{value:'1'}},{u1:{correct:true}}).complete,false);
assert.equal(autoRevealAttendance(roster,members,{u1:{value:'1'},u2:{value:'2'}},{u1:{correct:true}}).complete,false);
assert.equal(autoRevealAttendance(roster,{}, {u1:{value:'1'}}, {u1:{correct:true}}).complete,false); // all offline
// 오프라인 학생이 이미 제출했으면 결과에서 제외하지 않습니다.
check=autoRevealAttendance(roster,members,{u1:{value:'1'},u2:{value:'2'},u3:{value:'3'}},{u1:{correct:true},u2:{correct:true},u3:{correct:false}});
assert.equal(check.eligible,3);assert.equal(check.complete,true);
const source=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const student=source('js/classic-student.js'),host=source('js/classic-host.js'),sets=source('js/sets.js');
const studentHtml=source('join.html'),hostHtml=source('rooms.html'),setHtml=source('sets.html'),css=source('styles.css');
const uniqueIds=(html)=>{const arr=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(arr).size,arr.length);return new Set(arr);};
for(const [js,html] of [[student,studentHtml],[host,hostHtml],[sets,setHtml]]){
 const ids=uniqueIds(html);
 for(const match of js.matchAll(/\$\('([\w-]+)'\)/g))assert.ok(ids.has(match[1])||match[1]==='quiz-typing',`Missing ${match[1]}`);
}
assert.match(student,/\$\('quiz-options'\)\.replaceChildren\(\)/);
assert.match(host,/autoRevealAttendance\(/);assert.match(host,/completeSince/);assert.match(host,/ms<=-350/);
assert.match(host,/imageUrl:q\.imageUrl\|\|''/);
assert.match(sets,/confirmImageLoss/);
assert.match(css,/--option-bg:#E6EEFF/);assert.match(css,/--option-bg:#F0EAFE/);
assert.match(css,/--option-bg:#FFF4D2/);assert.match(css,/--option-bg:#DFF5FF/);
assert.match(source('rooms.html'),/v3\.(2|3)/);
assert.match(source('join.html'),/v3\.(2|3)/);
assert.equal(JSON.parse(makeRulesV3('validTeacherUid123456')).rules['.read'],false);
assert.equal(fs.existsSync(new URL('../images/questions/v32-example-shape.png',import.meta.url)),true);
console.log('v3.2 이미지/블루킷 호환·자동 공개 조건·UI 바인딩·Firebase 규칙 회귀 검사: PASS');
