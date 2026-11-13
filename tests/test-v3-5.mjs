import assert from 'node:assert/strict';
import fs from 'node:fs';
const text=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
const css=text('responsive-v3.5.css');
for(const f of ['join.html','rooms.html']){
 const html=text(f);
 assert.match(html,/responsive-v3\.(5|6)\.css\?v=3\.(5|6|7|8|11|12|13)/);
 assert.match(html,/v3\.(5|6|7|8|11|12|13)/);
 assert.doesNotMatch(html,/firebase-config\.js\?v=3\.5/);
}
for(const pattern of [
 /\.join-layout:has\(#student-room:not\(\[hidden\]\)\)/,
 /\.join-entry-column \.student-panel/,
 /overflow-y: auto/,
 /#quiz-panel\.arcade-enhanced \.quiz-stage-inner/,
 /#quiz-panel\.arcade-enhanced #quiz-reveal-view #quiz-show-results/,
 /margin-top: auto/,
 /#classic-focus\.arcade-enhanced \.quiz-focus-controls/,
 /justify-content: flex-start/,
 /#classic-focus\.arcade-enhanced #classic-focus-question-view \.quiz-question-card/,
 /grid-row: 1 \/ span 2/
])assert.match(css,pattern);
assert.doesNotMatch(css,/firebase|revealAll|saveScores|onValue\(/);
console.log('v3.5 좌우 높이 정렬·입장 인원 스크롤·로직 분리 스타일 검사: PASS');
