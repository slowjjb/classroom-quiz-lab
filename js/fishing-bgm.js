// Purplekit Fishing: original locally synthesized BGM and the existing local WAV.
// No network streaming, no quiz-state writes, and no third-party copyrighted tunes.
export const FISHING_TRACKS=Object.freeze([
  {id:'sea-original',name:'기본 바다 BGM',kind:'file'},
  {id:'sea-breeze',name:'바닷바람 산책',kind:'synth',beat:.29,wave:'sine',
    melody:[392,0,440,523.25,0,440,392,0,349.23,0,392,440,523.25,0,392,0,
      440,523.25,587.33,0,523.25,440,392,0,349.23,392,440,0,392,349.23,293.66,0],
    bass:[130.81,130.81,174.61,174.61,146.83,146.83,196,196]},
  {id:'coral',name:'산호 마을 탐험',kind:'synth',beat:.235,wave:'triangle',
    melody:[523.25,659.25,587.33,0,523.25,440,392,0,440,523.25,659.25,783.99,659.25,587.33,523.25,0,
      587.33,659.25,783.99,0,659.25,523.25,440,0,392,440,523.25,587.33,523.25,440,392,0],
    bass:[174.61,174.61,146.83,146.83,196,196,130.81,130.81]},
  {id:'night-tide',name:'달빛 물결',kind:'synth',beat:.355,wave:'sine',
    melody:[329.63,0,392,0,440,392,329.63,0,293.66,0,329.63,392,440,0,392,0,
      349.23,0,440,523.25,0,440,392,0,329.63,0,293.66,329.63,392,0,329.63,0],
    bass:[110,110,146.83,146.83,130.81,130.81,174.61,174.61]}
]);
export function createFishingBgm({role='teacher',fileElement=null}={}){
 const storageKey='purplekit-fishing-bgm-track-'+role;
 const volumeKey='purplekit-fishing-bgm-volume-'+role+(role==='teacher'?'-v626':'');
 const enabledKey='purplekit-fishing-bgm-enabled-'+role;
 let trackId='sea-original',percent=role==='teacher'?75:28,enabled=true,wanted=false;
 try{
  const saved=localStorage.getItem(storageKey);
  if(FISHING_TRACKS.some(t=>t.id===saved))trackId=saved;
  const volume=Number(localStorage.getItem(volumeKey));
  if(localStorage.getItem(volumeKey)!==null&&Number.isFinite(volume))percent=Math.max(0,Math.min(100,volume));
  enabled=localStorage.getItem(enabledKey)!=='off';
 }catch{}
 const file=fileElement||(typeof Audio==='function'?new Audio(new URL('../audio/fishing-bgm.wav',import.meta.url).href):null);
 if(file){file.loop=true;file.preload=fileElement?'auto':'metadata';file.volume=percent/100;}
 let context=null,master=null,timer=null,index=0,nextAt=0,playingType='',starting=false,generation=0;
 const current=()=>FISHING_TRACKS.find(t=>t.id===trackId)||FISHING_TRACKS[0];
 function setup(){
  if(context)return true;
  const AudioContextCtor=window.AudioContext||window.webkitAudioContext;
  if(!AudioContextCtor)return false;
  try{context=new AudioContextCtor();master=context.createGain();
   master.gain.value=.0001;master.connect(context.destination);return true;}catch{return false;}
 }
 function tone(frequency,start,duration,wave,volume){
  if(!frequency||!context)return;
  const osc=context.createOscillator(),envelope=context.createGain();
  osc.type=wave;osc.frequency.setValueAtTime(frequency,start);
  envelope.gain.setValueAtTime(.0001,start);
  envelope.gain.exponentialRampToValueAtTime(volume,start+.025);
  envelope.gain.exponentialRampToValueAtTime(.0001,start+duration);
  osc.connect(envelope);envelope.connect(master);osc.start(start);osc.stop(start+duration+.025);
 }
 function schedule(){
  if(playingType!=='synth'||!enabled||!wanted||!context)return;
  const track=current();
  while(nextAt<context.currentTime+.35){
   const i=index%track.melody.length,beat=track.beat,at=nextAt;
   tone(track.melody[i],at,beat*.78,track.wave,.20);
   if(i%4===0)tone(track.bass[Math.floor(i/4)%track.bass.length],at,beat*3.1,'sine',.12);
   nextAt+=beat;index++;
  }
 }
 function stopOutput(){
  generation++;starting=false;
  file?.pause();
  if(timer){clearInterval(timer);timer=null;}
  if(context&&master){const at=context.currentTime;master.gain.cancelScheduledValues(at);
   master.gain.setTargetAtTime(.0001,at,.018);}
  playingType='';
 }
 function startOutput(){
  if(!enabled||!wanted)return false;
  const track=current();
  if(track.kind==='file'){
   if(playingType==='file')return true;
   stopOutput();playingType='file';
   if(file){file.volume=percent/100;void file.play().catch(()=>{});}return true;
  }
  if((playingType==='synth'&&timer)||starting)return true;
  stopOutput();
  if(!setup())return false;
  starting=true;const ticket=generation;
  const begin=()=>{
   if(ticket!==generation||!wanted||!enabled||current().kind!=='synth'||!context)return;
   starting=false;playingType='synth';index=0;nextAt=context.currentTime+.08;
   master.gain.setTargetAtTime((role==='teacher'?1.05:.38)*percent/100,context.currentTime,.035);
   schedule();timer=setInterval(schedule,175);
  };
  if(context.state==='suspended')void context.resume().then(begin).catch(()=>{if(ticket===generation)starting=false;});
  else begin();
  return true;
 }
 function setPlaying(value){wanted=Boolean(value);if(wanted)startOutput();else stopOutput();}
 function setEnabled(value){
  enabled=Boolean(value);try{localStorage.setItem(enabledKey,enabled?'on':'off');}catch{}
  if(enabled)startOutput();else stopOutput();
  return enabled;
 }
 function setTrack(id){
  if(!FISHING_TRACKS.some(t=>t.id===id))return false;
  if(trackId===id)return true;
  stopOutput();trackId=id;
  try{localStorage.setItem(storageKey,id);}catch{}
  if(wanted&&enabled)startOutput();
  return true;
 }
 function setVolume(value){
  percent=Math.max(0,Math.min(100,Number(value)||0));
  try{localStorage.setItem(volumeKey,String(percent));}catch{}
  if(file)file.volume=percent/100;
  if(master&&context&&playingType==='synth')master.gain.setTargetAtTime((role==='teacher'?1.05:.38)*percent/100,context.currentTime,.035);
 }
 function destroy(){stopOutput();if(context)void context.close().catch(()=>{});context=null;}
 return {setPlaying,setEnabled,setTrack,setVolume,destroy,
   get trackId(){return trackId},get isEnabled(){return enabled},get volume(){return percent}};
}
