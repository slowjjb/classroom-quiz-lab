// Pure calculations; testable without a browser or a Firebase connection.
export const ALLOWED_COUNTS = Object.freeze([5, 15, 30]);
export function validateCount(value) {
  const n = Number(value);
  if (!ALLOWED_COUNTS.includes(n)) throw new Error('테스트 인원은 5, 15, 30명 중에서 선택해 주세요.');
  return n;
}
export function percentile(values, percent) {
  const sorted = values.filter(v => Number.isFinite(v) && v >= 0).slice().sort((a,b)=>a-b);
  if (!sorted.length) return null;
  const rank = Math.ceil(percent * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(rank, sorted.length-1))];
}
export function summarizeRecords(records, members) {
  const joined = records.filter(r => r.state === 'online' || r.state === 'reconnected' || r.state === 'offline');
  const failed = records.filter(r => r.state === 'failed');
  const times = records.map(r => r.joinMs).filter(x=>Number.isFinite(x) && x>=0);
  const allMembers = Object.entries(members || {}).filter(([,v])=>v?.profile?.name);
  const active = allMembers.filter(([,v])=>Object.keys(v.connections || {}).length > 0);
  const uids = new Set(allMembers.map(([uid])=>uid));
  const names = new Set(allMembers.map(([,v])=>v.profile.name));
  const sessions = active.reduce((n,[,v])=>n+Object.keys(v.connections||{}).length,0);
  return {
    joined: joined.length, failed: failed.length, active: active.length,
    memberCount: allMembers.length, sessionCount: sessions,
    uniqueUids: uids.size, uniqueNames: names.size,
    avgMs: times.length ? Math.round(times.reduce((a,b)=>a+b,0)/times.length) : null,
    p95Ms: percentile(times, 0.95)
  };
}
export function isCleanPass(stats, expected) {
  return stats.joined === expected && stats.failed === 0 &&
    stats.active === expected && stats.memberCount === expected &&
    stats.uniqueUids === expected && stats.uniqueNames === expected && stats.sessionCount === expected;
}
export function csvField(value) {
  const s=String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s;
}
