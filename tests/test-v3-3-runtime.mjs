import assert from 'node:assert/strict';
import { createArcadeUi, renderPodium } from '../js/arcade-ui.js';
class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.style={props:{},setProperty(k,v){this.props[k]=v;}};this.classList={values:new Set(),add:(n)=>this.classList.values.add(n),remove:(n)=>this.classList.values.delete(n),toggle:(n,x)=>{if(x===undefined)x=!this.classList.values.has(n);x?this.classList.values.add(n):this.classList.values.delete(n);}};this.hidden=false;this.disabled=false;this.textContent='';}
 append(...args){this.children.push(...args);}replaceChildren(...args){this.children=[...args];}setAttribute(k,v){this.attributes[k]=v;}
 addEventListener(type,fn){(this.events||={})[type]=fn;}
 insertAdjacentElement(where,element){this.children.push(element);}
 remove(){}
 querySelector(sel){return this.parts?.[sel]||null;}
 get offsetHeight(){return 10;}
}
const head=new Element('header');const inner=new Element('main');const stage=new Element('section');stage.parts={'.quiz-stage-head':head,'.quiz-stage-inner':inner};
globalThis.window={};globalThis.matchMedia=()=>({matches:true});
globalThis.document={getElementById:(id)=>({'quiz-panel':stage})[id],createElement:(tag)=>new Element(tag)};
const ui=createArcadeUi('quiz-panel',{role:'student'});
assert.ok(stage.classList.values.has('arcade-enhanced'));
assert.equal(head.children.length,2); // audio toggle and timer bar
assert.equal(head.children[0].textContent,'🔇 소리 켜기');
assert.equal(head.children[0].attributes['aria-pressed'],'false');
ui.sync({state:'question',questionId:'q1'});
ui.updateTime(15,30);
assert.equal(head.children[1].children[0].style.width,'50%');
ui.sync({state:'reveal',questionId:'q1',grade:true});
assert.equal(stage.dataset.arcadePhase,'reveal');
ui.sync({state:'question',questionId:'q2'});
assert.equal(stage.dataset.arcadePhase,'question');
ui.updateTime(3,30);
assert.equal(head.children[1].children[0].style.width,'10%');
ui.sync({state:'finished',questionId:'q2'});
assert.equal(stage.dataset.arcadePhase,'finished');
ui.reset();assert.equal(stage.dataset.arcadePhase,'');
ui.sync({state:'question',questionId:'q1'});assert.equal(stage.dataset.arcadePhase,'question');
const result=new Element();renderPodium(result,[{name:'A',score:700},{name:'B',score:600},{name:'C',score:500}]);
assert.equal(result.children.length,1);assert.equal(result.children[0].children.length,3);
assert.equal(result.children[0].children[1].children[1].textContent,'A');
assert.equal(result.children[0].children[1].children[2].textContent,'700점');
console.log('v3.3 arcade UI phase/timer/medal sound opt-in runtime: PASS');
