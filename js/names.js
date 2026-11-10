// v2.1 학생 이름의 단일 정규화 규칙. 브라우저와 정적 테스트에서 함께 사용합니다.
export function normalizeStudentName(value) {
  const name = String(value || '').normalize('NFKC').trim()
    .replace(/\s+/gu, ' ').toLocaleLowerCase('ko-KR');
  if (!name || name.length > 20) {
    throw new Error('가상 이름을 1~20자로 입력해 주세요.');
  }
  // Firebase Realtime Database의 금지된 경로 문자
  if (/[.#$\[\]\/\u0000-\u001f\u007f]/u.test(name)) {
    throw new Error('이름에는 . # $ [ ] / 문자를 사용할 수 없습니다.');
  }
  return name;
}
