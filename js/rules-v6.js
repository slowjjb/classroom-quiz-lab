// Purplekit v6 — additive Firebase Realtime Database security rules.
// Always publish the COMPLETE generated document (v0-v6). Never publish only "v6".
import {makeRulesV5} from './rules-v5.js';

export function addRacingV6Rules(existingRules, teacherUid) {
  if (!teacherUid || !/^[A-Za-z0-9_-]{8,128}$/.test(teacherUid)) throw new Error('Firebase 교사 UID를 확인해 주세요.');
  const teacher = `auth != null && auth.uid === '${teacherUid}' && auth.token.firebase.sign_in_provider === 'google.com'`;
  const member = "auth != null && root.child('v2/rooms/' + $code + '/members/' + auth.uid + '/profile').exists()";
  const own = "auth != null && auth.uid === $uid && auth.token.firebase.sign_in_provider === 'anonymous'";
  const isRacing = "root.child('v2/rooms/' + $code + '/meta/mode').val() === 'racing'";
  const isLobby = "root.child('v2/rooms/' + $code + '/meta/state').val() === 'lobby' && root.child('v6/public/' + $code + '/state').val() === 'lobby'";
  const playing = "root.child('v6/public/' + $code + '/state').val() === 'playing'";
  const memberOwn = `(${own}) && root.child('v2/rooms/' + $code + '/members/' + $uid + '/profile').exists()`;
  const time = "newData.child('at').isNumber() && newData.child('at').val() >= now - 1000 && newData.child('at').val() <= now + 1000";
  existingRules.rules.v6 = {
    versionCheck: {'.read': teacher, '.write': false},
    // Gold/Fishing-style teacher-authoritative private questions and ranking.
    privateRuns: {'$code': {'.read': teacher, '.write': teacher, '$other': {'.validate': true}}},
    public: {'$code': {
      '.read': `${teacher} || (${member})`,
      '.write': teacher,
      '.validate': "newData.hasChildren(['state','finishMeters']) && (newData.child('state').val() === 'lobby' || newData.child('state').val() === 'playing' || newData.child('state').val() === 'finished') && newData.child('finishMeters').isNumber() && newData.child('finishMeters').val() >= 20 && newData.child('finishMeters').val() <= 100 && newData.child('finishMeters').val() % 5 === 0",
      state: {'.validate': "newData.isString() && (newData.val() === 'lobby' || newData.val() === 'playing' || newData.val() === 'finished')"},
      finishMeters: {'.validate': "newData.isNumber() && newData.val() >= 20 && newData.val() <= 100 && newData.val() % 5 === 0"},
      '$other': {'.validate': true}
    }},
    // Atomic reservation at each car slot. A claimed car stays with its UID
    // after refresh/disconnect. A legitimate player can cancel while in lobby.
    // This prevents TWO DIFFERENT players taking one car; "one car per UID"
    // across multiple simultaneous tabs requires trusted coordinator validation.
    carSlots: {'$code': {
      '.read': `${teacher} || (${member})`,
      '.write': teacher,
      '$carId': {
        '.write': `(${member}) && auth.token.firebase.sign_in_provider === 'anonymous' && (${isRacing}) && (${isLobby}) && $carId.matches(/^(0[1-9]|[12][0-9]|30)$/) && ((newData.exists() && newData.isString() && newData.val() === auth.uid && (!data.exists() || data.val() === auth.uid)) || (!newData.exists() && data.val() === auth.uid))`,
        '.validate': "newData.isString() && newData.val() === auth.uid && $carId.matches(/^(0[1-9]|[12][0-9]|30)$/)"
      }
    }},
    memberState: {'$code': {
      '.read': teacher, '.write': teacher,
      '$uid': {
        '.read': `${teacher} || (${own})`,
        '.write': teacher,
        '.validate': "newData.hasChildren(['phase','nonce','questionIndex','correct','answered']) && newData.child('phase').isString() && newData.child('nonce').isString() && newData.child('questionIndex').isNumber() && newData.child('correct').isNumber() && newData.child('answered').isNumber()",
        '$other': {'.validate': true}
      }
    }},
    // Students may create only ONE answer per teacher-assigned nonce.
    // Scores, distance, items and winners are written only by teacher client.
    answers: {'$code': {
      '.read': teacher, '.write': teacher,
      '$uid': {
        '.read': `${teacher} || (${own})`,
        '$nonce': {
          '.write': `${memberOwn} && (${isRacing}) && (${playing}) && root.child('v6/memberState/' + $code + '/' + $uid + '/phase').val() === 'question' && root.child('v6/memberState/' + $code + '/' + $uid + '/nonce').val() === $nonce && !data.exists() && newData.exists()`,
          '.validate': `newData.hasChildren(['value','at']) && newData.child('value').isString() && newData.child('value').val().length >= 1 && newData.child('value').val().length <= 200 && (${time})`,
          value: {'.validate': "newData.isString() && newData.val().length >= 1 && newData.val().length <= 200"},
          at: {'.validate': "newData.isNumber()"},
          '$other': {'.validate': false}
        }
      }
    }}
  };
  return existingRules;
}

export function makeRulesV6(teacherUid) {
  const full = JSON.parse(makeRulesV5(teacherUid));
  return JSON.stringify(addRacingV6Rules(full,teacherUid),null,2)+'\n';
}
