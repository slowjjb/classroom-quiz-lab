import { createAvatarImage } from './avatars.js';
/**
 * QUIZ LAB v3.4: 시각 효과와 오리지널 Web Audio 배경 음악.
 * Firebase, 채점, 정답, 점수 데이터에는 접근하지 않는 순수 표시 계층입니다.
 * 외부 음원·이미지·라이브러리 사용 없음. 소리는 사용자 클릭 후에만 실행됩니다.
 */
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const notes = { C3:130.81,D3:146.83,E3:164.81,F3:174.61,G3:196,A3:220,B3:246.94,
  C4:261.63,D4:293.66,E4:329.63,F4:349.23,G4:392,A4:440,B4:493.88,
  C5:523.25,D5:587.33,E5:659.25,F5:698.46,G5:783.99,A5:880 };
const melody = ['E5',null,'G5','A5','G5',null,'E5','D5','C5',null,'D5','E5','G5','E5','D5',null,
  'E5','G5','A5',null,'G5','E5','D5',null,'C5','E5','G5',null,'D5',null,'C5',null];
const bass = ['C3','C3','A3','A3','F3','F3','G3','G3'];
function noop(){}
class OriginalAudio {
  constructor(){this.on=false;this.ctx=null;this.musicTimer=null;this.nextAt=0;this.step=0;this.master=null;this.musicBus=null;this.fxBus=null;this.musicLevel=.54;}
  ensure(){
    const Ctor=window.AudioContext||window.webkitAudioContext;
    if(!Ctor)return false;
    if(this.ctx)return true;
    this.ctx=new Ctor();this.master=this.ctx.createGain();this.master.gain.value=.45;this.master.connect(this.ctx.destination);
    this.musicBus=this.ctx.createGain();this.musicBus.gain.value=this.musicLevel;this.musicBus.connect(this.master);
    this.fxBus=this.ctx.createGain();this.fxBus.gain.value=.58;this.fxBus.connect(this.master);
    return true;
  }
  async enable(){if(!this.ensure())return false;try{await this.ctx.resume();this.on=true;return true;}catch{return false;}}
  disable(){this.on=false;this.stopMusic();}
  tone(frequency,at,duration,{type='sine',volume=.14,fx=false}={}){
    if(!this.ctx||!Number.isFinite(frequency))return;
    const oscillator=this.ctx.createOscillator(),env=this.ctx.createGain();oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,at);
    env.gain.setValueAtTime(.0001,at);env.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),at+.012);
    env.gain.exponentialRampToValueAtTime(.0001,at+duration);
    oscillator.connect(env);env.connect(fx?this.fxBus:this.musicBus);oscillator.start(at);oscillator.stop(at+duration+.025);
  }
  fx(name){
    if(!this.on||!this.ctx)return;
    const now=this.ctx.currentTime+.01;
    const n=(key,delay,duration,vol=.17,type='sine')=>this.tone(notes[key],now+delay,duration,{fx:true,volume:vol,type});
    if(name==='select'){n('C5',0,.075,.10,'triangle');n('G5',.05,.075,.07,'triangle');}
    else if(name==='submit'){n('E5',0,.11,.16);n('G5',.11,.15,.14);}
    else if(name==='start'){n('C5',0,.11,.15);n('E5',.13,.11,.16);n('G5',.27,.2,.15);}
    else if(name==='correct'){n('C5',0,.12,.14);n('E5',.115,.13,.16);n('G5',.24,.18,.17);n('C5',.38,.36,.09);}
    else if(name==='wrong'){n('E4',0,.17,.13,'triangle');n('D4',.17,.19,.12,'triangle');n('C4',.37,.25,.1,'triangle');}
    else if(name==='reveal'){n('G4',0,.11,.09);n('C5',.13,.2,.10);}
    else if(name==='tick')n('C5',0,.06,.055,'triangle');
    else if(name==='finish'){['C5','E5','G5','C5'].forEach((key,i)=>n(key,i*.11,i===3?.42:.14,.13,'triangle'));}
    else if(name==='fanfare'){
      // 오리지널 2.8초 승리 빵빠레: 3화음 상승 + 마지막 코드. 외부 음악 자산 없음.
      const sequence=[['C4',0,.19],['E4',.21,.19],['G4',.42,.22],['C5',.66,.26],
        ['D5',1.02,.16],['E5',1.20,.17],['G5',1.40,.25],['A5',1.70,.18],['G5',1.90,.26]];
      for(const [key,delay,duration] of sequence){
        n(key,delay,duration,.18,'sawtooth');n(key,delay+.012,duration,.1,'triangle');
      }
      for(const key of ['C4','E4','G4','C5'])n(key,2.2,.68,.13,'sawtooth');
      n('C5',2.26,.58,.13,'triangle');
    }
  }
  schedule(){
    if(!this.on||!this.ctx)return;
    const ahead=this.ctx.currentTime+1.0;
    while(this.nextAt<ahead){
      const i=this.step%melody.length;
      const note=melody[i];
      if(note)this.tone(notes[note],this.nextAt,.19,{type:'triangle',volume:.12});
      if(i%4===0){const b=bass[Math.floor(i/4)%bass.length];if(b)this.tone(notes[b],this.nextAt,.36,{type:'sine',volume:.13});}
      if(i%2===0)this.tone(notes.C4*2,this.nextAt,.045,{type:'triangle',volume:.015});
      this.nextAt+=.235;this.step++;
    }
  }
  setMusicVolume(value){
    const percent=Math.max(0,Math.min(100,Number(value)||0));
    // 60%는 v3.3 BGM의 약 3배 수준: 0.18 -> 0.54. 최대치에서도 왜곡 방지.
    this.musicLevel=.009*percent;
    if(this.ctx&&this.musicBus){
      this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicBus.gain.setTargetAtTime(this.musicLevel,this.ctx.currentTime,.035);
    }
  }
  startMusic(){
    if(!this.on||!this.ctx||this.musicTimer)return;
    this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicBus.gain.setTargetAtTime(this.musicLevel,this.ctx.currentTime,.05);
    this.nextAt=this.ctx.currentTime+.06;this.schedule();this.musicTimer=setInterval(()=>this.schedule(),350);
  }
  stopMusic(){
    if(this.musicTimer){clearInterval(this.musicTimer);this.musicTimer=null;}
    if(this.ctx&&this.musicBus){this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);this.musicBus.gain.setTargetAtTime(.0001,this.ctx.currentTime,.07);}
  }
}
export function renderPodium(target,ranked){
  if(!target)return;
  target.replaceChildren();
  if(!ranked?.length)return;
  const podium=document.createElement('div');podium.className='arcade-podium';podium.setAttribute('aria-label','최종 상위 3명');
  for(const i of [1,0,2]){
    if(!ranked[i])continue;
    const entry=ranked[i],item=document.createElement('div');item.className=`arcade-podium-person position-${i+1}`;
    const medal=document.createElement('div');medal.className='arcade-podium-medal';medal.textContent=['🥇','🥈','🥉'][i];
    const name=document.createElement('strong');name.textContent=String(entry.name||'참가자');
    const score=document.createElement('span');score.textContent=Number(entry.score||0).toLocaleString('ko-KR')+'점';
    const block=document.createElement('div');block.className='arcade-podium-base';block.textContent=`${i+1}위`;
    item.append(medal,createAvatarImage(entry.avatarId,{size:'lg',decorative:true}),name,score,block);podium.append(item);
  }
  target.append(podium);
}
export function createArcadeUi(stageId,{role='student'}={}){
  const stage=document.getElementById(stageId);
  if(!stage)return {sync:noop,updateTime:noop,choice:noop,submit:noop,showResults:noop,reset:noop,armEffects:noop,fanfare:noop,destroy:noop};
  const audio=new OriginalAudio();let phase='',roundId='',gradedKey='',lastTick=-1,enabled=false,effectsArmed=false,toastTimer=null;
  stage.classList.add('arcade-enhanced');stage.dataset.arcadeRole=role;
  const head=stage.querySelector('.quiz-stage-head');
  const track=document.createElement('div');track.className='arcade-time-track';track.setAttribute('aria-hidden','true');
  const bar=document.createElement('div');bar.className='arcade-time-fill';track.append(bar);
  const toast=document.createElement('div');toast.className='arcade-toast';toast.setAttribute('aria-hidden','true');
  stage.querySelector('.quiz-stage-inner').append(toast);
  let toggle=null,volumeControl=null;
  // 학생 기기: BGM 없음, 소리 토글 없음. 첫 클릭/키보드 조작으로 효과음만 활성화합니다.
  // 브라우저 자동 재생 제한으로 터치 이전에는 소리가 나지 않을 수 있습니다.
  const activateStudentSound=()=>{
    if(role!=='student'||enabled)return;
    audio.enable().then(ok=>{if(ok)enabled=true;}).catch(()=>{});
  };
  if(role==='student'){
    document.addEventListener('pointerdown',activateStudentSound,{capture:true});
    document.addEventListener('keydown',activateStudentSound,{capture:true});
  }else{
    toggle=document.createElement('button');toggle.type='button';toggle.className='arcade-audio-toggle';
    toggle.textContent='🔇 BGM 켜기';toggle.setAttribute('aria-pressed','false');toggle.title='교사용 기기에서만 배경 음악이 재생됩니다';
    const controls=document.createElement('div');controls.className='arcade-audio-settings';
    volumeControl=document.createElement('input');volumeControl.type='range';volumeControl.min='0';volumeControl.max='100';volumeControl.step='5';volumeControl.value='60';
    volumeControl.className='arcade-audio-volume';volumeControl.id='arcade-teacher-volume';
    volumeControl.setAttribute('aria-label','교사 화면 배경 음악 음량');
    const label=document.createElement('label');label.className='arcade-audio-volume-label';label.htmlFor='arcade-teacher-volume';
    const text=document.createElement('span');text.textContent='BGM 음량 60%';label.append(text,volumeControl);
    controls.append(toggle,label);head.append(controls);
    volumeControl.addEventListener('input',()=>{audio.setMusicVolume(volumeControl.value);text.textContent=`BGM 음량 ${volumeControl.value}%`;});
    toggle.addEventListener('click',async()=>{
      if(enabled){enabled=false;audio.stopMusic();toggle.textContent='🔇 BGM 켜기';toggle.setAttribute('aria-pressed','false');return;}
      if(!await audio.enable()){toggle.textContent='이 기기는 오디오를 지원하지 않아요';toggle.disabled=true;return;}
      enabled=true;effectsArmed=true;audio.setMusicVolume(volumeControl.value);toggle.textContent='🔊 BGM 끄기';toggle.setAttribute('aria-pressed','true');
      audio.fx('select');if(phase==='question')audio.startMusic();
    });
  }
  head.append(track);
  const showToast=(message)=>{
    if(reducedMotion())return;
    toast.textContent=message;toast.classList.remove('arcade-toast-visible');void toast.offsetHeight;toast.classList.add('arcade-toast-visible');
    if(toastTimer)clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('arcade-toast-visible'),1200);
  };
  const burst=()=>{
    if(reducedMotion())return;
    const layer=document.createElement('div');layer.className='arcade-confetti';layer.setAttribute('aria-hidden','true');
    for(let i=0;i<24;i++){
      const bit=document.createElement('span');bit.style.setProperty('--x',`${6+(i*37)%88}%`);
      bit.style.setProperty('--delay',`${(i*29)%320}ms`);bit.style.setProperty('--tilt',`${-90+(i*61)%180}deg`);
      bit.style.setProperty('--color',['#FFD56D','#8C6AF7','#32D4E9','#F59DCB','#85A9FF'][i%5]);layer.append(bit);
    }
    stage.append(layer);setTimeout(()=>layer.remove(),2400);
  };
  function playEffect(name){
    if(role==='student'&&!enabled){
      // 버튼을 누른 최초 조작도 오디오 활성화 제스처입니다.
      audio.enable().then(ok=>{if(ok){enabled=true;audio.fx(name);}}).catch(()=>{});
    }else if(role==='teacher'?effectsArmed:enabled)audio.fx(name);
  }
  function sync({state='',questionId='',grade=null}={}){
    if(state===phase&&questionId===roundId&&!(state==='reveal'&&grade!=null))return;
    const newQuestion=questionId&&questionId!==roundId;
    const newPhase=state!==phase;
    if(newQuestion){roundId=questionId;gradedKey='';lastTick=-1;}
    phase=state;stage.dataset.arcadePhase=state;
    track.hidden=!['question','paused'].includes(state);
    if(state==='question'){
      if(role==='teacher'&&enabled)audio.startMusic();
      if(newQuestion){playEffect('start');showToast('⚡ 문제 시작!');}
    }else{audio.stopMusic();}
    if(newPhase&&state==='reveal'&&role==='teacher')playEffect('reveal');
    if(state==='reveal'&&role==='student'&&grade!==null&&gradedKey!==roundId){
      gradedKey=roundId;
      if(grade===true){playEffect('correct');showToast('✨ 정답!');burst();}
      else if(grade===false){playEffect('wrong');showToast('다음 문제는 꼭!');}
    }
    if(newPhase&&state==='finished'){
      if(role==='teacher')playEffect('fanfare');else playEffect('finish');
      burst();showToast('🏆 게임 종료!');
    }
  }
  function updateTime(seconds,total){
    if(phase!=='question'&&phase!=='paused')return;
    if(phase==='paused'){stage.classList.add('arcade-paused');return;}
    stage.classList.remove('arcade-paused');const limit=Math.max(1,Number(total)||30),rem=Math.max(0,Number(seconds)||0);
    bar.style.width=`${Math.min(100,rem/limit*100)}%`;
    track.classList.toggle('arcade-time-urgent',rem<=5);
    if(role==='teacher'&&enabled&&rem<=5&&rem>0&&rem!==lastTick)audio.fx('tick');
    lastTick=rem;
  }
  function reset(){
    phase='';roundId='';gradedKey='';lastTick=-1;audio.stopMusic();track.hidden=true;
    stage.dataset.arcadePhase='';stage.classList.remove('arcade-paused');
    if(toastTimer){clearTimeout(toastTimer);toastTimer=null;}toast.classList.remove('arcade-toast-visible');
  }
  // 교사가 게임 준비/다음 문제 버튼을 누를 때 효과음만 활성화합니다.
  // BGM은 별도 버튼을 눌러야 켜지며, BGM을 꺼도 빵빠레 등 효과음은 남습니다.
  const armEffects=async()=>{if(role!=='teacher')return false;try{effectsArmed=await audio.enable();return effectsArmed;}catch{return false;}};
  const fanfare=async()=>{if(role!=='teacher')return;if(await armEffects())audio.fx('fanfare');};
  return {
    sync,updateTime,reset,armEffects,fanfare,
    choice(){playEffect('select');},
    submit(){playEffect('submit');},
    showResults(){playEffect('select');},
    destroy(){audio.disable();if(role==='student'){document.removeEventListener('pointerdown',activateStudentSound,true);document.removeEventListener('keydown',activateStudentSound,true);}if(toastTimer)clearTimeout(toastTimer);toggle?.parentElement?.remove();track.remove();toast.remove();}
  };
}
