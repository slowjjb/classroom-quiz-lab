// v3.2 문제 이미지: 공개 GitHub Pages의 이미지 전용 폴더만 허용합니다.
// URL이 아닌 파일명 또는 상대 경로도 입력 가능합니다.
export function normalizeQuestionImage(input, siteRoot) {
  const value=String(input??'').trim();
  if(!value)return '';
  const root=new URL(siteRoot);
  const dir=new URL('images/questions/',root);
  let candidate;
  try {
    if(/^https?:\/\//i.test(value)) candidate=new URL(value);
    else if(/^[^/?#\\]+\.(png|jpe?g|webp)$/i.test(value)) candidate=new URL('images/questions/'+encodeURIComponent(value),root);
    else if(value.startsWith('images/questions/')) candidate=new URL(value,root);
    else throw new Error('파일명 또는 images/questions/ 상대 경로를 입력해 주세요.');
  }catch(error){throw new Error('이미지 주소 형식을 확인해 주세요. '+error.message);}
  const pathname=candidate.pathname;
  if(candidate.origin!==dir.origin || !pathname.startsWith(dir.pathname) || candidate.search || candidate.hash)
    throw new Error('이미지는 이 퀴즈 사이트의 images/questions 폴더에 있어야 합니다.');
  let name;
  try{name=decodeURIComponent(pathname.slice(dir.pathname.length));}
  catch{throw new Error('이미지 파일명의 문자 인코딩을 확인해 주세요.');}
  if(!name || /[/\\?#\x00-\x1f]/.test(name) || !/\.(png|jpe?g|webp)$/i.test(name))
    throw new Error('PNG, JPG, JPEG, WebP 형식의 파일 한 개만 지정해 주세요.');
  return 'images/questions/'+encodeURIComponent(name);
}
export function siteRootFromPage(href){return new URL('./',href).href;}
export function fullQuestionImageUrl(path,pageHref){
  const root=siteRootFromPage(pageHref);
  const validated=normalizeQuestionImage(path,root);
  return validated?new URL(validated,root).href:'';
}
