// Purplekit v6 — complete additive Firebase RTDB security rules.
// Includes v0-v5 unchanged. The v6 game is NOT enabled until host/join code
// and the complete published rules are verified in a separate test database.
import {makeRulesV5} from './rules-v5.js';

export function addRacingV6Rules(existingRules, teacherUid) {
  if (!teacherUid || !/^[A-Za-z0-9_-]{8,128}$/.test(teacherUid)) throw new Error('Firebase 교사 UID를 확인해 주세요.');
  const teacher=`auth != null && auth.uid === '${teacherUid}' && auth.token.firebase.sign_in_provider === 'google.com'`;
  const owner="auth != null && auth.uid === $uid && auth.token.firebase.sign_in_provider === 'anonymous'";
  const member="auth != null && root.child('v2/rooms/' + $code + '/members/' + auth.uid + '/profile').exists()";
  const ownerMember=`(${owner}) && root.child('v2/rooms/' + $code + '/members/' + $uid + '/profile').exists()`;
  const racing="root.child('v2/rooms/' + $code + '/meta/mode').val() === 'racing'";
  const lobby="root.child('v2/rooms/' + $code + '/meta/state').val() === 'lobby' && root.child('v6/public/' + $code + '/state').val() === 'lobby'";
  const playing="root.child('v6/public/' + $code + '/state').val() === 'playing'";
  const atTime="newData.child('at').isNumber() && newData.child('at').val() >= now - 5000 && newData.child('at').val() <= now + 5000";
  existingRules.rules.v6 = {
    versionCheck:{'.read':teacher,'.write':false},
    privateRuns:{'$code':{'.read':teacher,'.write':teacher,'$other':{'.validate':true}}},
    public:{'$code':{
      '.read':`${teacher} || (${member})`,'.write':teacher,
      '.validate':"newData.hasChildren(['state','finishMeters']) && (newData.child('state').val() === 'lobby' || newData.child('state').val() === 'playing' || newData.child('state').val() === 'finished') && newData.child('finishMeters').isNumber() && newData.child('finishMeters').val() >= 20 && newData.child('finishMeters').val() <= 100 && newData.child('finishMeters').val() % 5 === 0",
      state:{'.validate':"newData.isString() && (newData.val() === 'lobby' || newData.val() === 'playing' || newData.val() === 'finished')"},
      finishMeters:{'.validate':"newData.isNumber() && newData.val() >= 20 && newData.val() <= 100 && newData.val() % 5 === 0"},
      '$other':{'.validate':true}
    }},
    // The only authoritative mapping for car ownership.
    // Both slots[carId]=uid and byUid[uid]=carId are changed in ONE
    // teacher-authenticated transaction. Students have READ-only access.
    carRegistry:{'$code':{
      '.read':`${teacher} || (${member})`,'.write':teacher,
      '$other':{'.validate':true}
    }},
    // Student sends a request. The teacher's always-open host page
    // automatically processes it: no manual approval.
    carRequests:{'$code':{
      '.read':teacher,'.write':teacher,
      '$uid':{
        '.read':`${teacher} || (${owner})`,
        '.write':`${ownerMember} && (${racing}) && (${lobby}) && newData.exists() && (!data.exists() || newData.child('seq').val() > data.child('seq').val())`,
        '.validate':`newData.hasChildren(['seq','action','carId','at']) && newData.child('seq').isNumber() && newData.child('seq').val() > 0 && newData.child('action').isString() && (newData.child('action').val() === 'claim' || newData.child('action').val() === 'cancel') && newData.child('carId').isString() && ((newData.child('action').val() === 'claim' && newData.child('carId').val().matches(/^(0[1-9]|[12][0-9]|30)$/)) || (newData.child('action').val() === 'cancel' && newData.child('carId').val() === '00')) && (${atTime})`,
        seq:{'.validate':'newData.isNumber() && newData.val() > 0'},
        action:{'.validate':"newData.isString() && (newData.val() === 'claim' || newData.val() === 'cancel')"},
        carId:{'.validate':"newData.isString() && newData.val().matches(/^(0[0-9]|[12][0-9]|30)$/)"},
        at:{'.validate':'newData.isNumber()'},
        '$other':{'.validate':false}
      }
    }},
    memberState:{'$code':{
      '.read':teacher,'.write':teacher,
      '$uid':{
        '.read':`${teacher} || (${owner})`,'.write':teacher,
        '.validate':"newData.hasChildren(['phase','nonce','questionIndex','correct','answered']) && newData.child('phase').isString() && newData.child('nonce').isString() && newData.child('questionIndex').isNumber() && newData.child('correct').isNumber() && newData.child('answered').isNumber()",
        '$other':{'.validate':true}
      }
    }},
    answers:{'$code':{
      '.read':teacher,'.write':teacher,
      '$uid':{
        '.read':`${teacher} || (${owner})`,
        '$nonce':{
          '.write':`${ownerMember} && (${racing}) && (${playing}) && root.child('v6/memberState/' + $code + '/' + $uid + '/phase').val() === 'question' && root.child('v6/memberState/' + $code + '/' + $uid + '/nonce').val() === $nonce && !data.exists() && newData.exists()`,
          '.validate':`newData.hasChildren(['value','at']) && newData.child('value').isString() && newData.child('value').val().length >= 1 && newData.child('value').val().length <= 200 && (${atTime})`,
          value:{'.validate':"newData.isString() && newData.val().length >= 1 && newData.val().length <= 200"},
          at:{'.validate':'newData.isNumber()'},
          '$other':{'.validate':false}
        }
      }
    }}
  };
  return existingRules;
}
export function makeRulesV6(teacherUid){
  return JSON.stringify(addRacingV6Rules(JSON.parse(makeRulesV5(teacherUid)),teacherUid),null,2)+'\n';
}
