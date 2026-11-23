// v6 racing garage in the existing QR join lobby (no game movement yet).
import {db,formatError} from './firebase.js';
import {ref,onValue} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import {watchRacingCars,chosenCarFor,requestRacingCar,cancelRacingCar} from './racing-car-reservations.js';
const $=id=>document.getElementById(id);
const NAMES=['레드 포뮬러','블루 터보','옐로 머슬','핑크 하트','그린 오프로더','경찰차','소방차','구급차','네온 스피더','레인보우 버스','블랙 팬텀','퍼플 번개','랠리 23','탐험 지프','옐로 택시','아이스크림 트럭','광산 덤프트럭','몬스터 트럭','통신 차량','골드 잠수차','드래곤','페가수스','유니콘','늑대 탈것','황소 수레','해적선','달 탐사차','호버 바이크','마법 빗자루','허스키 썰매'];
let code='',uid='',garage=null,roomState='',gameState='',previewId=null,pendingSeq=0,unsubs=[],session=0,imagesLoading=null;
const id=n=>String(n).padStart(2,'0');
const note=(text,err=false)=>{const el=$('racing-lobby-status');if(el){el.textContent=text;el.dataset.kind=err?'error':'success'}};
function loadImages(){
 if(imagesLoading)return imagesLoading;
 imagesLoading=(async()=>{
  for(let i=1;i<=3;i++){
   if(i===1&&window.RACING_SPRITES?.[1])continue;
   if(i===2&&window.RACING_SPRITES?.[11])continue;
   if(i===3&&window.RACING_SPRITES?.[21])continue;
   await new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='racing-assets/part'+i+'.js';
    script.onload=resolve;script.onerror=()=>reject(new Error('탈것 '+i+'번 이미지 파일을 불러오지 못했습니다.'));
    document.head.append(script);
   });
  }
 })().catch(error=>{imagesLoading=null;throw error});
 return imagesLoading;
}
function render(){
 const container=$('racing-lobby');if(!container||container.hidden||!code)return;
 const locked=roomState!=='lobby'||gameState!=='lobby';
 const selected=chosenCarFor(garage,uid),taken=garage?.slots||{};
 const ack=garage?.lastAction?.[uid];
 if(pendingSeq&&Number(ack?.seq||0)>=pendingSeq){
  pendingSeq=0;
  if(ack.status==='selected'||ack.status==='canceled')previewId=null;
  const messages={selected:'자동차 선택 완료!',canceled:'선택을 취소했습니다. 다른 자동차를 고르세요.',already_taken:'친구가 먼저 선택한 자동차입니다.',cancel_first:'기존 자동차를 취소한 후 선택해 주세요.',not_selected:'현재 선택된 자동차가 없습니다.'};
  note(messages[ack.status]||'요청 처리 결과를 확인했습니다.',ack.status==='already_taken'||ack.status==='cancel_first');
 }
 const total=Object.keys(taken).length;
 $('racing-lobby-count').textContent=total+' / 30대 선택됨';
 $('racing-lobby-selected').textContent=selected?'내 탈것: '+id(Number(selected))+'번 · '+NAMES[Number(selected)-1]:'아직 확정한 탈것이 없습니다.';
 $('racing-lobby-cancel').disabled=Boolean(!selected||locked||pendingSeq);
 const gallery=$('racing-lobby-gallery');
 // Keep 30 image elements mounted. A full rebuild on every Firebase update
 // causes unnecessary base64 image decoding and lag on student phones.
 if(gallery.children.length!==30){
  gallery.replaceChildren();
  for(let i=1;i<=30;i++){
   const button=document.createElement('button');button.type='button';button.className='racing-car-choice';
   button.dataset.carId=id(i);
   const img=document.createElement('img');img.alt='';img.loading='lazy';
   const caption=document.createElement('span');button.append(img,caption);
   button.addEventListener('click',()=>{previewId=i;render()});
   gallery.append(button);
  }
 }
 for(let i=1;i<=30;i++){
  const number=id(i),owner=taken[number],mine=owner===uid,takenOther=Boolean(owner&&!mine);
  const button=gallery.children[i-1];
  button.dataset.taken=String(takenOther);button.setAttribute('aria-pressed',String(mine));
  button.disabled=locked||takenOther||Boolean(selected&&!mine)||Boolean(pendingSeq);
  const img=button.firstElementChild,nextSrc=window.RACING_SPRITES?.[i]||'';
  if(nextSrc&&img.src!==nextSrc)img.src=nextSrc;
  button.lastElementChild.textContent=number+' · '+(mine?'내 차':takenOther?'선택됨':NAMES[i-1]);
 }
 const allowed=Boolean(previewId&&!selected&&!taken[id(previewId)]&&!locked&&!pendingSeq);
 const preview=$('racing-lobby-preview');preview.hidden=!allowed;
 if(allowed){
  $('racing-lobby-preview-car').src=window.RACING_SPRITES?.[previewId]||'';
  $('racing-lobby-preview-label').textContent=id(previewId)+'번 · '+NAMES[previewId-1];
 }
 $('racing-lobby-confirm').disabled=!allowed;
 $('racing-lobby-lock').hidden=!locked;
}
async function confirmCar(){
 if(!code||!uid||!previewId||pendingSeq||roomState!=='lobby'||gameState!=='lobby')return;
 const selected=previewId;pendingSeq=Number.MAX_SAFE_INTEGER;
 note(id(selected)+'번 자동차 선택을 요청하고 있습니다…');render();
 try{
  const request=await requestRacingCar(db,code,uid,selected);
  pendingSeq=request.seq;
  // The teacher may have committed before the student's write finishes.
  if(Number(garage?.lastAction?.[uid]?.seq||0)>=pendingSeq){const a=garage.lastAction[uid];pendingSeq=0;if(a.status==='selected')previewId=null}
  render();
 }catch(error){pendingSeq=0;note('선택 요청 실패: '+formatError(error),true);render()}
}
async function cancelCar(){
 if(!code||!uid||pendingSeq||roomState!=='lobby'||gameState!=='lobby')return;
 if(!confirm('선택을 취소하면 다른 친구가 바로 이 자동차를 선택할 수 있습니다. 취소할까요?'))return;
 pendingSeq=Number.MAX_SAFE_INTEGER;
 try{
  const request=await cancelRacingCar(db,code,uid);
  pendingSeq=request.seq;
  if(Number(garage?.lastAction?.[uid]?.seq||0)>=pendingSeq)pendingSeq=0;
  note('선택 취소 요청을 보냈습니다. 교사 화면에서 처리하는 중입니다.');
  render();
 }catch(error){pendingSeq=0;note('선택 취소 실패: '+formatError(error),true);render()}
}
// Only an intentional lobby exit requests cancellation. A network disconnect
// or browser refresh must never release the car, so reconnect retains it.
export async function releaseRacingCarOnExplicitLeave(){
 if(!code||!uid||roomState!=='lobby'||gameState!=='lobby'||!chosenCarFor(garage,uid))return;
 try{await cancelRacingCar(db,code,uid)}
 catch(err){console.warn('레이싱 대기실 나가기: 자동차 선택 취소 요청 실패',err)}
}
export function stopRacingGarageView(){
 session++;
 for(const stop of unsubs){try{stop()}catch(_){}}
 unsubs=[];code='';uid='';garage=null;roomState='';gameState='';previewId=null;pendingSeq=0;
 const container=$('racing-lobby');if(container)container.hidden=true;
}
export function startRacingGarageView(newCode,newUid){
 stopRacingGarageView();
 code=newCode;uid=newUid;const token=session;
 $('racing-lobby').hidden=false;note('레이싱 자동차 선택 화면을 준비하고 있습니다.');
 $('racing-lobby-confirm').onclick=()=>void confirmCar();
 $('racing-lobby-cancel').onclick=()=>void cancelCar();
 unsubs.push(watchRacingCars(db,code,next=>{if(token!==session)return;garage=next;render()},e=>note('자동차 목록을 읽을 수 없습니다: '+formatError(e),true)));
 unsubs.push(onValue(ref(db,'v6/public/'+code),snap=>{if(token!==session)return;gameState=snap.val()?.state||'';render()},e=>note('레이싱 상태를 읽을 수 없습니다: '+formatError(e),true)));
 unsubs.push(onValue(ref(db,'v2/rooms/'+code+'/meta/state'),snap=>{if(token!==session)return;roomState=snap.val()||'';render()},e=>note('대기실 상태를 읽을 수 없습니다: '+formatError(e),true)));
 loadImages().then(()=>{if(token===session){note('탈것을 먼저 미리보고 선택 확정 버튼을 눌러 주세요.');render()}}).catch(e=>{if(token===session)note(formatError(e),true)});
}
