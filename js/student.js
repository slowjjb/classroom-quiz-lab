import { auth, db, isConfigured, formatError } from './firebase.js';
import { browserLocalPersistence, setPersistence, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { onValue, ref, push, set, remove, onDisconnect, serverTimestamp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';

const $ = id => document.getElementById(id);
const joinBtn = $('join-btn');
const leaveBtn = $('leave-btn');
const nameInput = $('nickname');
const NAME_KEY = 'quizlab-v0-test-name';
const ACTIVE_KEY = 'quizlab-v0-auto-join';
let unsubscribeConnected = null;
let sessionRef = null;
let joining = false;
let active = false;
let liveUser = null;

nameInput.value = localStorage.getItem(NAME_KEY) || '';
function feedback(value, kind = '') { $('student-message').textContent = value; $('student-message').dataset.kind = kind; }
function status(value, connected = false) {
  $('connection-label').textContent = value;
  $('connection-dot').classList.toggle('connected', connected);
}
function uiActive(connected) {
  active = connected;
  joinBtn.hidden = connected;
  leaveBtn.hidden = !connected;
  nameInput.disabled = connected;
}
function normalizedName() {
  const name = nameInput.value.trim();
  if (!name || name.length > 20 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('테스트 이름을 1~20자로 입력해 주세요.');
  return name;
}
async function leave() {
  sessionStorage.removeItem(ACTIVE_KEY);
  if (unsubscribeConnected) { unsubscribeConnected(); unsubscribeConnected = null; }
  if (sessionRef) {
    const old = sessionRef; sessionRef = null;
    // 연결이 살아 있다면 제거하고, 오프라인이면 서버에 설정된 onDisconnect가 처리하게 둡니다.
    try { await remove(old); await onDisconnect(old).cancel(); }
    catch (error) { feedback('종료 처리를 바로 완료하지 못했습니다. 서버에서 끊김을 감지하면 명단에서 제외합니다. ' + formatError(error), 'error'); }
  }
  liveUser = null;
  uiActive(false);
  status('연결을 종료했어요');
  if ($('student-message').dataset.kind !== 'error') feedback('다시 참가할 수 있어요.');
}
async function join() {
  if (!isConfigured || joining || active) return;
  joining = true; joinBtn.disabled = true;
  try {
    const name = normalizedName();
    localStorage.setItem(NAME_KEY, name);
    feedback('인증 중이에요…');
    await setPersistence(auth, browserLocalPersistence);
    if (auth.currentUser && !auth.currentUser.isAnonymous) throw new Error('같은 브라우저에서 교사 계정이 로그인되어 있습니다. 학생 테스트는 시크릿 창에서 열어 주세요.');
    const user = auth.currentUser || (await signInAnonymously(auth)).user;
    liveUser = user;
    sessionStorage.setItem(ACTIVE_KEY, 'yes');
    uiActive(true);
    status('서버 연결을 기다리는 중…');
    if (unsubscribeConnected) unsubscribeConnected();
    unsubscribeConnected = onValue(ref(db, '.info/connected'), async snapshot => {
      if (!active || liveUser?.uid !== user.uid) return;
      if (snapshot.val() !== true) {
        sessionRef = null;
        status('인터넷 연결이 끊어졌어요');
        feedback('연결이 복구되면 자동으로 다시 참가합니다.');
        return;
      }
      const current = push(ref(db, `v0/presence/${user.uid}`));
      try {
        // 중단 시 자동 삭제 예약 → 그 후 입장 기록 저장 (순서가 중요합니다).
        await onDisconnect(current).remove();
        await set(current, { name, connectedAt: serverTimestamp() });
        if (!active) { await remove(current); return; }
        sessionRef = current;
        status('실시간 연결 성공!', true);
        feedback('교사 화면의 가상 학생 목록에 나타나는지 확인해 보세요.', 'success');
      } catch (error) {
        status('데이터베이스 연결 실패');
        feedback(formatError(error), 'error');
        try { await onDisconnect(current).cancel(); } catch (_) {}
      }
    }, error => { status('연결 오류'); feedback(formatError(error), 'error'); });
  } catch (error) {
    sessionStorage.removeItem(ACTIVE_KEY);
    feedback(formatError(error), 'error');
    status('입장 실패');
    uiActive(false);
  } finally { joining = false; joinBtn.disabled = false; }
}
if (!isConfigured) {
  feedback('firebase-config.js의 설정을 먼저 완료해 주세요.', 'error');
  status('Firebase 설정 필요');
} else {
  joinBtn.disabled = false;
  joinBtn.addEventListener('click', join);
  leaveBtn.addEventListener('click', leave);
  // 새로고침을 하더라도 이 탭에서 참여 중이었다면 자동으로 재접속합니다.
  onAuthStateChanged(auth, user => {
    if (!active && !joining && user?.isAnonymous && sessionStorage.getItem(ACTIVE_KEY) === 'yes') join();
  }, error => feedback(formatError(error), 'error'));
}
