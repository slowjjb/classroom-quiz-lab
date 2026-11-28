// Purplekit Racing alpha7: original procedural BGM + sound effects.
// No external audio files, tracks or copyright-encumbered compositions.
// Browser sound starts only after an actual user gesture.
// Each tune is an original 32-step procedural phrase with distinct rhythmic pacing.
export const RACING_TRACKS=Object.freeze([
 {id:'sprint',name:'스타트 대시',beat:.197,
  melody:[392,0,523.25,587.33,659.25,523.25,392,0,440,523.25,659.25,783.99,659.25,587.33,523.25,0,
    392,493.88,587.33,659.25,783.99,659.25,587.33,493.88,523.25,0,587.33,659.25,523.25,493.88,392,0],
  bass:[130.81,130.81,174.61,196,146.83,146.83,196,196]},
 {id:'sunset',name:'노을빛 서킷',beat:.224,
  melody:[329.63,392,440,0,523.25,440,392,0,349.23,392,523.25,587.33,523.25,440,392,0,
    440,523.25,659.25,0,587.33,523.25,440,392,349.23,392,440,523.25,440,392,329.63,0],
  bass:[174.61,174.61,130.81,130.81,146.83,146.83,196,196]},
 {id:'neon',name:'네온 가속',beat:.181,
  melody:[523.25,659.25,783.99,0,659.25,587.33,523.25,0,493.88,587.33,659.25,783.99,880,783.99,659.25,0,
    587.33,659.25,783.99,659.25,523.25,587.33,659.25,0,440,523.25,587.33,659.25,783.99,659.25,523.25,0],
  bass:[110,110,146.83,146.83,164.81,164.81,130.81,130.81]},
 {id:'rainbow',name:'무지개 결승선',beat:.208,
  melody:[392,440,523.25,0,587.33,659.25,587.33,523.25,440,0,523.25,659.25,783.99,0,659.25,587.33,
    523.25,587.33,659.25,0,880,783.99,659.25,523.25,587.33,659.25,783.99,659.25,587.33,523.25,392,0],
  bass:[196,196,146.83,146.83,174.61,174.61,130.81,130.81]}
]);
const failSilently=()=>{};
export function createRacingAudio({role='student'}={}){
 let context=null,bus=null,bgmBus=null,fxBus=null,timer=null,step=0,nextTime=0;
 let unlocked=false,muted=false,playing=false,ended=false;
  const volumeKey='purplekit-racing-bgm-volume-'+role+'-v626';
  let volumePercent=role==='teacher'?75:100;
  try{const saved=localStorage.getItem(volumeKey);if(saved!==null&&role==='teacher')volumePercent=Math.min(100,Math.max(0,Number(saved)||0));}catch{}
  const musicGain=()=> (role==='teacher'?.90:.52)*volumePercent/100;
  const key='purplekit-racing-track-'+role;
  let trackId='sprint';try{const saved=localStorage.getItem(key);if(RACING_TRACKS.some(t=>t.id===saved))trackId=saved;}catch{}
  const current=()=>RACING_TRACKS.find(t=>t.id===trackId)||RACING_TRACKS[0];
 function setup(){
  if(ended)return false;
  if(context)return true;
  const Context=window.AudioContext||window.webkitAudioContext;
  if(!Context)return false;
  try{
   context=new Context();
   bus=context.createGain();bus.gain.value=role==='teacher'?.75:.13;
   bgmBus=context.createGain();bgmBus.gain.value=musicGain();
   fxBus=context.createGain();fxBus.gain.value=.90;
   bgmBus.connect(bus);fxBus.connect(bus);
   bus.connect(context.destination);return true;
  }catch(error){console.warn('레이싱 오디오 사용 불가',error);return false}
 }
 async function unlock(){
  if(ended||muted||!setup())return false;
  try{if(context.state==='suspended')await context.resume();unlocked=context.state==='running';if(unlocked&&playing)beginMusic();return unlocked}
  catch{return false}
 }
 function tone(freq,start,duration,volume=.18,wave='triangle',fx=false){
  if(!context||!Number.isFinite(freq)||freq<=0)return;
  const osc=context.createOscillator(),env=context.createGain();
  osc.type=wave;osc.frequency.setValueAtTime(freq,start);
  env.gain.setValueAtTime(.0001,start);
  env.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),start+.013);
  env.gain.exponentialRampToValueAtTime(.0001,start+Math.max(.06,duration));
  osc.connect(env);env.connect(fx?fxBus:bgmBus);
  osc.start(start);osc.stop(start+Math.max(.07,duration)+.03);
 }
 function schedule(){
  if(!unlocked||!playing||muted||!context)return;
  while(nextTime<context.currentTime+.42){
   const track=current(),index=step%track.melody.length,beat=track.beat,t=nextTime;
   if(track.melody[index])tone(track.melody[index],t,beat*.78,.21,index%8===0?'sawtooth':'triangle');
   if(index%4===0)tone(track.bass[Math.floor(index/4)%track.bass.length],t,beat*2.9,.19,'sine');
   if(index%8===4)tone(track.melody[index]||392,t,beat*.35,.09,'square');
   nextTime+=beat;step++;
  }
 }
 function beginMusic(){
  if(!unlocked||muted||!playing||timer||!context)return;
  bgmBus.gain.setTargetAtTime(musicGain(),context.currentTime,.025);
  step=0;nextTime=context.currentTime+.09;schedule();timer=setInterval(schedule,190);
 }
 function stopMusic(){
  if(timer){clearInterval(timer);timer=null}
  if(bgmBus&&context){const t=context.currentTime;bgmBus.gain.cancelScheduledValues(t);
   bgmBus.gain.setTargetAtTime(0,t,.03)}
 }
 function setTrack(id){
  if(!RACING_TRACKS.some(t=>t.id===id))return false;
  if(trackId===id)return true;
  const restart=Boolean(timer);
  stopMusic();trackId=id;
  try{localStorage.setItem(key,id);}catch{}
  if(restart&&unlocked&&!muted&&playing)beginMusic();
  return true;
 }
 function setVolume(value){
   volumePercent=Math.min(100,Math.max(0,Number(value)||0));
   if(role==='teacher')try{localStorage.setItem(volumeKey,String(volumePercent));}catch{}
   if(context&&bgmBus&&!muted&&playing)bgmBus.gain.setTargetAtTime(musicGain(),context.currentTime,.035);
   return volumePercent;
 }
 function play(name){
  if(ended||muted||!unlocked||!context)return;
  const t=context.currentTime+.012;
  const n=(hz,delay=.0,duration=.1,volume=.24,wave='triangle')=>tone(hz,t+delay,duration,volume,wave,true);
  if(name==='choose'){n(523,0,.08,.18);n(659,.065,.11,.20)}
  else if(name==='submit'){n(523,0,.09,.15);n(587,.10,.12,.17)}
  else if(name==='correct'){n(523,0,.11,.25);n(659,.115,.14,.27);n(784,.26,.20,.27)}
  else if(name==='wrong'){n(392,0,.15,.23,'sine');n(311,.15,.23,.20,'triangle')}
  else if(name==='spin'){n(523,0,.16,.26,'square');n(784,.12,.17,.19,'triangle');n(1046,.29,.20,.23)}
  else if(name==='tick')n([392,466,523,587][step%4],0,.055,.13,'square');
  else if(name==='positive'){n(523,0,.14,.27);n(659,.16,.16,.29);n(784,.34,.20,.31);n(1046,.57,.32,.25)}
  else if(name==='negative'){n(392,0,.14,.24,'sine');n(330,.15,.17,.23);n(262,.36,.26,.25)}
  else if(name==='neutral'){n(523,0,.12,.18);n(466,.16,.22,.18)}
  else if(name==='start'){[392,523,659,784].forEach((x,i)=>n(x,.16*i,.16,.25))}
  else if(name==='finish'){[523,659,784,1046,784,1046].forEach((x,i)=>n(x,i*.19,i>=4?.45:.18,.27,i>=4?'sawtooth':'triangle'))}
 }
 function setPlaying(value){
  const was=playing;playing=Boolean(value);
  if(playing&&!was){if(unlocked&&!muted)beginMusic()}
  else if(!playing&&was)stopMusic();
 }
 async function toggle(){
  if(!unlocked){muted=false;return await unlock()}
  muted=!muted;
  if(muted){stopMusic();if(bgmBus&&context)bgmBus.gain.setTargetAtTime(0,context.currentTime,.02)}
  else{if(bgmBus&&context)bgmBus.gain.setTargetAtTime(musicGain(),context.currentTime,.02);if(playing)beginMusic()}
  return !muted;
 }
 function destroy(){ended=true;playing=false;stopMusic();context?.close?.().catch?.(failSilently);context=null}
 return {unlock,toggle,setPlaying,setTrack,setVolume,play,destroy,
  get trackId(){return trackId},
   get volume(){return volumePercent},
  get isOn(){return unlocked&&!muted},
  get canPlay(){return !!(window.AudioContext||window.webkitAudioContext)}
 };
}
