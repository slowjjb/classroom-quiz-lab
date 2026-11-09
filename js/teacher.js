import { auth, db, isConfigured, formatError } from './firebase.js';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { onValue, ref } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';

const $ = id => document.getElementById(id);
const loginBtn = $('login-btn');
const logoutBtn = $('logout-btn');
let unsubscribePresence = null;

function message(id, value, kind = '') {
  $(id).textContent = value;
  $(id).dataset.kind = kind;
}
function badge(value, kind) {
  $('auth-badge').textContent = value;
  $('auth-badge').className = `pill pill-${kind}`;
}
function renderStudents(snapshot) {
  const people = [];
  const data = snapshot.val() || {};
  for (const [uid, connections] of Object.entries(data)) {
    for (const session of Object.values(connections || {})) {
      if (session && typeof session.name === 'string') people.push({ uid, name: session.name, at: session.connectedAt || 0 });
    }
  }
  const unique = new Map();
  for (const p of people.sort((a, b) => a.at - b.at)) unique.set(p.uid, p);
  $('student-count').textContent = `${unique.size}명`;
  message('db-message', `실시간 연결 정상 · ${unique.size}명 / ${people.length}개 접속 세션`, 'success');
  const list = $('student-list');
  list.replaceChildren();
  if (unique.size === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '현재 접속 중인 가상 학생이 없습니다. 학생 화면에서 입장해 주세요.';
    list.append(empty);
    return;
  }
  let i = 1;
  for (const person of unique.values()) {
    const item = document.createElement('div'); item.className = 'student-item';
    const avatar = document.createElement('span'); avatar.className = 'student-avatar'; avatar.textContent = String(i++);
    const name = document.createElement('span'); name.textContent = person.name;
    item.append(avatar, name); list.append(item);
  }
}
function stopPresence() {
  if (unsubscribePresence) { unsubscribePresence(); unsubscribePresence = null; }
  $('student-count').textContent = '0명';
  $('student-list').replaceChildren();
}

if (!isConfigured) {
  badge('설정 필요', 'error');
  message('auth-message', 'firebase-config.js에 Firebase 웹 앱 설정을 입력해 주세요.', 'error');
  message('db-message', '연결 전입니다.');
} else {
  loginBtn.disabled = false;
  loginBtn.addEventListener('click', async () => {
    loginBtn.disabled = true;
    message('auth-message', 'Google 로그인을 진행하고 있습니다.');
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (error) { message('auth-message', formatError(error), 'error'); }
    finally { loginBtn.disabled = false; }
  });
  logoutBtn.addEventListener('click', async () => {
    try { stopPresence(); await signOut(auth); }
    catch (error) { message('auth-message', formatError(error), 'error'); }
  });
  $('copy-btn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('teacher-uid').textContent); message('auth-message', 'UID를 복사했습니다. Firebase 보안 규칙의 TEACHER_UID_HERE 자리에 넣어 주세요.', 'success'); }
    catch (_) { message('auth-message', '자동 복사가 실패했습니다. 아래 UID 문자열을 직접 선택해 복사해 주세요.', 'error'); }
  });
  onAuthStateChanged(auth, user => {
    stopPresence();
    const googleUser = user && user.providerData.some(p => p.providerId === 'google.com');
    loginBtn.hidden = Boolean(googleUser);
    logoutBtn.hidden = !googleUser;
    $('uid-box').hidden = !googleUser;
    if (!googleUser) {
      badge('로그인 필요', 'neutral');
      message('auth-message', '교사 Google 계정으로 로그인해 주세요.');
      message('db-message', '로그인 및 보안 규칙 설정 후 조회할 수 있습니다.');
      return;
    }
    $('teacher-uid').textContent = user.uid;
    badge('Google 로그인', 'success');
    message('auth-message', 'Google 인증 완료. 데이터베이스 교사 권한을 확인하는 중입니다.');
    unsubscribePresence = onValue(ref(db, 'v0/presence'), snapshot => {
      badge('교사 권한 확인', 'success');
      message('auth-message', '교사 인증 및 데이터베이스 읽기 권한 확인 완료.', 'success');
      renderStudents(snapshot);
    }, error => {
      badge('권한 설정 필요', 'error');
      message('auth-message', 'Google 인증은 완료했습니다. 아래 UID를 보안 규칙에 등록해 주세요.', 'error');
      message('db-message', formatError(error), 'error');
    });
  }, error => message('auth-message', formatError(error), 'error'));
}
