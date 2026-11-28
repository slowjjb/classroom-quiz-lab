import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CALM_TRACKS,GOLD_TRACKS} from '../js/arcade-ui.js';
import {RACING_TRACKS,createRacingAudio} from '../js/racing-audio.js';
import {FISHING_TRACKS,createFishingBgm} from '../js/fishing-bgm.js';
const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('four modes have multiple original BGM choices and unique identifiers',()=>{
 for(const [name,tracks,min] of [
  ['classic',CALM_TRACKS,5],['gold',GOLD_TRACKS,4],
  ['racing',RACING_TRACKS,4],['fishing',FISHING_TRACKS,4]
 ]){
  assert.ok(tracks.length>=min,name);
  assert.equal(new Set(tracks.map(t=>t.id)).size,tracks.length,name+' duplicate track ID');
  for(const t of tracks){
   assert.ok(t.name&&t.name.length>2,name+' unnamed track');
   if(t.kind==='file')continue;
   assert.ok(t.beat>.13&&t.beat<.5,name+' beat out of bounds');
   assert.ok(Array.isArray(t.melody)&&t.melody.length===32,name+' melody length');
   assert.ok(Array.isArray(t.bass)&&t.bass.length>=4,name+' bass phrase');
  }
 }
});
test('fishing BGM preserves original WAV and can choose/mute/revolume independently',()=>{
 let paused=0,played=0;
 const el={loop:false,preload:'auto',volume:1,play(){played++;return Promise.resolve()},pause(){paused++}};
 const sound=createFishingBgm({role:'student',fileElement:el});
 assert.equal(el.loop,true);
 assert.equal(sound.trackId,'sea-original');
 sound.setVolume(25);
 assert.equal(el.volume,.25);
 sound.setPlaying(true);
 assert.ok(played>0);
 sound.setEnabled(false);
 assert.ok(paused>0);
 assert.equal(sound.isEnabled,false);
 assert.equal(sound.setTrack('unknown'),false);
 assert.equal(sound.setTrack('coral'),true);
 assert.equal(sound.trackId,'coral');
 sound.setPlaying(false);
 sound.destroy();
});
test('Racing BGM supports song changes without requiring score or Firebase',()=>{
 const sound=createRacingAudio({role:'teacher'});
 assert.equal(sound.trackId,'sprint');
 assert.equal(sound.setTrack('neon'),true);
 assert.equal(sound.trackId,'neon');
 assert.equal(sound.setTrack('does-not-exist'),false);
 sound.setPlaying(false);
 sound.destroy();
});
test('teacher Fishing monitor has music toggle, track list and volume, all wired locally',()=>{
 const html=src('rooms.html'),host=src('js/fishing-host.js');
 for(const id of ['fishing-focus-audio','fishing-focus-track','fishing-focus-volume']){
  assert.match(html,new RegExp('id="'+id+'"'));
  assert.ok(host.includes("$('"+id+"').addEventListener"),id+' event absent');
 }
 assert.match(host,/teacherBgm\.setPlaying\(true\);/);
 assert.match(host,/teacherBgm\.setPlaying\(phase==='playing'&&!pub\?\.pauseStartedAt\)/);
 assert.doesNotMatch(host,/set\(ref\(db,.*fishing.*bgm/i);
});
test('student Fishing and Racing retain effects but permit song choices',()=>{
 const join=src('join.html'),fish=src('js/fishing-student.js'),racing=src('js/racing-student-game.js');
 for(const id of ['fishing-student-track','racing-lobby-track','racing-student-track'])
  assert.match(join,new RegExp('id="'+id+'"'));
 assert.match(fish,/safePlay\(/);
 assert.match(fish,/studentBgm\.setTrack\(/);
 assert.match(fish,/fishing-audio-toggle/);
 assert.match(racing,/RACING_TRACKS/);
 assert.match(racing,/sound\.setTrack\(/);
 assert.match(racing,/sound\.play\('submit'\)/);
});
test('teacher Racing monitor track list and music selectors are in teacher controls',()=>{
 const host=src('js/racing-host-game.js'),html=src('rooms.html');
 assert.match(html,/id="racing-play-track"/);
 assert.match(host,/racing-play-track'\)\.addEventListener\('change'/);
 assert.match(host,/RACING_TRACKS/);
});
