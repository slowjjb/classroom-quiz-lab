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


// v4.4: 이미지 이름을 CSV에서 읽은 뒤 실제 GitHub Pages 파일을 HEAD로 확인합니다.
// 접근 장애(네트워크 오류, 403 등)는 404와 구별해 '확인 불가'로 표시합니다.
export async function probeQuestionImage(input, siteRoot, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  let safe;
  try { safe = normalizeQuestionImage(input, siteRoot); }
  catch (error) { return { status: 'invalid', reason: error.message, url: '' }; }
  if (!safe) return { status: 'none', reason: '', url: '' };
  const url = new URL(safe, siteRoot).href;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(url, { method: 'HEAD', cache: 'no-store', ...(controller ? { signal: controller.signal } : {}) });
    if (response.status === 404 || response.status === 410) return { status: 'missing', url, reason: '파일이 없습니다(HTTP ' + response.status + ').' };
    if (!response.ok) return { status: 'unverified', url, reason: '서버 응답 HTTP ' + response.status };
    const type = String(response.headers?.get?.('content-type') || '').toLowerCase();
    if (type.startsWith('image/')) return { status: 'exists', url, reason: '' };
    if (type.includes('text/html')) return { status: 'missing', url, reason: '이미지 대신 HTML 페이지가 반환되었습니다.' };
    return { status: 'unverified', url, reason: '이미지 형식 확인 불가: ' + (type || 'Content-Type 없음') };
  } catch (error) {
    return { status: 'unverified', url, reason: error?.name === 'AbortError' ? '요청 시간 초과' : '네트워크 연결 또는 브라우저 제한으로 확인하지 못했습니다.' };
  } finally { if (timeout !== null) clearTimeout(timeout); }
}

export async function scanQuestionImages(rows, siteRoot, { fetchImpl = fetch, concurrency = 5 } = {}) {
  const results = Array(rows.length);
  const memo = new Map();
  let next = 0;
  async function worker() {
    while (next < rows.length) {
      const index = next++;
      const input = String(rows[index].imageUrl || '').trim();
      if (!input) { results[index] = { index, status: 'none', input, line: rows[index].line }; continue; }
      let task = memo.get(input);
      if (!task) { task = probeQuestionImage(input, siteRoot, { fetchImpl }); memo.set(input, task); }
      results[index] = { index, input, line: rows[index].line, ...await task };
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), Math.max(1, rows.length)) }, worker));
  const counts = { exists: 0, missing: 0, unverified: 0, invalid: 0, none: 0 };
  for (const entry of results) counts[entry.status]++;
  return { results, counts, total: rows.length, checked: rows.length - counts.none };
}
