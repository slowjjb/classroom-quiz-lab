// v0/v1의 검증된 권한을 그대로 보존하고 v2 대기실 경로만 추가합니다.
import { makeRules } from './rules.js';

export function makeRulesV2(uid) {
  const payload = JSON.parse(makeRules(uid));
  const teacher = `auth != null && auth.uid === '${uid}' && auth.token.firebase.sign_in_provider === 'google.com'`;
  const student = "auth != null && auth.uid === $uid && auth.token.firebase.sign_in_provider === 'anonymous'";
  const currentRoom = "root.child('v2/rooms/' + $code)";
  payload.rules.v2 = {
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
        members: {
          '$uid': {
            profile: {
              '.read': student,
              '.write': `${student} && ${currentRoom}.child('meta/state').val() === 'lobby'`,
              '.validate': "newData.hasChildren(['name','joinedAt']) && newData.child('name').isString() && newData.child('name').val().length >= 1 && newData.child('name').val().length <= 20 && newData.child('joinedAt').isNumber()",
              name: { '.validate': 'newData.isString() && newData.val().length >= 1 && newData.val().length <= 20' },
              joinedAt: { '.validate': 'newData.isNumber()' },
              '$other': { '.validate': false }
            },
            connections: {
              '$session': {
                '.write': `${student} && (!newData.exists() || (${currentRoom}.child('members').child($uid).child('profile').exists() && ${currentRoom}.child('meta/state').val() !== 'ended'))`,
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
