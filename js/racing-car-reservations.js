// Purplekit v6 racing lobby — Firebase RTDB car reservations (v6 only).
// Call ONLY after auth and room membership succeeded in existing join flow.
// This module never changes the v2 roster or v5 fishing/gold data.
import {ref, get, onValue, runTransaction} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';

const CODE_RE=/^\d{6}$/;
const CAR_RE=/^(0[1-9]|[12][0-9]|30)$/;
const ensureCode = code => {
  const s=String(code||'');
  if(!CODE_RE.test(s))throw new Error('참여 코드는 숫자 6자리여야 합니다.');
  return s;
};
export function racingCarId(value){
  const num=Number(value);
  if(!Number.isInteger(num)||num<1||num>30)throw new Error('자동차 번호는 1~30 사이여야 합니다.');
  return String(num).padStart(2,'0');
}
function slotsRef(db,code){return ref(db,'v6/carSlots/'+ensureCode(code))}
function slotRef(db,code,id){const carId=racingCarId(id);if(!CAR_RE.test(carId))throw Error('자동차 번호 오류');return ref(db,'v6/carSlots/'+ensureCode(code)+'/'+carId)}
function checkUid(uid){
  if(typeof uid!=='string'||uid.length<8||uid.length>128||/[^\w-]/.test(uid))throw new Error('학생 로그인 UID가 올바르지 않습니다.');
  return uid;
}
export function findOwnedCar(slots,uid){
  const found=Object.entries(slots||{}).filter(([,owner])=>owner===uid).map(([id])=>id).sort();
  return {id:found[0]||null,duplicates:found.slice(1)};
}
export function watchRacingCars(db,code,onUpdate,onError){
  if(typeof onUpdate!=='function')throw Error('onUpdate 콜백이 필요합니다.');
  return onValue(slotsRef(db,code),snapshot=>onUpdate(snapshot.val()||{}),onError);
}
export async function getRacingCars(db,code){
  const snap=await get(slotsRef(db,code));
  return snap.val()||{};
}
export async function claimRacingCar(db,code,uid,carId){
  const self=checkUid(uid),desired=racingCarId(carId),rooms=await getRacingCars(db,code);
  const assigned=findOwnedCar(rooms,self);
  if(assigned.duplicates.length)throw Error('내 계정으로 자동차가 여러 대 선점되어 있습니다. 교사에게 알려 주세요.');
  if(assigned.id&&assigned.id!==desired)throw Error('이미 선택한 자동차가 있습니다. 먼저 선택 취소를 눌러 주세요.');
  const result=await runTransaction(slotRef(db,code,desired),current=>{
    if(current===null||current===self)return self;
    return undefined;
  },{applyLocally:false});
  if(!result.committed||result.snapshot.val()!==self)throw Error('다른 친구가 먼저 선택한 자동차입니다. 다른 자동차를 골라 주세요.');
  return {carId:desired,ownerUid:self};
}
export async function cancelRacingCar(db,code,uid,carId){
  const self=checkUid(uid),selected=racingCarId(carId);
  const result=await runTransaction(slotRef(db,code,selected),current=>{
    if(current===self)return null;
    return undefined;
  },{applyLocally:false});
  if(!result.committed)throw Error('현재 자동차의 소유자이 아니거나, 경기 시작으로 변경이 잠겼습니다.');
  return selected;
}
// A racing car is deliberately NOT cleared by onDisconnect.
// This preserves the player's car across refresh and temporary network loss.
