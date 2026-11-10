// 기존 v0·v1·v2.1 규칙을 모두 포함하는 v3 통합 규칙.
import { makeRulesV2 } from './rules-v2.js';
export function makeRulesV3(uid) {
  if (!/^[a-zA-Z0-9_-]{10,128}$/.test(uid)) throw new Error('잘못된 교사 UID');
  const result = JSON.parse(makeRulesV2(uid));
  const teacher = `auth != null && auth.uid === '${uid}' && auth.token.firebase.sign_in_provider === 'google.com'`;
  const member = `auth != null && root.child('v2/rooms/' + $code + '/members/' + auth.uid + '/profile').exists()`;
  result.rules.v3 = {
    versionCheck: {'.read': teacher, '.write': false},
    // 문제 원본·정답은 교사 전용: v2/rooms의 넓은 멤버 읽기 규칙을 상속하지 않도록 완전히 분리합니다.
    privateRuns: {
      '$code': {
        '.read': teacher, '.write': teacher,
        '.validate': "newData.hasChildren(['setId','setTitle','questions','createdAt'])",
        '$other': {'.validate': true}
      }
    },
    // 교사가 정답을 제거한 단일 문제만 공개합니다.
    public: {
      '$code': {
        '.read': `${teacher} || (${member})`,
        '.write': teacher,
        '.validate': "newData.hasChildren(['state','index','total']) && (newData.child('state').val() === 'ready' || newData.child('state').val() === 'question' || newData.child('state').val() === 'paused' || newData.child('state').val() === 'reveal' || newData.child('state').val() === 'finished') && newData.child('index').isNumber() && newData.child('total').isNumber()",
        '$other': {'.validate': true}
      }
    },
    answers: {
      '$code': {
        '.read': teacher,
        '$round': {
          '$uid': {
            '.read': `${teacher} || (auth != null && auth.uid === $uid)`,
            '.write': `auth != null && auth.uid === $uid && auth.token.firebase.sign_in_provider === 'anonymous' && !data.exists() && newData.exists() && root.child('v2/rooms/' + $code + '/members/' + $uid + '/profile').exists() && root.child('v2/rooms/' + $code + '/meta/state').val() !== 'ended' && root.child('v3/public/' + $code + '/state').val() === 'question' && root.child('v3/public/' + $code + '/roundId').val() === $round && now >= root.child('v3/public/' + $code + '/startedAt').val() && now <= root.child('v3/public/' + $code + '/deadline').val()`,
            '.validate': "newData.hasChildren(['value','at']) && newData.child('value').isString() && newData.child('value').val().length >= 1 && newData.child('value').val().length <= 200 && newData.child('at').isNumber() && newData.child('at').val() <= now + 1000 && newData.child('at').val() >= now - 1000",
            value: {'.validate': "newData.isString() && newData.val().length >= 1 && newData.val().length <= 200"},
            at: {'.validate': "newData.isNumber()"},
            '$other': {'.validate': false}
          }
        }
      }
    },
    grades: {
      '$code': {
        '.read': teacher, '.write': teacher,
        '$round': {
          '$uid': {
            '.read': `${teacher} || (auth != null && auth.uid === $uid && root.child('v3/public/' + $code + '/state').val() !== 'question' && root.child('v3/public/' + $code + '/state').val() !== 'paused')`,
            '.validate': "newData.hasChildren(['correct','points','responseMs','answer','questionNumber']) && newData.child('correct').isBoolean() && newData.child('points').isNumber() && newData.child('responseMs').isNumber()",
            '$other': {'.validate': true}
          }
        }
      }
    },
    scores: {
      '$code': {
        '.read': `${teacher} || (${member})`,
        '.write': teacher,
        '$other': {'.validate': true}
      }
    }
  };
  return JSON.stringify(result, null, 2) + '\n';
}
