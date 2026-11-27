import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gameIsPaused,gameRemainingSeconds} from '../js/game-pause.js';
import {chooseReviewQuestions} from '../js/review-set.js';
import {reviewQuestionWarnings} from '../js/csv.js';
const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('pause freezes countdown and resumes without changing original deadline semantics',()=>{
 const pub={state:'playing',endsAt:200000,pauseStartedAt:170000};
 assert.equal(gameIsPaused(pub),true);
 assert.equal(gameRemainingSeconds(pub,180000),30);
 assert.equal(gameRemainingSeconds({...pub,pauseStartedAt:undefined,endsAt:235000},205000),30);
 assert.equal(gameIsPaused({state:'finished',pauseStartedAt:100}),false);
});
test('every individual game supports teacher toggle and student pause/submission guard',()=>{
 const html=src('rooms.html');
 for(const mode of ['gold','fishing','racing']){
  const host=src('js/'+mode+(mode==='racing'?'-host-game':'-host')+'.js');
  const student=src('js/'+mode+(mode==='racing'?'-student-game':'-student')+'.js');
  const id=mode==='racing'?'racing-play-pause':mode+'-pause';
  assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(host,/async function toggleGamePause\(\)/);
  assert.match(host,/pauseStartedAt/);
  assert.match(student,/renderStudentPause/);
  assert.match(student,/gameIsPaused\(pub\)/);
 }
 assert.ok(html.includes('id="gold-focus-pause"'));
});
test('review builder excludes unattempted questions and preserves question images',()=>{
 const questions=[
  {number:1,prompt:'A',type:'multiple_choice',correctIndex:2,options:['a','b','c','d'],imageUrl:'images/questions/a.png',timeLimit:30},
  {number:2,prompt:'B',type:'multiple_choice',correctIndex:1,options:['a','b','c','d'],timeLimit:30},
  {number:3,prompt:'C',type:'typing',correctIndex:0,options:['정답','','',''],timeLimit:45}
 ];
 const run={questions,roster:{alice:'Alice'},answersLog:{alice:{a0_aaaa:{questionIndex:0,questionNumber:1,correct:false,at:1000},a1_bbbb:{questionIndex:1,questionNumber:2,correct:true,at:1001}}}};
 const chosen=chooseReviewQuestions({mode:'gold',run,threshold:60});
 assert.equal(chosen.length,1);
 assert.equal(chosen[0].prompt,'A');
 assert.equal(chosen[0].number,1);
 assert.equal(chosen[0].correctIndex,2);
 assert.equal(chosen[0].imageUrl,'images/questions/a.png');
 assert.equal(chooseReviewQuestions({mode:'racing',run,threshold:60}).length,1);
 const classic={questions,roster:{alice:'Alice'}};
 assert.equal(chooseReviewQuestions({mode:'classic',run:classic,grades:{q1:{alice:{correct:false}},q2:{alice:{correct:true}}},threshold:60}).length,1);
});
test('nonblocking semantic lint flags repeated options, restrictive only and short-answer aliases',()=>{
 const row=(line,prompt,opts,correct,type='')=>({line,fields:[String(line),prompt,...opts,'30',correct,'',type]});
 const rows=[
  row(1,'도자기는?', ['분청사기와 백자','청자만','철제 갑옷','청자만'],'1'),
  row(2,'도자기는?', ['분청사기와 백자','청자','철제 갑옷','유리잔'],'1'),
  row(3,'조선의 문자', ['훈민정음','','',''],'','typing')
 ];
 const warnings=reviewQuestionWarnings(rows);
 assert.ok(warnings.some(w=>w.message.includes('동일하거나')));
 assert.ok(warnings.some(w=>w.message.includes('제한적')));
 assert.ok(warnings.some(w=>w.message.includes('질문 내용이 동일')));
 assert.ok(warnings.some(w=>w.message.includes('허용 정답')));
});
