import assert from 'node:assert/strict';
import {createArcadeUi,CALM_TRACKS,chooseNextCalmTrack} from '../js/arcade-ui.js';

assert.equal(CALM_TRACKS.length,3);
assert.equal(new Set(CALM_TRACKS.map(t=>t.id)).size,3);
for(const t of CALM_TRACKS){
  assert.ok(t.melody.length>=24, `${t.id}: melody length`);
  assert.ok(t.bass.length>=4, `${t.id}: bass length`);
  assert.ok(t.chords.length>=3, `${t.id}: chords length`);
}
for(const t of CALM_TRACKS){
  assert.notEqual(chooseNextCalmTrack(t.id,()=>0),t.id);
  assert.notEqual(chooseNextCalmTrack(t.id,()=>.999),t.id);
}
class Node{connect(){}}
class Gain extends Node{constructor(){super();this.gain={value:0,cancelScheduledValues(){},setTargetAtTime(v){this.value=v;},setValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;}};}}
class Comp extends Node{constructor(){super();for(const id of ['threshold','knee','ratio','attack','release'])this[id]={value:0};}}
const active=[];let ticks=0;
class Osc extends Node{constructor(){super();this.frequency={setValueAtTime(v){assert.ok(Number.isFinite(v),'frequency finite');}};}start(){ticks++;}stop(){}}
class AudioContext{constructor(){this.currentTime=30;this.state='running';this.destination=new Node();this.gains=[];this.limiterCount=0;active.push(this);}createGain(){const gain=new Gain();this.gains.push(gain);return gain;}createOscillator(){return new Osc();}createDynamicsCompressor(){this.limiterCount++;return new Comp();}async resume(){}async suspend(){}}
class El{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.events={};this.attrs={};this.value='';this.hidden=false;this.disabled=false;this.style={width:'',setProperty(){}};this.dataset={};this.classList={add(){},remove(){},toggle(){}};}
  append(...items){for(const item of items){item.parentElement=this;this.children.push(item);}}
  setAttribute(name,value){this.attrs[name]=value;}
  addEventListener(name,fn){this.events[name]=fn;}
  remove(){}
  querySelector(sel){return this.parts?.[sel]||null;}
  get offsetHeight(){return 1;}
}
let previous='';
globalThis.localStorage={getItem(){return previous;},setItem(key,value){previous=value;}};
globalThis.matchMedia=()=>({matches:true});
globalThis.window={AudioContext};
const stage=new El(),head=new El(),inner=new El();stage.parts={'.quiz-stage-head':head,'.quiz-stage-inner':inner};
globalThis.document={getElementById:id=>id==='classic-focus'?stage:null,createElement:tag=>new El(tag),addEventListener(){},removeEventListener(){}};
const ui=createArcadeUi('classic-focus',{role:'teacher'});
const controls=head.children[0];
assert.equal(controls.children.length,5,'toggle + track selector + selected track + two volume sliders');
const [toggle,trackWrap,trackCurrent,bgmLabel,fxLabel]=controls.children;
const selector=trackWrap.children[1],bgm=bgmLabel.children[1],fx=fxLabel.children[1];
assert.equal(selector.children.length,4,'auto + three BGM tracks');
assert.equal(selector.value,'auto');
assert.equal(bgm.value,'65');assert.equal(fx.value,'75');
ui.newGameMusic();assert.ok(previous,'selects and persists a track');
const previousFirst=previous;
ui.newGameMusic();assert.notEqual(previous,previousFirst,'new game changes track');
assert.match(trackCurrent.textContent,/재생곡/);
selector.value='cloud';selector.events.change();
const lastAutomatic=previous;ui.newGameMusic();assert.equal(previous,lastAutomatic,'manual selection does not overwrite auto history');
assert.match(trackCurrent.textContent,/구름 정원/);
selector.value='auto';selector.events.change();
await toggle.events.click();
assert.ok(ticks>0,'BGM audible oscillator scheduled');
assert.equal(active.length,1);
assert.equal(active[0].limiterCount,1,'dynamic compressor connected');
assert.equal(active[0].gains[0].gain.value,.95,'master output no longer attenuates twice');
assert.ok(active[0].gains[1].gain.value>1.5,'BGM default gain increased');
const countBefore=ticks;
await ui.fanfare();
assert.ok(ticks>=countBefore+16,'fanfare produces oscillator tones');
ui.sync({state:'question',questionId:'q1'});
ui.sync({state:'finished',questionId:'q1'});
fx.value='100';fx.events.input();assert.match(fxLabel.children[0].textContent,/100%/);
bgm.value='100';bgm.events.input();assert.match(bgmLabel.children[0].textContent,/100%/);
assert.equal(active[0].gains[1].gain.value,2.55,'100% music channel is about 5x previous effective output');
assert.equal(active[0].gains[2].gain.value,1.45,'100% SFX channel is about 5x previous effective output');
ui.destroy();
console.log('v3.14: calm tracks x3 / nonrepeat / manual selection / volume x2 / Web Audio compressor / effects PASS');
