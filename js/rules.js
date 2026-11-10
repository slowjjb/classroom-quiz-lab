// 기존 v0 경로의 교사 권한 및 학생 접속을 보존하면서 v1 교사용 문제 경로만 추가.
export function makeRules(uid) {
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(uid)) throw new Error('교사 UID가 올바르지 않습니다.');
  const teacher = `auth != null && auth.uid === '${uid}' && auth.token.firebase.sign_in_provider === 'google.com'`;
  const rules = {
    rules: {
      '.read': false,
      '.write': false,
      v0: {
        presence: {
          '.read': teacher,
          '$uid': {
            '$session': {
              '.write': "auth != null && auth.uid === $uid && auth.token.firebase.sign_in_provider === 'anonymous'",
              '.validate': "newData.hasChildren(['name', 'connectedAt'])",
              name: { '.validate': 'newData.isString() && newData.val().length >= 1 && newData.val().length <= 20' },
              connectedAt: { '.validate': 'newData.isNumber()' },
              '$other': { '.validate': false }
            }
          }
        }
      },
      v1: {
        questionSets: {
          '.read': teacher,
          '.write': teacher,
          '$setId': {
            '.validate': "newData.hasChildren(['title', 'createdAt', 'updatedAt', 'questions']) && newData.child('title').isString() && newData.child('title').val().length >= 1 && newData.child('title').val().length <= 80 && newData.child('createdAt').isNumber() && newData.child('updatedAt').isNumber() && newData.child('questions').hasChildren()",
            title: { '.validate': 'newData.isString() && newData.val().length >= 1 && newData.val().length <= 80' },
            createdAt: { '.validate': 'newData.isNumber()' },
            updatedAt: { '.validate': 'newData.isNumber()' },
            sourceName: { '.validate': 'newData.isString() && newData.val().length <= 200' },
            questions: {
              '$qid': {
                '.validate': "newData.hasChildren(['number','prompt','type','timeLimit','options','correctIndex']) && newData.child('number').isNumber() && newData.child('prompt').isString() && newData.child('timeLimit').isNumber() && newData.child('correctIndex').isNumber() && (newData.child('type').val() === 'typing' || newData.child('type').val() === 'multiple_choice')",
                '$other': { '.validate': true }
              }
            },
            '$other': { '.validate': false }
          }
        }
      }
    }
  };
  return JSON.stringify(rules, null, 2) + '\n';
}
