// v4 보안 규칙: v3.8의 이름 예약/아바타/클래식 보안 규칙을 모두 보존합니다.
import { makeRulesV3 } from './rules-v3.js';
export function makeRulesV4(uid){
  const result=JSON.parse(makeRulesV3(uid));
  const teacher=`auth != null && auth.uid === '${uid}' && auth.token.firebase.sign_in_provider === 'google.com'`;
  const member="auth != null && root.child('v2/rooms/' + $code + '/members/' + auth.uid + '/profile').exists()";
  const owner="auth != null && auth.uid === $uid && auth.token.firebase.sign_in_provider === 'anonymous'";
  const playing="root.child('v4/public/' + $code + '/state').val() === 'playing' && now <= root.child('v4/public/' + $code + '/endsAt').val()";
  result.rules.v4={
    versionCheck:{'.read':teacher,'.write':false},
    privateRuns:{'$code':{'.read':teacher,'.write':teacher,'$other':{'.validate':true}}},
    public:{'$code':{
      '.read':`${teacher} || (${member})`,'.write':teacher,
      '.validate':"newData.hasChildren(['state','scores','durationSec']) && (newData.child('state').val() === 'ready' || newData.child('state').val() === 'playing' || newData.child('state').val() === 'finished')",
      '$other':{'.validate':true}
    }},
    memberState:{'$code':{'.read':teacher,'.write':teacher,'$uid':{
      '.read':`${teacher} || (${owner})`,'.write':teacher,
      '.validate':"newData.hasChildren(['phase','nonce','questionIndex','answered','correct']) && newData.child('phase').isString() && newData.child('nonce').isString() && newData.child('questionIndex').isNumber() && newData.child('answered').isNumber() && newData.child('correct').isNumber()",
      '$other':{'.validate':true}
    }}},
    answers:{'$code':{
      '.read':teacher,'.write':teacher,
      '$uid':{
        '.read':`${teacher} || (${owner})`,
        '$nonce':{
          '.write':`${owner} && !data.exists() && newData.exists() && (${member}) && (${playing}) && root.child('v4/memberState/' + $code + '/' + $uid + '/phase').val() === 'question' && root.child('v4/memberState/' + $code + '/' + $uid + '/nonce').val() === $nonce`,
          '.validate':"newData.hasChildren(['value','at']) && newData.child('value').isString() && newData.child('value').val().length >= 1 && newData.child('value').val().length <= 200 && newData.child('at').isNumber() && newData.child('at').val() >= now - 1000 && newData.child('at').val() <= now + 1000",
          value:{'.validate':"newData.isString() && newData.val().length >= 1 && newData.val().length <= 200"},
          at:{'.validate':'newData.isNumber()'},'$other':{'.validate':false}
        }
      }
    }},
    picks:{'$code':{
      '.read':teacher,'.write':teacher,
      '$uid':{
        '.read':`${teacher} || (${owner})`,
        '$nonce':{
          '.write':`${owner} && !data.exists() && newData.exists() && (${member}) && (${playing}) && root.child('v4/memberState/' + $code + '/' + $uid + '/phase').val() === 'treasure' && root.child('v4/memberState/' + $code + '/' + $uid + '/nonce').val() === $nonce`,
          '.validate':"newData.hasChildren(['choice','at']) && newData.child('choice').isNumber() && newData.child('choice').val() >= 1 && newData.child('choice').val() <= 3 && newData.child('at').isNumber() && newData.child('at').val() >= now - 1000 && newData.child('at').val() <= now + 1000",
          choice:{'.validate':"newData.isNumber() && newData.val() >= 1 && newData.val() <= 3"},
          at:{'.validate':'newData.isNumber()'},'$other':{'.validate':false}
        }
      }
    }}
  };
  return JSON.stringify(result,null,2)+'\n';
}
