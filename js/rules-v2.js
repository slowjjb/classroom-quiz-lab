// v2.1: v0/v1 보존 + 원자적 이름 선점 및 서버 규칙 검증을 추가합니다.
import { makeRules } from './rules.js';

export function makeRulesV2(uid) {
  const payload = JSON.parse(makeRules(uid));
  const teacher = `auth != null && auth.uid === '${uid}' && auth.token.firebase.sign_in_provider === 'google.com'`;
  const student = "auth != null && auth.uid === $uid && auth.token.firebase.sign_in_provider === 'anonymous'";
  const currentRoom = "root.child('v2/rooms/' + $code)";
  const nameOwner = "root.child('v2/rooms/' + $code + '/nameClaims/' + newData.child('name').val()).val() === auth.uid";
  const savedOwner = "root.child('v2/rooms/' + $code + '/nameClaims/' + root.child('v2/rooms/' + $code + '/members/' + $uid + '/profile/name').val()).val() === auth.uid";
  payload.rules.v2 = {
    // v2 구 규칙만 적용된 상태를 감지하기 위한 읽기 전용 버전 확인 경로
    versionCheck: { '.read': teacher, '.write': false },
    hostRooms: {
      '$hostUid': {
        '.read': `${teacher} && $hostUid === auth.uid`,
        '.write': `${teacher} && $hostUid === auth.uid`,
        '$code': {
          '.validate': "newData.hasChildren(['createdAt','title','state']) && newData.child('createdAt').isNumber() && newData.child('title').isString() && newData.child('title').val().length <= 80 && (newData.child('state').val() === 'lobby' || newData.child('state').val() === 'locked' || newData.child('state').val() === 'ended')",
          '$other': { '.validate': true }
        }
      }
    },
    rooms: {
      '$code': {
        '.read': `${teacher} || (auth != null && data.child('members').child(auth.uid).child('profile').exists())`,
        '.write': teacher,
        '.validate': "newData.hasChild('meta') && newData.child('meta').child('hostUid').val() === '" + uid + "'",
        meta: {
          '.read': 'auth != null',
          '.validate': "newData.hasChildren(['hostUid','createdAt','state','title','mode','setTitle']) && newData.child('hostUid').val() === '" + uid + "' && newData.child('createdAt').isNumber() && newData.child('title').isString() && newData.child('title').val().length <= 80 && (newData.child('state').val() === 'lobby' || newData.child('state').val() === 'locked' || newData.child('state').val() === 'ended') && newData.child('mode').isString() && newData.child('setTitle').isString()",
          '$other': { '.validate': true }
        },
        // 이름을 DB 키로 사용합니다. 영문은 소문자로 정규화하고, Firebase 금지 문자는 입력 단계에서 차단합니다.
        // 각 이름은 단일 UID만 선점할 수 있습니다. .read는 트랜잭션용이며 정답 데이터와 분리됩니다.
        nameClaims: {
          '$name': {
            '.read': "auth != null && auth.token.firebase.sign_in_provider === 'anonymous'",
            '.write': `${student.replace('auth.uid === $uid', 'auth.uid != null')} && (newData.exists() ? (newData.isString() && newData.val() === auth.uid && (data.val() === auth.uid || (!data.exists() && (${currentRoom}.child('meta/state').val() === 'lobby' || (${currentRoom}.child('members').child(auth.uid).child('profile/name').val() === $name && ${currentRoom}.child('meta/state').val() === 'locked'))))) : (data.val() === auth.uid && !${currentRoom}.child('members').child(auth.uid).child('profile').exists()))`,
            '.validate': "newData.isString() && newData.val() === auth.uid && $name.length >= 1 && $name.length <= 20"
          }
        },
        members: {
          '$uid': {
            profile: {
              '.read': student,
              '.write': `${student} && (!newData.exists() || ((${currentRoom}.child('meta/state').val() === 'lobby' || data.exists()) && ${nameOwner} && (!data.exists() || data.child('name').val() === newData.child('name').val())))`,
              '.validate': "newData.hasChildren(['name','joinedAt']) && newData.child('name').isString() && newData.child('name').val().length >= 1 && newData.child('name').val().length <= 20 && newData.child('joinedAt').isNumber()",
              name: { '.validate': 'newData.isString() && newData.val().length >= 1 && newData.val().length <= 20' },
              joinedAt: { '.validate': 'newData.isNumber()' },
              '$other': { '.validate': false }
            },
            connections: {
              '$session': {
                '.write': `${student} && (!newData.exists() || (${currentRoom}.child('members').child($uid).child('profile').exists() && ${savedOwner} && ${currentRoom}.child('meta/state').val() !== 'ended'))`,
                '.validate': 'newData.isNumber()'
              }
            }
          }
        }
      }
    }
  };
  return JSON.stringify(payload, null, 2) + '\n';
}
