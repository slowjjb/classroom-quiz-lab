// Teacher-only Racing results. Raw answer logs stay in v6/privateRuns.
import {createAvatarImage} from './avatars.js';
import {buildGoldAccuracy} from './gold-analytics.js';
const rateTier=rate=>rate>=75?'high':rate>=50?'mid':'low';
import {racingStandings} from './racing-game-core.js';
const $=id=>document.getElementById(id);
let lastPodium='';
function addText(parent,tag,value,cls=''){
 const node=document.createElement(tag);if(cls)node.className=cls;
 node.textContent=String(value);parent.append(node);return node;
}
function carImage(id){
 const img=document.createElement('img');
 img.className='racing-result-car';img.alt='선택한 자동차 '+String(id||'');
 const sprite=window.RACING_SPRITES?.[Number(id)];
 if(sprite)img.src=sprite;
 else img.alt='자동차 이미지 불러오는 중';
 return img;
}
function podium(target,ranked){
 const signature=JSON.stringify(ranked.slice(0,3).map(x=>[x.uid,x.avatarId,x.carId,x.name,x.meters]));
 if(signature===lastPodium)return;
 lastPodium=signature;target.replaceChildren();
 const board=document.createElement('div');board.className='arcade-podium racing-result-podium';
 for(const i of [1,0,2]){
  const player=ranked[i];if(!player)continue;
  const person=document.createElement('div');person.className='arcade-podium-person position-'+(i+1);
  addText(person,'div',['🥇','🥈','🥉'][i],'arcade-podium-medal');
  const pair=document.createElement('div');pair.className='racing-result-pair';
  pair.append(createAvatarImage(player.avatarId||'a01',{size:'lg',decorative:true}),carImage(player.carId));
  person.append(pair);
  addText(person,'strong',player.name||'참가자');
  addText(person,'span',Number(player.meters||0)+'m · 정답 '+Number(player.correct||0)+'개');
  addText(person,'div',(i+1)+'위','arcade-podium-base');
  board.append(person);
 }
 target.append(board);
}
function resultRow(parent,header,main,sub,rank='',rate=null){
 const row=document.createElement('div');row.className='racing-result-row';
 if(rate!==null)row.dataset.tier=rateTier(rate);
 const head=document.createElement('div');head.className='racing-result-row-head';
 if(rank)addText(head,'b',rank,'racing-result-mark');
 addText(head,'span',header,'racing-result-name');
 addText(head,'strong',main,'racing-result-value');
 row.append(head);addText(row,'small',sub);
 if(rate!==null){
  const track=document.createElement('div');track.className='racing-result-rate-track';
  const fill=document.createElement('span');fill.className='racing-result-rate-fill';
  fill.style.width=Math.max(0,Math.min(100,rate))+'%';
  track.append(fill);row.append(track);
 }
 parent.append(row);
}
export function renderRacingFinalResults({run,pub,mode='first',members={}}={}){
 const finished=pub?.state==='finished';
 const box=$('racing-final-results');if(!box)return;
 box.hidden=!finished;
 $('racing-play-ranking').hidden=finished;
 $('racing-play-footer').hidden=finished;
 $('racing-play-focus-toggle').textContent=finished?'🏆 결과 화면 크게 보기':'🏁 경주 상황판 크게 보기';
 if(!finished||!run)return;
 const rank=racingStandings(pub.scores||{}).map(p=>({...p,avatarId:p.avatarId||members?.[p.uid]?.profile?.avatarId||'a01'}));
 const roster=run.roster||{};
 const results=buildGoldAccuracy({roster,scores:pub.scores||{},questions:run.questions||[],answersLog:run.answersLog||{},mode});
 const count=results.summary;
 $('racing-results-summary').textContent=rank.length+'명 참가 · '+(mode==='first'?'첫 시도':'전체 시도')+' 정답 '+count.correct+'/'+count.total+'회 · 전체 정답률 '+(count.rate===null?'자료 없음':count.rate+'%');
 podium($('racing-results-podium'),rank);
 const ranks=$('racing-results-ranking'),students=$('racing-results-students'),questions=$('racing-results-questions');
 ranks.replaceChildren();students.replaceChildren();questions.replaceChildren();
 rank.forEach((p,i)=>{
  const row=document.createElement('div');row.className='racing-result-row';
  const head=document.createElement('div');head.className='racing-result-row-head';
  addText(head,'b',i<3?['🥇','🥈','🥉'][i]:(i+1)+'위','racing-result-mark');
  const car=carImage(p.carId);car.classList.add('racing-result-car-small');head.append(car);
  addText(head,'span',p.name,'racing-result-name');
  addText(head,'strong',Number(p.meters||0)+'m','racing-result-value');
  row.append(head);addText(row,'small','정답 '+Number(p.correct||0)+'회 / 풀이 '+Number(p.answered||0)+'회 · 차량 '+String(p.carId));
  ranks.append(row);
 });
 results.students.forEach((p,i)=>resultRow(students,p.name,p.rate===null?'—':p.rate+'%',
  p.correct+'/'+p.total+'회 정답 · 전체 풀이 '+p.attempts+'회',String(i+1),p.rate));
 results.questions.forEach(p=>resultRow(questions,p.number+'번. '+p.prompt,p.rate===null?'—':p.rate+'%',
  p.correct+'/'+p.total+'회 정답 · 참여 '+p.students+'명',String(p.number),p.rate));
 $('racing-results-learning-note').textContent=mode==='first'?'같은 문항을 여러 번 풀어도 첫 제출만 집계합니다.':'같은 문항에 대한 반복 제출도 모두 집계합니다.';
}
export function resetRacingFinalResults(){
 lastPodium='';
 const box=$('racing-final-results');if(box)box.hidden=true;
 const ranking=$('racing-play-ranking');if(ranking)ranking.hidden=false;
 const footer=$('racing-play-footer');if(footer)footer.hidden=false;
}
