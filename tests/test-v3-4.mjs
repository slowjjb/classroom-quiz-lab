import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const get=f=>fs.readFileSync(new URL(f,root),'utf8');
const join=get('join.html'),rooms=get('rooms.html'),idx=get('index.html'),sets=get('sets.html'),layout=get('responsive-v3.4.css'),audio=get('js/arcade-ui.js');
for(const html of [join,rooms,idx]){
 assert.match(html,/v3\.(4|5|6|7|8)/);
 assert.match(html,/styles\.css\?v=3\.(4|6|8)/);
 assert.match(html,/arcade\.css\?v=3\.(4|6|8)/);
}
assert.match(sets,/v3\.(4|5|6|7|8)/);
assert.match(sets,/styles\.css\?v=3\.(4|6|8)/);
assert.match(sets,/js\/sets\.js\?v=3\.(4|8)/);
for(const html of [join,rooms]){
 assert.match(html,/responsive-v3\.(4|5|6|7|8)\.css\?v=3\.(4|5|6|7|8)/);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length);
}
assert.match(join,/<div class="join-layout">/);
assert.match(join,/<div class="join-entry-column">/);
assert.match(join,/<section id="student-room"/);
assert.match(layout,/\.join-layout:has\(#student-room:not\(\[hidden\]\)\)/);
assert.match(layout,/grid-template-columns:repeat\(auto-fill,minmax\(145px,1fr\)\)/);
assert.match(layout,/#quiz-panel\.arcade-enhanced \.quiz-stage-inner/);
assert.match(layout,/#classic-focus\.arcade-enhanced \.quiz-stage-inner/);
assert.match(layout,/@media\(min-width:760px\) and \(min-height:540px\)/);
assert.match(layout,/@media\(max-width:759\.98px\), \(max-height:539\.98px\)/);
assert.match(layout,/max-height:min\(29dvh,265px\)/);
assert.match(audio,/if\(role==='student'\)/);
assert.match(audio,/document\.addEventListener\('pointerdown',activateStudentSound/);
assert.match(audio,/if\(role==='teacher'&&enabled\)audio\.startMusic\(\)/);
assert.match(audio,/volumeControl\.type='range'/);
assert.match(audio,/setMusicVolume\(value\)/);
assert.match(audio,/this\.musicLevel=\.009\*percent/);
assert.doesNotMatch(audio,/firebasejs|fetch\(|XMLHttpRequest/);
assert.match(get('js/join.js'),/classic-student\.js\?v=3\.(4|6|8)/);
assert.match(get('js/classic-student.js'),/arcade-ui\.js\?v=3\.(4|8)/);
assert.match(get('js/classic-host.js'),/arcade-ui\.js\?v=3\.(4|8)/);
assert.match(rooms,/js\/classic-host\.js\?v=3\.(4|8)/);
assert.match(join,/js\/join\.js\?v=3\.(4|6|8)/);
assert.doesNotMatch(get('js/classic-student.js'),/set\(ref\(db,`v3\/grades/);
assert.ok(fs.existsSync(new URL('images/questions/v32-example-shape.png',root)));
console.log('v3.4 가로/세로 레이아웃, BGM 교사 전용, 학생 FX, 버전·DOM·보안 분리: PASS');
