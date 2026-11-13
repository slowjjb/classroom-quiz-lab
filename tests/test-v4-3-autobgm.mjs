import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createArcadeUi} from '../js/arcade-ui.js';
const root=new URL('../',import.meta.url);
const read=(path)=>readFileSync(new URL(path,root),'utf8');
const classic=read('js/classic-host.js'),gold=read('js/gold-host.js');
assert.match(classic,/publicRound\?\.state==='ready'[\s\S]*arcade\.autoStartGameMusic\(\)/,'Classic first question auto BGM');
assert.match(gold,/arcade\.newGameMusic\(\);arcade\.autoStartGameMusic\(\);[\s\S]*await update/,'Gold activates before Firebase write');
assert.match(read('rooms.html'),/js\/classic-host\.js\?v=4\.3/);
assert.match(read('rooms.html'),/js\/gold-host\.js\?v=4\.3/);
assert.match(classic,/\.\/arcade-ui\.js\?v=4\.3/);
assert.match(gold,/\.\/arcade-ui\.js\?v=4\.3/);
let oscillations=0;
class AudioNode{connect(){} }
class Gain extends AudioNode{constructor(){super();this.gain={value:0,setValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;},cancelScheduledValues(){},setTargetAtTime(v){this.value=v;}};}}
class Compressor extends AudioNode{constructor(){super();for(const p of ['threshold','knee','ratio','attack','release'])this[p]={value:0};}}
class Oscillator extends AudioNode{constructor(){super();this.frequency={setValueAtTime(){}};}start(){oscillations++;}stop(){}}
let contextCount=0;
class AudioContext{
  constructor(){this.state='suspended';this.currentTime=8;this.destination=new AudioNode();contextCount++;}
  createOscillator(){return new Oscillator();}createGain(){return new Gain();}createDynamicsCompressor(){return new Compressor();}
  async resume(){this.state='running';}async suspend(){this.state='suspended';}
}
class Element{
  constructor(tag='div'){this.children=[];this.events={};this.attrs={};this.style={width:'',setProperty(){}};this.value='';this.hidden=false;this.dataset={};this.classList={add(){},remove(){},toggle(){}};}
  append(...nodes){this.children.push(...nodes);for(const n of nodes)n.parentElement=this;}
  setAttribute(name,value){this.attrs[name]=value;}
  addEventListener(name,fn){this.events[name]=fn;}
  remove(){}
  querySelector(query){return this.parts?.[query]||null;}
  get offsetHeight(){return 1;}
}
const makeStage=()=>{
  const stage=new Element(),head=new Element(),inner=new Element();stage.parts={'.quiz-stage-head':head,'.quiz-stage-inner':inner};return {stage,head};
};
const classicStage=makeStage(),goldStage=makeStage();
globalThis.window={AudioContext};
globalThis.document={getElementById:id=>({'classic-focus':classicStage.stage,'gold-focus':goldStage.stage})[id]||null,createElement:tag=>new Element(tag),addEventListener(){},removeEventListener(){}};
globalThis.matchMedia=()=>({matches:true});
globalThis.localStorage={getItem(){return null;},setItem(){}};
// Classic: click Start -> audio context activated, music only after a question begins.
const ui=createArcadeUi('classic-focus',{role:'teacher',mode:'classic'});
const toggle=classicStage.head.children[0].children[0];
assert.equal(toggle.textContent,'🔇 BGM 켜기');
assert.equal(oscillations,0);
ui.autoStartGameMusic();
await Promise.resolve();await Promise.resolve();
assert.equal(toggle.textContent,'🔊 BGM 끄기','Start gesture automatically arms BGM');
assert.equal(oscillations,0,'No music before question actually starts');
ui.sync({state:'question',questionId:'q1'});
assert.ok(oscillations>0,'Music begins when question state arrives');
assert.equal(toggle.attrs['aria-pressed'],'true');
await toggle.events.click();
assert.equal(toggle.textContent,'🔇 BGM 켜기');
assert.equal(toggle.attrs['aria-pressed'],'false');
ui.sync({state:'reveal',questionId:'q1'});
ui.sync({state:'question',questionId:'q2'});
assert.equal(toggle.textContent,'🔇 BGM 켜기','Manual mute persists across subsequent rounds');
await toggle.events.click();
assert.equal(toggle.textContent,'🔊 BGM 끄기','Manual re-enable works');
ui.sync({state:'finished',questionId:'q2'});
assert.equal(toggle.textContent,'🔇 BGM 켜기','Game finish stops music and resets button');
ui.reset();
ui.autoStartGameMusic();await Promise.resolve();await Promise.resolve();
assert.equal(toggle.textContent,'🔊 BGM 끄기','New game activates BGM again by default');
ui.destroy();
// Gold: ready -> playing, with separate adventure track.
const golden=createArcadeUi('gold-focus',{role:'teacher',mode:'gold'});
const gtoggle=goldStage.head.children[0].children[0];
golden.newGameMusic();golden.autoStartGameMusic();
await Promise.resolve();await Promise.resolve();
assert.equal(gtoggle.textContent,'🔊 BGM 끄기');
golden.sync({state:'question',questionId:'gold-round'});
await gtoggle.events.click();
assert.equal(gtoggle.textContent,'🔇 BGM 켜기');
golden.sync({state:'finished',questionId:'gold-round'});
golden.destroy();
assert.equal(contextCount,2,'Separate audio contexts for teacher modes');
console.log('v4.3: classic & gold auto BGM / muted persistence / manual toggle / end reset / browser gesture PASS');
