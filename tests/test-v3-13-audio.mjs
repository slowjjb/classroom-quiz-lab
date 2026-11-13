import assert from 'node:assert/strict';
import {createArcadeUi} from '../js/arcade-ui.js';
let played=0;
class Node {connect(){} }
class Gain extends Node {constructor(){super();this.gain={value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},setTargetAtTime(){}};} }
class Osc extends Node {constructor(){super();this.frequency={setValueAtTime(){}};}start(){played++;}stop(){} }
class AudioContext {constructor(){this.currentTime=10;this.destination=new Node();}createOscillator(){return new Osc();}createGain(){return new Gain();}async resume(){} }
class E {
 constructor(tag='div'){this.children=[];this.attrs={};this.style={width:'',setProperty(){}};this.dataset={};this.value='';this.events={};this.classList={add(){},remove(){},toggle(){}};}
 append(...items){items.forEach(x=>x.parentElement=this);this.children.push(...items);}
 setAttribute(k,v){this.attrs[k]=v;}
 addEventListener(k,f){this.events[k]=f;}
 remove(){}
 querySelector(sel){return this.parts?.[sel]||null;}
 get offsetHeight(){return 10;}
}
const stage=new E(),head=new E(),inner=new E();stage.parts={'.quiz-stage-head':head,'.quiz-stage-inner':inner};
globalThis.matchMedia=()=>({matches:true});
globalThis.window={AudioContext};
globalThis.document={getElementById:id=>id==='classic-focus'?stage:null,createElement:()=>new E(),addEventListener(){},removeEventListener(){}};
const ui=createArcadeUi('classic-focus',{role:'teacher'});
await ui.armEffects();
ui.sync({state:'question',questionId:'q1'});
const before=played;
ui.sync({state:'finished',questionId:'q1'});
assert.ok(played>=before+16,'빵빠레는 시작 효과음보다 충분히 길어야 합니다');
const endCount=played;
await ui.fanfare();
assert.ok(played>endCount,'클릭하면 BGM 없이도 빵빠레 재생');
ui.destroy();
console.log('v3.13 교사 클릭 효과음 활성화, BGM 별도, 완료 시 빵빠레 및 재생 버튼 함수: PASS');
