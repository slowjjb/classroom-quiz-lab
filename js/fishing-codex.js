// Purplekit v5.0.11: game-scoped species collection display.
// Reads each student's existing public score; no extra Firebase subscription.
export function codexStats(creatures,records={}){
  const found=creatures.map(fish=>Number(records?.[fish.id]||0)>0);
  return {left:found.slice(0,14).filter(Boolean).length,right:found.slice(14).filter(Boolean).length,total:found.filter(Boolean).length};
}
export function createFishingCodex(left,right,creatures){
  left.replaceChildren();right.replaceChildren();
  const entries=[];
  for(const [index,fish] of creatures.entries()){
    const card=document.createElement('div');card.className='fishing-codex-card';
    card.dataset.found='false';card.dataset.tier=fish.tier;
    const img=document.createElement('img');img.src=`images/fishing/thumbs/${fish.id}.webp?v=6.0.0-alpha.10`;
    img.alt='아직 발견하지 못한 생물의 실루엣';img.loading='lazy';img.decoding='async';img.addEventListener('error',()=>{img.style.visibility='hidden';});
    const name=document.createElement('span');name.className='fishing-codex-card-name';name.textContent='???';
    const best=document.createElement('span');best.className='fishing-codex-card-best';best.textContent='-- kg';
    card.append(img,name,best);
    (index<14?left:right).append(card);
    entries.push({fish,card,img,name,best,weight:0});
  }
  return {entries,initialized:false};
}
export function updateFishingCodex(codex,records={}){
  if(!codex)return {left:0,right:0,total:0};
  for(const entry of codex.entries){
    const next=Math.max(0,Number(records?.[entry.fish.id]||0));
    if(next===entry.weight)continue;
    const previous=entry.weight;
    entry.weight=next;
    entry.card.dataset.found=next>0?'true':'false';
    entry.name.textContent=next>0?entry.fish.name:'???';
    entry.best.textContent=next>0?`최고 ${next.toFixed(1)}kg`:'-- kg';
    entry.img.alt=next>0?entry.fish.name:'아직 발견하지 못한 생물의 실루엣';
    if(codex.initialized&&next>previous){
      // Re-start the CSS animation without starting timers on every score update.
      entry.card.classList.remove('fishing-codex-flash','fishing-codex-record');
      void entry.card.offsetWidth;
      entry.card.classList.add(previous>0?'fishing-codex-record':'fishing-codex-flash');
    }
  }
  codex.initialized=true;
  return codexStats(codex.entries.map(e=>e.fish),records);
}
