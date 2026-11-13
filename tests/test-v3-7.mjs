import assert from 'node:assert/strict';
import fs from 'node:fs';
const src = name => fs.readFileSync(new URL('../'+name, import.meta.url),'utf8');
const css=src('responsive-v3.6.css');
for (const html of ['join.html','rooms.html']) {
  assert.match(src(html),/responsive-v3\.(6|8|13)\.css\?v=3\.(7|8|11|13)/);
}
assert.match(css,/#quiz-panel\.arcade-enhanced #quiz-options:has\(#quiz-typing\)/);
assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
assert.match(css,/#quiz-panel\.arcade-enhanced #quiz-options #quiz-typing/);
assert.match(css,/grid-column:1 \/ -1/);
assert.match(css,/\.quiz-reveal-question-card:not\(:has\(#quiz-reveal-image-wrap:not\(\[hidden\]\)\)\) \.quiz-answer-spotlight/);
assert.match(css,/margin-block:auto/);
console.log('v3.7 주관식 가로폭·정답 중앙 배치·캐시 갱신: PASS');
