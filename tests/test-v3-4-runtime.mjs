import assert from 'node:assert/strict';
import {createArcadeUi} from '../js/arcade-ui.js';
class Element {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.attrs={};this.style={width:'',setProperty(){}};this.dataset={};this.value='';this.events={};
   const values=new Set();this.classList={add:c=>values.add(c),remove:c=>values.delete(c),toggle:(c,on)=>{on?values.add(c):values.delete(c)},contains:c=>values.has(c)};
 }
 append(...children){this.children.push(...children);children.forEach(x=>{x.parentElement=this});}
 replaceChildren(...children){this.children=[...children];}
 setAttribute(k,v){this.attrs[k]=v;}
 addEventListener(k,fn){this.events[k]=fn;}
 remove(){}
 querySelector(k){return this.parts?.[k]||null;}
 get offsetHeight(){return 10;}
}
let listeners={},timers=0, cleared=0;
const student=new Element('section'),studentHead=new Element('header'),studentInner=new Element('main');student.parts={'.quiz-stage-head':studentHead,'.quiz-stage-inner':studentInner};
const teacher=new Element('section'),teacherHead=new Element('header'),teacherInner=new Element('main');teacher.parts={'.quiz-stage-head':teacherHead,'.quiz-stage-inner':teacherInner};
const ids={'quiz-panel':student,'classic-focus':teacher};
globalThis.matchMedia=()=>({matches:true});
globalThis.window={};
globalThis.document={getElementById:id=>ids[id],createElement:tag=>new Element(tag),addEventListener:(k,fn)=>{listeners[k]=fn;},removeEventListener:k=>{delete listeners[k];}};
// Effects are enabled on a user gesture, but student music is never scheduled.
const s=createArcadeUi('quiz-panel',{role:'student'});
assert.equal(studentHead.children.length,1);
assert.equal(studentHead.children[0].className,'arcade-time-track');
assert.ok(listeners.pointerdown);
s.sync({state:'question',questionId:'r1'});s.updateTime(12,30);
assert.equal(studentHead.children[0].children[0].style.width,'40%');
s.sync({state:'reveal',questionId:'r1',grade:true});assert.equal(student.dataset.arcadePhase,'reveal');
s.sync({state:'question',questionId:'r2'});s.updateTime(3,30);
assert.equal(studentHead.children[0].children[0].style.width,'10%');
// Teacher can adjust BGM via a visible slider; no remote Firebase writes.
const t=createArcadeUi('classic-focus',{role:'teacher'});
assert.equal(teacherHead.children.length,2);
const settings=teacherHead.children[0],toggle=settings.children[0],label=settings.children[3],slider=label.children[1];
assert.equal(settings.children.length,5);
assert.equal(toggle.textContent,'🔇 BGM 켜기');
assert.equal(slider.type,'range');assert.equal(slider.value,'65');
slider.value='80';slider.events.input();assert.match(label.children[0].textContent,/80%/);
assert.equal(teacherHead.children[1].className,'arcade-time-track');
assert.ok(!teacherInner.children.find(x=>x.className==='arcade-audio-toggle'));
t.sync({state:'question',questionId:'r1'});t.updateTime(15,30);
assert.equal(teacherHead.children[1].children[0].style.width,'50%');
s.reset();t.reset();s.destroy();t.destroy();
console.log('v3.4 실제 표시 계층 런타임: 학생 음악 토글 없음/교사 음량 조절/시간·문제 상태 PASS');
