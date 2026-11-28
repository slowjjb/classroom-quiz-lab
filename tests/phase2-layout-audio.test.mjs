import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFishingBgm} from '../js/fishing-bgm.js';
import {createRacingAudio} from '../js/racing-audio.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Gold teacher has only one BGM volume control; effect gain remains fixed',()=>{
 const ui=read('js/arcade-ui.js');
 assert.match(ui,/makeVolume\('BGM 음량'/);
 assert.doesNotMatch(ui,/makeVolume\('효과음 음량'/);
 assert.match(ui,/audio\.setFxVolume\(75\)/);
 assert.match(read('gold.css'),/\.gold-focus\.arcade-enhanced \.quiz-stage-head/);
});

test('roster student name remains in a dedicated flexible column',()=>{
 const css=read('styles.css'),rooms=read('js/rooms.js');
 assert.match(css,/#room-detail #room-members\.student-grid/);
 assert.match(css,/word-break:keep-all/);
 assert.match(rooms,/identity\.append\(name,more\)/);
 assert.match(rooms,/room-member-offline/);
});

test('Racing volume and fullscreen lane sizing are independently wired',()=>{
 const html=read('rooms.html'),host=read('js/racing-host-game.js'),css=read('racing-lobby.css');
 assert.match(html,/id="racing-play-volume"/);
 assert.match(host,/racing-play-volume'\)\.addEventListener\('input'/);
 assert.match(host,/updateLaneSizing\(rank\.length\)/);
 assert.match(host,/window\.addEventListener\('resize'/);
 assert.match(css,/--racing-focus-row-height/);
});

test('teacher audio settings persist and do not alter student defaults',()=>{
 const previous=globalThis.localStorage;
 const saved=new Map();
 globalThis.localStorage={getItem:key=>saved.has(key)?saved.get(key):null,setItem:(key,v)=>saved.set(key,String(v))};
 try{
  const racing=createRacingAudio({role:'teacher'});
  assert.equal(racing.volume,75);
  assert.equal(racing.setVolume(45),45);
  assert.equal(createRacingAudio({role:'teacher'}).volume,45);
  assert.equal(createRacingAudio({role:'student'}).volume,100);
  racing.destroy();
  const elem={loop:false,preload:'auto',volume:1,play(){return Promise.resolve()},pause(){}};
  const fish=createFishingBgm({role:'teacher',fileElement:elem});
  assert.equal(fish.volume,75);
  fish.setVolume(80);
  assert.equal(fish.volume,80);
  assert.equal(elem.volume,.8);
  fish.destroy();
 }finally{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous}
});

test('alpha.26 consistent assets and explicit build',()=>{
 assert.match(read('version.json'),/"build": 622/);
 assert.match(read('rooms.html'),/styles\.css\?v=6\.0\.0-alpha\.26/);
 assert.match(read('js/version.js'),/APP_BUILD = 622/);
});
