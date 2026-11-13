import { createAvatarImage } from './avatars.js';
/**
 * QUIZ LAB v3.4: 시각 효과와 오리지널 Web Audio 배경 음악.
 * Firebase, 채점, 정답, 점수 데이터에는 접근하지 않는 순수 표시 계층입니다.
 * 외부 음원·이미지·라이브러리 사용 없음. 소리는 사용자 클릭 후에만 실행됩니다.
 */
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// v3.14: 세 곡 모두 Purplekit용으로 직접 구성한 오리지널 선율입니다.
// 오디오 파일 다운로드 없이 Web Audio 오실레이터로 생성합니다.
const notes = {
  Bb2:116.54,C3:130.81,D3:146.83,E3:164.81,F3:174.61,G3:196,A3:220,Bb3:233.08,B3:246.94,
  C4:261.63,D4:293.66,E4:329.63,F4:349.23,G4:392,A4:440,Bb4:466.16,B4:493.88,
  C5:523.25,D5:587.33,E5:659.25,F5:698.46,G5:783.99,A5:880
};
export const CALM_TRACKS = Object.freeze([
  Object.freeze({id:'starlight',name:'별빛 산책',beat:.30,wave:'triangle',
    melody:['E5',null,'G5',null,'A5','G5','E5',null,'D5',null,'E5','G5','E5',null,'C5',null,
            'D5',null,'E5','G5','A5',null,'G5','E5','D5',null,'C5','D5','E5',null,'C5',null],
    bass:['C3','C3','A3','A3','F3','F3','G3','G3'],
    chords:[['C4','E4','G4'],['A3','C4','E4'],['F3','A3','C4'],['G3','B3','D4']] }),
  Object.freeze({id:'cloud',name:'구름 정원',beat:.36,wave:'sine',
    melody:['A4',null,'C5','A4','G4',null,'F4',null,'A4',null,'Bb4','C5','A4',null,'G4',null,
            'F4',null,'A4',null,'C5',null,'D5','C5','A4',null,'G4',null,'F4',null,'C5',null],
    bass:['F3','F3','D3','D3','Bb2','Bb2','C3','C3'],
    chords:[['F3','A3','C4'],['D3','F3','A3'],['Bb2','D3','F3'],['C3','E3','G3']] }),
  Object.freeze({id:'moon',name:'달빛 놀이터',beat:.325,wave:'triangle',
    melody:['B4',null,'D5','B4','G4',null,'A4',null,'B4',null,'D5','E5','D5',null,'B4',null,
            'A4',null,'B4','D5','G5',null,'E5',null,'D5',null,'B4','A4','G4',null,'D5',null],
    bass:['G3','G3','E3','E3','C3','C3','D3','D3'],
    chords:[['G3','B3','D4'],['E3','G3','B3'],['C3','E3','G3'],['D3','F4','A3']] })
]);
// v4 Gold Quest 전용 오리지널 모험 음악. 클래식의 편안한 곡은 그대로 유지합니다.
export const GOLD_TRACKS=Object.freeze([
  Object.freeze({id:'gold-venture',name:'보물의 비밀',beat:.235,wave:'triangle',
    melody:['E5',null,'G5','A5','G5',null,'E5','D5','C5',null,'E5','G5','D5',null,'C5',null,
            'D5','E5','G5',null,'A5','G5','E5',null,'D5',null,'E5','G5','E5',null,'D5',null],
    bass:['A3','A3','F3','F3','D3','D3','E3','E3'],
    chords:[['A3','C4','E4'],['F3','A3','C4'],['D3','F3','A3'],['E3','G3','B3']] }),
  Object.freeze({id:'gold-run',name:'황금 상자 추격전',beat:.215,wave:'triangle',
    melody:['G4','C5','E5','G5','E5','C5','D5','E5','F5',null,'A5','G5','F5','E5','D5',null,
            'E5','G5','A5',null,'G5','E5','D5','C5','D5','E5','G5','E5','D5','C5','G4',null],
    bass:['C3','C3','G3','G3','A3','A3','F3','F3'],
    chords:[['C3','E4','G4'],['G3','B3','D4'],['A3','C4','E4'],['F3','A3','C4']] })
]);
const noop=()=>{};
const MUSIC_MAX_GAIN=2.55; // 기존 v3.13의 100% BGM 대비 1음 출력 약 5배 목표
const TRACK_STORAGE_KEY='purplekit-last-calm-bgm-v314';
export function chooseNextCalmTrack(previousId,random=Math.random){
  const candidates=CALM_TRACKS.filter(track=>track.id!==previousId);
  const raw=Number(random());
  const index=Math.min(candidates.length-1,Math.max(0,Math.floor((Number.isFinite(raw)?raw:0)*candidates.length)));
  return candidates[index].id;
}
function soundGainParam(param,value,ctx){
  if(!param)return;
  const now=ctx?.currentTime??0;
  if(typeof param.cancelScheduledValues==='function')param.cancelScheduledValues(now);
  if(typeof param.setTargetAtTime==='function')param.setTargetAtTime(value,now,.045);
  else param.value=value;
}
class OriginalAudio{
  constructor(role='student',tracks=CALM_TRACKS){
    this.role=role;this.tracks=tracks;this.on=false;this.ctx=null;this.musicTimer=null;this.nextAt=0;this.step=0;
    this.master=null;this.compressor=null;this.musicBus=null;this.fxBus=null;
    this.musicPercent=65;this.fxPercent=75;this.currentTrackId=this.tracks[0].id;
  }
  ensure(){
    const Ctor=window.AudioContext||window.webkitAudioContext;
    if(!Ctor)return false;
    if(this.ctx)return true;
    this.ctx=new Ctor();
    // 과거 v3.13: master .45 x musicBus .9/FXBus .58로 두 번 줄어들었습니다.
    // 현재 100%의 명목 게인은 기존 100% 대비 음악/효과음 모두 약 5배입니다.
    // 최종 다이내믹 컴프레서와 기기 자체 볼륨으로 피크가 제한될 수 있습니다.
    this.master=this.ctx.createGain();this.master.gain.value=.95;
    if(typeof this.ctx.createDynamicsCompressor==='function'){
      const limiter=this.ctx.createDynamicsCompressor();
      limiter.threshold.value=-12;limiter.knee.value=12;limiter.ratio.value=6;
      limiter.attack.value=.003;limiter.release.value=.18;
      this.compressor=limiter;
      this.master.connect(limiter);limiter.connect(this.ctx.destination);
    }else this.master.connect(this.ctx.destination);
    this.musicBus=this.ctx.createGain();this.musicBus.gain.value=MUSIC_MAX_GAIN*this.musicPercent/100;
    this.musicBus.connect(this.master);
    this.fxBus=this.ctx.createGain();this.fxBus.gain.value=1.45*(this.role==='student'?.75:this.fxPercent/100);
    this.fxBus.connect(this.master);
    return true;
  }
  async enable(){
    if(!this.ensure())return false;
    try{await this.ctx.resume();this.on=true;return true;}catch{return false;}
  }
  disable(){this.on=false;this.stopMusic();if(this.ctx?.state==='running')this.ctx.suspend?.().catch?.(()=>{});}
  tone(frequency,at,duration,{type='sine',volume=.14,fx=false,attack=.018}={}){
    if(!this.ctx||!Number.isFinite(frequency)||duration<=0)return;
    const oscillator=this.ctx.createOscillator(),env=this.ctx.createGain();
    oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,at);
    env.gain.setValueAtTime(.0001,at);
    const peakAt=at+Math.min(Math.max(.008,attack),duration*.35);
    env.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),peakAt);
    env.gain.exponentialRampToValueAtTime(.0001,at+duration);
    oscillator.connect(env);env.connect(fx?this.fxBus:this.musicBus);
    oscillator.start(at);oscillator.stop(at+duration+.025);
  }
  fx(name){
    if(!this.on||!this.ctx)return;
    const now=this.ctx.currentTime+.01;
    const n=(key,delay,duration,vol=.17,type='sine')=>this.tone(notes[key],now+delay,duration,{fx:true,volume:vol,type,attack:.011});
    if(name==='select'){n('C5',0,.075,.10,'triangle');n('G5',.05,.075,.07,'triangle');}
    else if(name==='submit'){n('E5',0,.11,.16);n('G5',.11,.15,.14);}
    else if(name==='start'){n('C5',0,.11,.15);n('E5',.13,.11,.16);n('G5',.27,.2,.15);}
    else if(name==='correct'){n('C5',0,.12,.14);n('E5',.115,.13,.16);n('G5',.24,.18,.17);n('C5',.38,.36,.09);}
    else if(name==='wrong'){n('E4',0,.17,.13,'triangle');n('D4',.17,.19,.12,'triangle');n('C4',.37,.25,.1,'triangle');}
    else if(name==='reveal'){n('G4',0,.11,.09);n('C5',.13,.2,.10);}
    else if(name==='tick')n('C5',0,.06,.055,'triangle');
    else if(name==='finish'){['C5','E5','G5','C5'].forEach((key,i)=>n(key,i*.11,i===3?.42:.14,.13,'triangle'));}
    else if(name==='fanfare'){
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
    const track=this.tracks.find(x=>x.id===this.currentTrackId)||this.tracks[0];
    const ahead=this.ctx.currentTime+.55;
    while(this.nextAt<ahead){
      const i=this.step%track.melody.length;
      const beat=track.beat;
      const note=track.melody[i];
      if(note)this.tone(notes[note],this.nextAt,beat*.76,{type:track.wave,volume:.10,attack:.030});
      if(i%4===0){
        const b=track.bass[Math.floor(i/4)%track.bass.length];
        if(b)this.tone(notes[b],this.nextAt,beat*2.2,{type:'sine',volume:.08,attack:.06});
      }
      if(i%8===0){
        const chord=track.chords[Math.floor(i/8)%track.chords.length];
        chord.forEach((name,j)=>this.tone(notes[name],this.nextAt+j*.012,beat*5.2,{type:'sine',volume:.030,attack:.10}));
      }
      this.nextAt+=beat;this.step++;
    }
  }
  setMusicVolume(value){
    this.musicPercent=Math.max(0,Math.min(100,Number(value)||0));
    if(this.ctx&&this.musicBus)soundGainParam(this.musicBus.gain,MUSIC_MAX_GAIN*this.musicPercent/100,this.ctx);
  }
  setFxVolume(value){
    this.fxPercent=Math.max(0,Math.min(100,Number(value)||0));
    if(this.ctx&&this.fxBus)soundGainParam(this.fxBus.gain,1.45*(this.role==='student'?.75:this.fxPercent/100),this.ctx);
  }
  setTrack(id){
    if(!this.tracks.some(x=>x.id===id))return;
    if(this.currentTrackId===id)return;
    const running=Boolean(this.musicTimer);
    this.stopMusic();this.currentTrackId=id;this.step=0;
    if(running)this.startMusic();
  }
  startMusic(){
    if(!this.on||!this.ctx||this.musicTimer)return;
    soundGainParam(this.musicBus.gain,MUSIC_MAX_GAIN*this.musicPercent/100,this.ctx);
    this.nextAt=this.ctx.currentTime+.08;this.schedule();
    this.musicTimer=setInterval(()=>this.schedule(),180);
  }
  stopMusic(){
    if(this.musicTimer){clearInterval(this.musicTimer);this.musicTimer=null;}
    if(this.ctx&&this.musicBus)soundGainParam(this.musicBus.gain,.0001,this.ctx);
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
export function createArcadeUi(stageId,{role='student',mode='classic'}={}){
  const stage=document.getElementById(stageId);
  if(!stage)return {sync:noop,updateTime:noop,choice:noop,submit:noop,showResults:noop,reset:noop,armEffects:noop,fanfare:noop,destroy:noop};
  const tracks=mode==='gold'?GOLD_TRACKS:CALM_TRACKS;
  const audio=new OriginalAudio(role,tracks);let phase='',roundId='',gradedKey='',lastTick=-1,enabled=false,effectsArmed=false,toastTimer=null;
  stage.classList.add('arcade-enhanced');stage.dataset.arcadeRole=role;
  const head=stage.querySelector('.quiz-stage-head');
  const track=document.createElement('div');track.className='arcade-time-track';track.setAttribute('aria-hidden','true');
  const bar=document.createElement('div');bar.className='arcade-time-fill';track.append(bar);
  const toast=document.createElement('div');toast.className='arcade-toast';toast.setAttribute('aria-hidden','true');
  stage.querySelector('.quiz-stage-inner').append(toast);
  let toggle=null,volumeControl=null,fxControl=null,trackControl=null,trackCurrent=null;
  // 학생 화면: BGM은 없고 효과음만. 첫 클릭 후 오디오가 활성화됩니다.
  const activateStudentSound=()=>{
    if(role!=='student'||enabled)return;
    audio.enable().then(ok=>{if(ok)enabled=true;}).catch(()=>{});
  };
  if(role==='student'){
    document.addEventListener('pointerdown',activateStudentSound,{capture:true});
    document.addEventListener('keydown',activateStudentSound,{capture:true});
  }else{
    const controls=document.createElement('div');controls.className='arcade-audio-settings';
    toggle=document.createElement('button');toggle.type='button';toggle.className='arcade-audio-toggle';
    toggle.textContent='🔇 BGM 켜기';toggle.setAttribute('aria-pressed','false');
    toggle.title='교사 기기에서만 BGM을 재생합니다. 게임이 끝나면 자동 정지합니다.';
    controls.append(toggle);
    const trackWrap=document.createElement('label');trackWrap.className='arcade-audio-track-label';
    const trackLabel=document.createElement('span');trackLabel.textContent=mode==='gold'?'모험 BGM':'편안한 BGM';
    trackControl=document.createElement('select');trackControl.className='arcade-audio-track';
    trackControl.id='arcade-teacher-track';trackControl.setAttribute('aria-label','배경 음악 선택');
    for(const [id,name] of [['auto','자동 · 게임마다 변경'],...tracks.map(x=>[x.id,x.name])]){
      const option=document.createElement('option');option.value=id;option.textContent=name;trackControl.append(option);
    }
    trackControl.value='auto';trackWrap.append(trackLabel,trackControl);controls.append(trackWrap);
    trackCurrent=document.createElement('span');trackCurrent.className='arcade-audio-track-current';
    trackCurrent.textContent='재생곡: 게임 준비 시 자동 선택';controls.append(trackCurrent);
    const makeVolume=(labelText,id,initial,change)=>{
      const label=document.createElement('label');label.className='arcade-audio-volume-label';label.htmlFor=id;
      const text=document.createElement('span');text.textContent=`${labelText} ${initial}%`;
      const input=document.createElement('input');input.type='range';input.min='0';input.max='100';input.step='5';
      input.value=String(initial);input.id=id;input.className='arcade-audio-volume';
      input.setAttribute('aria-label',`${labelText} 조절`);
      label.append(text,input);controls.append(label);
      input.addEventListener('input',()=>{change(input.value);text.textContent=`${labelText} ${input.value}%`;});
      return input;
    };
    volumeControl=makeVolume('BGM 음량','arcade-teacher-volume',65,v=>audio.setMusicVolume(v));
    fxControl=makeVolume('효과음 음량','arcade-teacher-fx-volume',75,v=>audio.setFxVolume(v));
    trackControl.addEventListener('change',()=>{
      const selected=trackControl.value;
      if(selected!=='auto'){
        audio.setTrack(selected);
        trackCurrent.textContent=`재생곡: ${tracks.find(t=>t.id===selected)?.name||'선택한 곡'}`;
      }else trackCurrent.textContent='자동 선택 · 다음 게임 시작 시 변경';
    });
    toggle.addEventListener('click',async()=>{
      if(enabled){enabled=false;audio.stopMusic();toggle.textContent='🔇 BGM 켜기';toggle.setAttribute('aria-pressed','false');return;}
      if(!await audio.enable()){toggle.textContent='이 기기는 오디오를 지원하지 않아요';toggle.disabled=true;return;}
      enabled=true;effectsArmed=true;
      if(trackControl.value==='auto'&&trackCurrent.textContent.includes('게임 준비 시')){
        // 교사가 준비 전에 미리 듣는 경우 임시로 기본 트랙을 사용합니다.
        trackCurrent.textContent=`재생곡: ${tracks.find(t=>t.id===audio.currentTrackId)?.name}`;
      }
      audio.setMusicVolume(volumeControl.value);audio.setFxVolume(fxControl.value);
      toggle.textContent='🔊 BGM 끄기';toggle.setAttribute('aria-pressed','true');
      audio.fx('select');if(phase!=='finished')audio.startMusic();
    });
    head.append(controls);
  }
  const newGameMusic=()=>{
    if(role!=='teacher')return;
    if(trackControl?.value!=='auto')return;
    let previous='';
    const key=mode==='gold'?'purplekit-last-gold-bgm-v4':TRACK_STORAGE_KEY;
    try{previous=localStorage.getItem(key)||'';}catch{}
    const next=mode==='gold'?tracks.filter(t=>t.id!==previous)[0]?.id||tracks[0].id:chooseNextCalmTrack(previous);
    audio.setTrack(next);
    try{localStorage.setItem(key,next);}catch{}
    if(trackCurrent)trackCurrent.textContent=`재생곡: ${tracks.find(x=>x.id===next)?.name}`;
  };
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
      if(newQuestion){playEffect('start');showToast('⚡ 문제 시작!');}
    }
    if(role==='teacher'&&enabled){
      if(state==='finished')audio.stopMusic();else audio.startMusic();
    }
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
    sync,updateTime,reset,armEffects,fanfare,newGameMusic,
    choice(){playEffect('select');},
    submit(){playEffect('submit');},
    showResults(){playEffect('select');},
    destroy(){audio.disable();if(role==='student'){document.removeEventListener('pointerdown',activateStudentSound,true);document.removeEventListener('keydown',activateStudentSound,true);}if(toastTimer)clearTimeout(toastTimer);toggle?.parentElement?.remove();track.remove();toast.remove();}
  };
}
