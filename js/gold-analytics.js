// Purplekit v4.2: first-attempt and all-attempt learning analysis, pure functions.
// A question not yet answered is "no data", NOT an incorrect answer.
export function goldPercent(correct,total){
  if(!Number.isFinite(Number(total)) || Number(total)<=0)return null;
  return Math.round(100*Math.max(0,Number(correct)||0)/Number(total));
}
export function goldTier(rate){
  if(rate===null||!Number.isFinite(rate))return 'none';
  if(rate>=75)return 'high';
  if(rate>50)return 'mid';
  return 'low';
}
function questionList(raw){
  if(Array.isArray(raw))return raw;
  return Object.keys(raw||{}).sort((a,b)=>Number(a)-Number(b)).map(k=>raw[k]);
}
function attemptSequence(nonce){
  const match=String(nonce||'').match(/^a(\d+)_/);
  return match?Number(match[1]):Number.MAX_SAFE_INTEGER;
}
export function buildGoldAccuracy({roster={},scores={},questions=[],answersLog={},mode='first'}={}){
  const list=questionList(questions);
  const allowed=new Set(Object.keys(roster||{}));
  const all=[];
  for(const [uid,entries] of Object.entries(answersLog||{})){
    if(!allowed.has(uid))continue;
    for(const [nonce,entry] of Object.entries(entries||{})){
      let index=Number(entry?.questionIndex);
      if(!Number.isInteger(index)||index<0||index>=list.length){
        index=list.findIndex(q=>Number(q?.number)===Number(entry?.questionNumber));
      }
      if(index<0||index>=list.length)continue;
      all.push({uid,index,nonce,correct:entry?.correct===true,
        sequence:attemptSequence(nonce),at:Number(entry?.at)||0});
    }
  }
  all.sort((a,b)=>a.uid.localeCompare(b.uid)||a.sequence-b.sequence||a.at-b.at||a.nonce.localeCompare(b.nonce));
  const unique=new Set();
  const first=all.filter(entry=>{
    const key=entry.uid+':'+entry.index;
    if(unique.has(key))return false;
    unique.add(key);return true;
  });
  const selected=mode==='all'?all:first;
  const statsFor=items=>{
    const correct=items.filter(x=>x.correct).length;
    return {correct,total:items.length,rate:goldPercent(correct,items.length),tier:goldTier(goldPercent(correct,items.length))};
  };
  const students=Object.entries(roster||{}).map(([uid,name])=>{
    const current=selected.filter(a=>a.uid===uid);
    const total=all.filter(a=>a.uid===uid);
    return {uid,name:typeof name==='string'?name:(name?.name||scores?.[uid]?.name||'참가자'),
      avatarId:scores?.[uid]?.avatarId||'a01',...statsFor(current),
      attempts:total.length,uniqueQuestions:new Set(total.map(a=>a.index)).size};
  }).sort((a,b)=>a.rate===null?1:b.rate===null?-1:a.rate-b.rate||a.name.localeCompare(b.name,'ko'));
  const questionStats=list.map((q,index)=>({
    index,number:Number(q?.number)||index+1,prompt:String(q?.prompt||''),
    ...statsFor(selected.filter(a=>a.index===index)),
    attempts:all.filter(a=>a.index===index).length,
    students:new Set(all.filter(a=>a.index===index).map(a=>a.uid)).size
  }));
  const summary=statsFor(selected);
  return {mode,students,questions:questionStats,summary,
    allAttempts:all.length,firstAttempts:first.length,participantCount:students.length};
}
