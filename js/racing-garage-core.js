// Pure, deterministic v6 garage registry transition.
// No Firebase imports: safe to run with node --test offline.
const UID_RE=/^[A-Za-z0-9_-]{8,128}$/;
const CAR_RE=/^(0[1-9]|[12][0-9]|30)$/;
export function normalizedRacingGarage(raw){
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
 return {slots:{...object(raw?.slots)},byUid:{...object(raw?.byUid)},lastAction:{...object(raw?.lastAction)}};
}
export function applyCarRequest(previous,uid,request){
 if(typeof uid!=='string'||!UID_RE.test(uid))return undefined;
 const current=normalizedRacingGarage(previous),seq=Number(request?.seq||0);
 if(!Number.isSafeInteger(seq)||seq<=0||!['claim','cancel'].includes(request?.action))return undefined;
 if(seq<=Number(current.lastAction[uid]?.seq||0))return undefined;
 const held=current.byUid[uid]||null;
 let status,carId='00';
 if(request.action==='cancel'){
  if(held){
   if(current.slots[held]===uid)delete current.slots[held];
   delete current.byUid[uid];status='canceled';carId=held;
  }else status='not_selected';
 }else{
  const desired=request.carId;
  if(typeof desired!=='string'||!CAR_RE.test(desired))return undefined;
  carId=desired;
  if(held){status=held===desired?'selected':'cancel_first';carId=held;}
  else if(current.slots[desired])status='already_taken';
  else{current.slots[desired]=uid;current.byUid[uid]=desired;status='selected';}
 }
 current.lastAction[uid]={seq,status,carId};
 return current;
}
