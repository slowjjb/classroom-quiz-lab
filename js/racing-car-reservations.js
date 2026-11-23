// Purplekit Racing v6: trustworthy two-way garage in the existing RTDB.
// Students send car requests, but ONLY the authenticated teacher client
// commits the registry. All 30 cars + one car per UID are atomic together.
import {ref, get, set, onValue, runTransaction, serverTimestamp} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import {applyCarRequest,normalizedRacingGarage} from './racing-garage-core.js';

const CODE_RE=/^\d{6}$/;
const UID_RE=/^[A-Za-z0-9_-]{8,128}$/;
const CAR_RE=/^(0[1-9]|[12][0-9]|30)$/;
const ensureCode=code=>{const s=String(code||'');if(!CODE_RE.test(s))throw Error('참여 코드는 숫자 6자리여야 합니다.');return s};
const ensureUid=uid=>{if(typeof uid!=='string'||!UID_RE.test(uid))throw Error('유효한 학생 UID가 필요합니다.');return uid};
export const racingCarId=value=>{const n=Number(value);if(!Number.isInteger(n)||n<1||n>30)throw Error('자동차 번호는 1~30 사이여야 합니다.');return String(n).padStart(2,'0')};
export const emptyRacingGarage=()=>({slots:{},byUid:{},lastAction:{}});
const garagePath=code=>'v6/carRegistry/'+ensureCode(code);
const requestPath=code=>'v6/carRequests/'+ensureCode(code);
const normalizeGarage=normalizedRacingGarage;
export function watchRacingCars(db,code,onUpdate,onError){
 return onValue(ref(db,garagePath(code)),snapshot=>onUpdate(normalizeGarage(snapshot.val())),onError);
}
export async function getRacingCars(db,code){
 const snapshot=await get(ref(db,garagePath(code)));
 return normalizeGarage(snapshot.val());
}
export function chosenCarFor(garage,uid){return garage?.byUid?.[uid]||null}

// Student-side: submit an intent. Actual ownership changes only after the
// teacher processes it. This is how both uniqueness constraints are enforced.
export async function requestRacingCar(db,code,uid,carId){
 return sendRacingCarRequest(db,code,uid,'claim',racingCarId(carId));
}
export async function cancelRacingCar(db,code,uid){
 return sendRacingCarRequest(db,code,uid,'cancel','00');
}
async function sendRacingCarRequest(db,code,uid,action,carId){
 const path=requestPath(code)+'/'+ensureUid(uid),target=ref(db,path);
 for(let attempt=0;attempt<3;attempt++){
  const existing=(await get(target)).val();
  const seq=Math.max(Date.now(),Number(existing?.seq||0)+1);
  try{
   await set(target,{seq,action,carId,at:serverTimestamp()});
   return {seq,action,carId,status:'pending'};
  }catch(error){
   if(attempt===2)throw error;
  }
 }
}

// Teacher-side automatic coordinator: process requests sequentially.
// Multiple host tabs are safe because runTransaction retries conflicts.
export function watchRacingCarRequestsAsTeacher(db,code,onError=console.error){
 const room=ensureCode(code),requestsRef=ref(db,requestPath(room)),registryRef=ref(db,garagePath(room));
 let closed=false,processing=false,pending=null;
 const unsubscribe=onValue(requestsRef,snap=>{
  pending=snap.val()||{};
  if(!processing)void flush();
 },onError);
 async function flush(){
  processing=true;
  while(pending!==null&&!closed){
   const batch=pending;pending=null;
   try{
    const [meta,publicState,roster]=await Promise.all([
     get(ref(db,'v2/rooms/'+room+'/meta')),
     get(ref(db,'v6/public/'+room)),
     get(ref(db,'v2/rooms/'+room+'/members'))
    ]);
    if(meta.val()?.mode!=='racing'||meta.val()?.state!=='lobby'||publicState.val()?.state!=='lobby')continue;
    const members=roster.val()||{};
    const ordered=Object.entries(batch).sort((a,b)=>Number(a[1]?.at||0)-Number(b[1]?.at||0)||a[0].localeCompare(b[0]));
    for(const [uid,req] of ordered){
     if(closed)break;
     if(!UID_RE.test(uid)||!members[uid]?.profile)continue;
     await runTransaction(registryRef,current=>applyCarRequest(current,uid,req),{applyLocally:false});
    }
   }catch(error){onError(error)}
  }
  processing=false;
 }
 return ()=>{closed=true;unsubscribe()};
}
