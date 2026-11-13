import assert from 'node:assert/strict';
import fs from 'node:fs';
const text=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
for(const file of ['join.html','rooms.html','index.html']){
 const html=text(file);
 assert.match(html,/arcade\.css\?v=3\.(3|4|6|8|11|12|13|14)/);
 assert.match(html,/(?:v3\.(3|4|5|6|7|8|9|11|12|13|14)|v4\.[012])/);
 assert.match(html,/class="arcade-theme"/);
}
assert.match(text('js/join.js'),/classic-student\.js\?v=3\.(4|6|8|13|14)/);
assert.match(text('rooms.html'),/js\/classic-host\.js\?v=(?:3\.(4|8|11|12|13|14)|4\.0)/);
assert.match(text('js/classic-student.js'),/createArcadeUi\('quiz-panel'/);
assert.match(text('js/classic-host.js'),/createArcadeUi\('classic-focus'/);
assert.match(text('js/classic-student.js'),/arcade\.updateTime/);
assert.match(text('js/classic-host.js'),/arcade\.updateTime/);
assert.match(text('js/classic-student.js'),/renderPodium/);
assert.match(text('js/classic-host.js'),/renderPodium/);
assert.match(text('arcade.css'),/prefers-reduced-motion/);
assert.match(text('arcade.css'),/arcade-time-fill/);
const audio=text('js/arcade-ui.js');
assert.match(audio,/window\.AudioContext\|\|window\.webkitAudioContext/);
assert.match(audio,/async enable\(\)/);
assert.match(audio,/toggle\.addEventListener\('click'/);
assert.match(audio,/this\.on=false/);
assert.match(audio,/function sync/);
assert.match(audio,/questionId/);
assert.match(audio,/correct/);
assert.match(audio,/finish/);
assert.match(audio,/renderPodium/);
assert.doesNotMatch(audio,/firebasejs|firebase-database|firebase-auth|fetch\(|XMLHttpRequest/);
assert.doesNotMatch(text('js/classic-student.js'),/set\(ref\(db,`v3\/grades/);
assert.doesNotMatch(text('arcade.css'),/\.is-correct\s*\{[^}]*#2A55CA/);
assert.ok(fs.existsSync(new URL('../images/questions/v32-example-shape.png',import.meta.url)));
// markup IDs are unique in student and teacher and expected new podiums exist.
for(const file of ['join.html','rooms.html']){
 const arr=[...text(file).matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(arr).size,arr.length,`duplicate ids in ${file}`);
}
assert.match(text('join.html'),/id="quiz-final-podium"/);
assert.match(text('rooms.html'),/id="classic-focus-podium"/);
console.log('v3.3 UI·오리지널 사운드·캐시 버전·DOM·기존 데이터 분리 정적 검사: PASS');
