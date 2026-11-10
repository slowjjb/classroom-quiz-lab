// v3 클래식의 순수 계산 함수. 서버(교사 권한 실행 화면)와 테스트에서 재사용합니다.
export function normalizedAnswer(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR');
}
export function optionsArray(value) {
  if (Array.isArray(value)) return value.map(x => String(x ?? ''));
  if (!value || typeof value !== 'object') return [];
  return Object.keys(value).sort((a,b)=>Number(a)-Number(b)).map(k => String(value[k] ?? ''));
}
export function gradeAnswer(q, submittedValue, sentAt, startAt, deadline) {
  const choices = optionsArray(q.options);
  const typed = q.type === 'typing';
  const correct = typed
    ? choices.filter(Boolean).some(ans => normalizedAnswer(ans) === normalizedAnswer(submittedValue))
    : /^([1-4])$/.test(String(submittedValue)) && Number(submittedValue) === Number(q.correctIndex);
  const responseMs = Math.max(0, Math.round(Number(sentAt) - Number(startAt)));
  const limitMs = Math.max(1000, Number(q.timeLimit || 30) * 1000);
  const withinTime = Number(sentAt) >= Number(startAt) && Number(sentAt) <= Number(deadline);
  // 시험 단계: 기본 500점 + 남은 시간 보너스 최대 500점
  const points = correct && withinTime ? 500 + Math.round(500 * Math.max(0, 1 - Math.min(responseMs, limitMs) / limitMs)) : 0;
  return { correct: Boolean(correct && withinTime), points, responseMs, validTime: withinTime };
}
export function correctDisplay(q) {
  const choices = optionsArray(q.options);
  return q.type === 'typing' ? (choices.filter(Boolean).join(' / ') || '정답 없음') : `${Number(q.correctIndex)}번: ${choices[Number(q.correctIndex) - 1] || ''}`;
}
export function totalScores(gradeMap, members = {}) {
  const totals = {};
  for (const [uid, m] of Object.entries(members)) {
    if (!m?.profile?.name) continue;
    totals[uid] = { name: String(m.profile.name), score: 0, answered: 0, correct: 0, totalMs: 0 };
  }
  for (const round of Object.values(gradeMap || {})) {
    for (const [uid, grade] of Object.entries(round || {})) {
      if (!totals[uid]) continue;
      totals[uid].score += Number(grade.points || 0);
      totals[uid].answered += 1;
      totals[uid].correct += grade.correct ? 1 : 0;
      totals[uid].totalMs += Number(grade.responseMs || 0);
    }
  }
  return totals;
}
export function ranking(scoreMap) {
  return Object.entries(scoreMap || {}).map(([uid, entry]) => ({uid,...entry}))
    .sort((a,b)=>b.score-a.score || b.correct-a.correct || a.totalMs-b.totalMs || a.name.localeCompare(b.name,'ko'));
}
export function escapeCsv(value) {
  const text = String(value ?? '');
  // Excel/Sheets CSV 수식 주입 방지: 학생 이름·답안·문제에 임의의 수식이 들어와도 실행되지 않도록 처리
  const safe = /^[\s]*[=+\-@]/.test(text) ? "'" + text : text;
  return `"${safe.replace(/"/g,'""')}"`;
}
