/** Purplekit v5.0.10 Fishing podium: independent of Gold/Classic scoring. */
import {createAvatarImage} from './avatars.js';

export function renderFishingPodium(target, ranked=[]){
  if(!target)return;
  target.replaceChildren();
  if(!ranked.length)return;
  const podium=document.createElement('div');
  podium.className='arcade-podium';
  podium.setAttribute('aria-label','피싱 프렌지 최종 1~3위 시상대');
  // Display visually as 2nd - 1st - 3rd, preserving rank order in class names.
  for(const i of [1,0,2]){
    const entry=ranked[i];
    if(!entry)continue;
    const item=document.createElement('div');
    item.className=`arcade-podium-person position-${i+1}`;
    const medal=document.createElement('div');
    medal.className='arcade-podium-medal';
    medal.textContent=['🥇','🥈','🥉'][i];
    const name=document.createElement('strong');
    name.textContent=String(entry.name||'참가자');
    const weight=document.createElement('span');
    const kg=Number(entry.kg||0);
    weight.textContent=`${Number.isFinite(kg)?kg.toFixed(1):'0.0'} kg`;
    const base=document.createElement('div');
    base.className='arcade-podium-base';
    base.textContent=`${i+1}위`;
    item.append(medal,createAvatarImage(entry.avatarId,{size:'lg',decorative:true}),name,weight,base);
    podium.append(item);
  }
  target.append(podium);
}
