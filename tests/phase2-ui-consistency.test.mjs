import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Fishing automatically enters full teacher dashboard on start',()=>{
 const host=src('js/fishing-host.js');
 const start=host.slice(host.indexOf('async function start(){'),host.indexOf('async function toggleGamePause(){'));
 assert.match(start,/await update\(ref\(db\),patches\);\s*focus\(true\)/);
});
test('Fishing dashboard can pause, resume, end, and export without returning to administration',()=>{
 const html=src('rooms.html'),host=src('js/fishing-host.js');
 for(const id of ['fishing-focus-pause','fishing-focus-end','fishing-focus-export']){
  assert.match(html,new RegExp('id="'+id+'"'));
  assert.ok(host.includes("$('"+id+"').addEventListener"));
  assert.ok(host.includes("$('"+id+"').disabled"));
 }
});
test('Racing full-screen dashboard has live pause, resume and end controls',()=>{
 const html=src('rooms.html'),host=src('js/racing-host-game.js');
 for(const id of ['racing-play-focus-pause','racing-play-focus-end']){
  assert.match(html,new RegExp('id="'+id+'"'));
  assert.ok(host.includes("$('"+id+"').addEventListener"));
  assert.ok(host.includes("$('"+id+"').disabled"));
 }
 assert.match(src('racing-lobby.css'),/\.racing-play-focus \.racing-control-actions/);
});
test('Racing answer choices select only; explicit submit sends answers',()=>{
 const html=src('join.html'),student=src('js/racing-student-game.js');
 assert.match(html,/id="racing-student-submit"/);
 assert.doesNotMatch(html,/id="racing-student-typing-submit"/);
 assert.match(student,/b\.onclick=\(\)=>selectAnswer\(String\(i\+1\)\)/);
 assert.match(student,/selectedAnswer=choice/);
 assert.match(student,/racing-answer-selected/);
 assert.match(student,/racing-student-submit'\)\.onclick=\(\)=>void submitAnswer/);
 assert.match(student,/content\.dataset\.nonce=marker;submitting=false;selectedAnswer='';submittedNonce=''/);
 assert.doesNotMatch(student,/b\.onclick=\(\)=>void submitAnswer/);
 assert.doesNotMatch(student,/racing-student-typing-submit/);
});
