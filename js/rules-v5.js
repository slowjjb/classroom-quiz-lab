// v5 extends the complete v4.12 rules. Publish this whole JSON, not only v5.
import {makeRulesV4} from './rules-v4.js';
export function makeRulesV5(uid){
  const result=JSON.parse(makeRulesV4(uid));
  const teacher=`auth != null && auth.uid === '${uid}' && auth.token.firebase.sign_in_provider === 'google.com'`;
  const owner="auth != null && auth.uid === $uid && auth.token.firebase.sign_in_provider === 'anonymous'";
  const member="root.child('v2/rooms/' + $code + '/members/' + $uid + '/profile').exists()";
  const playing="root.child('v5/public/' + $code + '/state').val() === 'playing' && now <= root.child('v5/public/' + $code + '/endsAt').val()";
  const matching="root.child('v5/memberState/' + $code + '/' + $uid + '/nonce').val() === $nonce";
  const validTime="newData.child('at').isNumber() && newData.child('at').val() >= now - 1000 && newData.child('at').val() <= now + 1000";
  const studentBase=`(${owner}) && (${member}) && (${playing}) && (${matching})`;
  result.rules.v5={
    versionCheck:{'.read':teacher,'.write':false},
    privateRuns:{'$code':{'.read':teacher,'.write':teacher,'$other':{'.validate':true}}},
    public:{'$code':{
      '.read':`${teacher} || (auth != null && root.child('v2/rooms/' + $code + '/members/' + auth.uid + '/profile').exists())`,
      '.write':teacher,
      '.validate':"newData.hasChildren(['state','scores','durationSec']) && (newData.child('state').val() === 'ready' || newData.child('state').val() === 'playing' || newData.child('state').val() === 'finished')",
      '$other':{'.validate':true}
    }},
    memberState:{'$code':{
      '.read':teacher,'.write':teacher,
      '$uid':{
        '.read':`${teacher} || (${owner})`,'.write':teacher,
        '.validate':"newData.hasChildren(['phase','nonce','sequence','questionIndex']) && newData.child('phase').isString() && newData.child('nonce').isString() && newData.child('sequence').isNumber() && newData.child('questionIndex').isNumber()",
        '$other':{'.validate':true}
      }
    }},
    actions:{'$code':{
      '.read':teacher,'.write':teacher,
      '$uid':{
        '.read':`${teacher} || (${owner})`,
        '$nonce':{
          '$action':{
            '.write':`${studentBase} && !data.exists() && newData.exists() && (($action === 'cast' && root.child('v5/memberState/' + $code + '/' + $uid + '/phase').val() === 'cast') || ($action === 'hook' && root.child('v5/memberState/' + $code + '/' + $uid + '/phase').val() === 'bite' && now >= root.child('v5/memberState/' + $code + '/' + $uid + '/biteAt').val()) || ($action === 'next' && root.child('v5/memberState/' + $code + '/' + $uid + '/phase').val() === 'result'))`,
            '.validate':`newData.hasChild('at') && (${validTime})`,
            at:{'.validate':'newData.isNumber()'},'$other':{'.validate':false}
          }
        }
      }
    }},
    answers:{'$code':{
      '.read':teacher,'.write':teacher,
      '$uid':{
        '.read':`${teacher} || (${owner})`,
        '$nonce':{
          '.write':`${studentBase} && !data.exists() && newData.exists() && root.child('v5/memberState/' + $code + '/' + $uid + '/phase').val() === 'question'`,
          '.validate':`newData.hasChildren(['value','at']) && newData.child('value').isString() && newData.child('value').val().length >= 1 && newData.child('value').val().length <= 200 && (${validTime})`,
          value:{'.validate':"newData.isString() && newData.val().length >= 1 && newData.val().length <= 200"},
          at:{'.validate':'newData.isNumber()'},'$other':{'.validate':false}
        }
      }
    }}
  };
  return JSON.stringify(result,null,2)+'\n';
}
