import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import { firebaseConfig } from '../firebase-config.js';

const required = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'appId'];
export const isConfigured = required.every(key =>
  typeof firebaseConfig[key] === 'string' &&
  firebaseConfig[key].trim() !== '' &&
  !firebaseConfig[key].includes('YOUR_')
);

export const app = isConfigured ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getDatabase(app) : null;

export function formatError(error) {
  const code = error?.code || '';
  if (code === 'auth/unauthorized-domain') return 'Firebase 인증 > 설정 > 승인된 도메인에 현재 웹사이트 도메인을 추가해 주세요.';
  if (code === 'auth/operation-not-allowed') return 'Firebase Authentication에서 Google 및 익명 로그인 제공업체를 활성화해 주세요.';
  if (code === 'auth/popup-closed-by-user') return 'Google 로그인 창이 닫혔습니다. 다시 시도해 주세요.';
  if (code === 'auth/popup-blocked') return '팝업이 차단되었습니다. 브라우저의 팝업 허용을 확인해 주세요.';
  if (code === 'PERMISSION_DENIED' || code === 'permission_denied' || code === 'database/permission-denied') return '데이터베이스 접근이 거부되었습니다. 교사 UID와 보안 규칙을 확인해 주세요.';
  if (code === 'auth/network-request-failed' || code === 'database/network-error') return '네트워크 연결을 확인해 주세요.';
  return `${error?.message || '알 수 없는 오류'}${code ? ' (' + code + ')' : ''}`;
}
