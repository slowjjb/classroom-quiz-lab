// Public build identifier: increment the build number on every protocol-changing release.
export const APP_VERSION = '6.0.0-alpha.26';
export const APP_BUILD = 622;
export function classifyVersion(latest,roomMinBuild=0){
  const requested=Number(roomMinBuild)||0;
  const published=Number(latest?.build)||0;
  const isValid=Number.isSafeInteger(published)&&published>0;
  const required=Math.max(requested,isValid?published:0);
  return {ok:isValid && APP_BUILD >= required,required,installed:APP_BUILD,installedVersion:APP_VERSION,latestVersion:String(latest?.version||''),roomMinBuild:requested};
}
export function joinUrlWithFreshCache(url,now=Date.now()){
  const result=new URL(url);
  result.searchParams.set('pkfresh',String(now));
  return result.toString();
}
