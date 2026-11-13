import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=(name)=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const join=source('join.html'),styles=source('styles.css'),arcade=source('arcade.css');
const layout=source('responsive-v3.6.css'),student=source('js/classic-student.js');
for(const id of ['quiz-correct-answer-big','quiz-my-choice-summary','quiz-reveal-question','quiz-round-points','quiz-my-score','quiz-show-results','quiz-reveal-image-wrap']){
 assert.match(join,new RegExp(`id="${id}"`),id);
}
assert.match(join,/responsive-v3\.(6|8)\.css\?v=3\.(6|7|8|9|11|12|13|14)/);
assert.match(join,/js\/join\.js\?v=3\.(6|8|11|12|13|14)/);
assert.match(source('js/join.js'),/classic-student\.js\?v=3\.(6|8|14)/);
assert.match(styles,/quiz-large-option:has\(input:checked\)::after/);
assert.match(styles,/quiz-answer-spotlight/);
assert.match(layout,/#quiz-panel\.arcade-enhanced #quiz-reveal-view \.quiz-reveal-question-card/);
assert.match(layout,/#quiz-panel\.arcade-enhanced #quiz-reveal-view \.quiz-reveal-question-card:has\(#quiz-reveal-image-wrap:not\(\[hidden\]\)\)/);
assert.match(layout,/grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
assert.match(arcade,/\.arcade-enhanced \.quiz-answer-spotlight/);
assert.match(student,/\$\('quiz-correct-answer-big'\)\.textContent=correctDisplay/);
assert.match(student,/\$\('quiz-my-choice-summary'\)\.textContent=ownAnswer/);
assert.match(student,/answer\.hidden=round\?\.type!=='typing'/);
assert.match(student,/\$\('quiz-my-score'\)\.textContent/);
assert.doesNotMatch(student,/set\(ref\(db,`v3\/grades/);
for(const name of ['index.html','rooms.html','sets.html','join.html'])assert.match(source(name),/v3\.(6|7|8|9|11|12|13|14)/);
assert.match(source('js/classic-core.js'),/export function gradeAnswer\(/);
assert.match(source('js/classic-host.js'),/gradeAnswer\(q,s\.value,s\.at,timing\.startedAt,timing\.deadline\)/);
console.log('v3.6 결과 카드/정답 강조/선택 강조/제출 버튼/가로 화면/채점 로직 보존: PASS');
