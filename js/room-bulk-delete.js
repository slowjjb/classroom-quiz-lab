// Purplekit v5.0.11 — one room's private/public quiz records must be removed
// together with its lobby and teacher-room index. Shared question sets survive.
export const ROOM_MODE_BUCKETS = Object.freeze({
  classic: Object.freeze(['privateRuns', 'public', 'answers', 'grades', 'scores']),
  gold: Object.freeze(['privateRuns', 'public', 'memberState', 'answers', 'picks', 'targets']),
  fishing: Object.freeze(['privateRuns', 'public', 'memberState', 'answers', 'actions'])
});
export const ROOM_MODE_PREFIX = Object.freeze({classic:'v3',gold:'v4',fishing:'v5'});
export const ACTIVE_GAME_STATES = Object.freeze(['ready', 'playing', 'question', 'paused', 'reveal']);

export function buildRoomDeletionUpdates(hostUid, code, mode) {
  if (!/^[a-zA-Z0-9_-]{10,128}$/.test(hostUid)) throw new Error('올바른 교사 계정이 필요합니다.');
  if (!/^\d{6}$/.test(code)) throw new Error('잘못된 게임 방 코드입니다.');
  const buckets = ROOM_MODE_BUCKETS[mode], prefix = ROOM_MODE_PREFIX[mode];
  if (!buckets || !prefix) throw new Error('지원되지 않는 게임 유형입니다.');
  const changes = {
    [`v2/rooms/${code}`]: null,
    [`v2/hostRooms/${hostUid}/${code}`]: null
  };
  for (const bucket of buckets) changes[`${prefix}/${bucket}/${code}`] = null;
  return changes;
}

// A room can still have a live game even when its lobby says '입장 마감'.
export function canSafelyDeleteRoom(room, gameState = '') {
  const meta = room?.meta;
  if (!meta || !ROOM_MODE_BUCKETS[meta.mode]) return {ok:false,reason:'방 정보가 없거나 지원되지 않는 게임입니다.'};
  if (ACTIVE_GAME_STATES.includes(gameState)) return {ok:false,reason:'게임이 아직 진행 중이거나 준비 중입니다.'};
  const hasConnections = Object.values(room?.members||{}).some(member=>
    Object.keys(member?.connections||{}).length > 0);
  if (hasConnections) return {ok:false,reason:'학생이 아직 접속 중입니다. 학생이 나간 뒤 다시 시도해 주세요.'};
  return {ok:true,reason:''};
}
