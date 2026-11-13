// 퍼플킷 v3.13 · 교사용 정답률 분석. Firebase 전송·채점과 분리된 순수 계산 계층.
export function percent(correct, total) {
  if (!Number.isFinite(Number(total)) || Number(total) <= 0) return null;
  return Math.round(Math.min(100, Math.max(0, 100 * Number(correct || 0) / Number(total))));
}
export function accuracyTier(value) {
  if (value === null || !Number.isFinite(value)) return 'none';
  if (value >= 75) return 'high';
  if (value > 50) return 'mid';
  return 'low';
}

export function buildClassAccuracy({grades = {}, roster = {}, questions = [], completedCount = 0} = {}) {
  const totalQuestions = Math.max(0, Math.min(questions.length, Math.floor(Number(completedCount) || 0)));
  const participants = Object.entries(roster || {}).map(([uid, member]) => {
    const name = typeof member === 'string' ? member : member?.profile?.name;
    if (!name) return null;
    let correct = 0, answered = 0;
    for (let index = 0; index < totalQuestions; index++) {
      const grade = grades?.[`q${index + 1}`]?.[uid];
      if (grade) { answered++; if (grade.correct === true) correct++; }
    }
    const rate = percent(correct, totalQuestions);
    return {uid, name: String(name), correct, answered, total: totalQuestions, rate, tier: accuracyTier(rate)};
  }).filter(Boolean).sort((a,b) => (b.rate ?? -1)-(a.rate ?? -1) || b.correct-a.correct || a.name.localeCompare(b.name, 'ko'));
  const participantCount = participants.length;
  const questionsStats = questions.slice(0, totalQuestions).map((q,index) => {
    const round = grades?.[`q${index + 1}`] || {};
    const uids = new Set(participants.map(p => p.uid));
    let correct = 0, graded = 0;
    for (const [uid, grade] of Object.entries(round)) {
      if (!uids.has(uid) || !grade) continue;
      graded++;
      if (grade.correct === true) correct++;
    }
    const rate = percent(correct, participantCount);
    return {index:index+1, originalNumber:q.number ?? index+1, prompt:String(q.prompt || ''),
      correct, graded, total:participantCount, rate, tier:accuracyTier(rate)};
  });
  return {totalQuestions, participantCount, participants, questions:questionsStats};
}
