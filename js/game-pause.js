// Common pause presentation/clock helpers for individual-play modes.
// pauseStartedAt is a Firebase server timestamp, not a new game state.
export function gameIsPaused(publicState){return publicState?.state==='playing'&&Number(publicState?.pauseStartedAt||0)>0;}
export function gameRemainingSeconds(publicState,serverNow=Date.now()){
 const now=gameIsPaused(publicState)?Number(publicState.pauseStartedAt):serverNow;
 return Math.max(0,Math.ceil((Number(publicState?.endsAt||0)-now)/1000));
}
export function renderStudentPause(publicState,active=false){
 const id='purplekit-global-pause-overlay';
 let node=document.getElementById(id);
 if(!active||!gameIsPaused(publicState)){if(node)node.remove();return;}
 if(!node){
  node=document.createElement('div');node.id=id;
  Object.assign(node.style,{position:'fixed',inset:'0',zIndex:'2147483000',background:'rgba(13,19,36,.94)',
   display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'18px',
   color:'white',textAlign:'center',padding:'28px'});
  const heading=document.createElement('strong');heading.textContent='⏸️ 잠시 멈췄어요!';
  Object.assign(heading.style,{fontSize:'clamp(24px,5vw,42px)',lineHeight:'1.4'});
  const detail=document.createElement('p');detail.textContent='선생님이 게임을 일시정지했습니다. 다시 시작하면 이어서 플레이할 수 있어요.';
  Object.assign(detail.style,{fontSize:'clamp(16px,3vw,23px)',maxWidth:'680px',lineHeight:'1.6'});
  node.append(heading,detail);document.body.append(node);
 }
}
