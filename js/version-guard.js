import {APP_VERSION,APP_BUILD,classifyVersion,joinUrlWithFreshCache} from './version.js?v=6.0.0-alpha.23';

let latestCheck=null;
// Independently published plain JSON, requested with a unique URL so an old open tab
// can learn about updates without reloading its already-cached JavaScript.
export async function checkPublishedVersion(){
  const url=new URL('../version.json',import.meta.url);
  url.searchParams.set('t',String(Date.now()));
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw new Error(`최신 버전 정보 확인 실패 (HTTP ${response.status}). 다시 시도해 주세요.`);
  const info=await response.json();
  if(!Number.isSafeInteger(info?.build)||info.build<=0||typeof info.version!=='string'){
    throw new Error('최신 버전 정보가 올바르지 않습니다. 배포 파일의 version.json을 확인해 주세요.');
  }
  latestCheck=info;
  return info;
}
export function checkRoomVersion(meta,latest=latestCheck){
  const minBuild=Number(meta?.minClientBuild)||0;
  const report=classifyVersion(latest,minBuild);
  return {...report,roomMinVersion:String(meta?.minClientVersion||'')};
}
export function showOutdatedNotice(element,report){
  if(!element)return;
  const current=APP_VERSION;
  const required=report?.roomMinVersion||report?.latestVersion||`빌드 ${report?.required||'최신'}`;
  element.querySelector('[data-version-current]').textContent=`v${current}`;
  element.querySelector('[data-version-required]').textContent=/^v/i.test(required)?required:`v${required}`;
  element.hidden=false;
}
export function openFreshPage(url=location.href){
  location.replace(joinUrlWithFreshCache(url));
}
export {APP_VERSION,APP_BUILD};
