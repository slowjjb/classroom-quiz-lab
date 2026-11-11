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

// v3.1: 교사가 정답 공개 이후에만 전송하는 문항별 공개 결과.
// 학생이 제출한 답안 원문이나 정답 목록은 포함하지 않습니다.
export function buildRoundReport(roundId, gradesForRound = {}, answersForRound = {}, roster = {}, cumulative = {}) {
  const rankMap = new Map(ranking(cumulative).map((item, i) => [item.uid, i + 1]));
  const entries = {};
  for (const [uid, nameValue] of Object.entries(roster)) {
    const name = typeof nameValue === 'string' ? nameValue : nameValue?.profile?.name;
    if (!name) continue;
    const grade = gradesForRound?.[uid];
    const submitted = !!answersForRound?.[uid];
    entries[uid] = {
      name: String(name),
      status: grade ? (grade.correct ? 'correct' : 'wrong') : (submitted ? 'pending' : 'missing'),
      points: grade ? Number(grade.points || 0) : 0,
      responseMs: grade ? Number(grade.responseMs || 0) : 0,
      cumulative: Number(cumulative?.[uid]?.score || 0),
      cumulativeCorrect: Number(cumulative?.[uid]?.correct || 0),
      cumulativeAnswered: Number(cumulative?.[uid]?.answered || 0),
      cumulativeMs: Number(cumulative?.[uid]?.totalMs || 0),
      cumulativeRank: Number(rankMap.get(uid) || 0)
    };
  }
  const values = Object.values(entries);
  return {
    roundId,
    submittedCount: values.filter(e => e.status !== 'missing').length,
    gradedCount: values.filter(e => e.status === 'correct' || e.status === 'wrong').length,
    correctCount: values.filter(e => e.status === 'correct').length,
    participantCount: values.length,
    entries
  };
}
