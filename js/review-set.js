// Pure selection logic for teacher-created re-teaching sets.
// Unattempted questions never count as wrong.
import {buildGoldAccuracy} from './gold-analytics.js';
export function chooseReviewQuestions({mode,run,grades={},publicState={},threshold=60}){
 const questions=Array.isArray(run?.questions)?run.questions:Object.values(run?.questions||{});
 if(!questions.length)return [];
 let indices=[];
 if(mode==='classic'){
  indices=questions.map((q,i)=>{
   const rows=grades['q'+(i+1)]||{};
   const attempts=Object.values(rows).filter(Boolean);
   const correct=attempts.filter(x=>x.correct===true).length;
   return attempts.length>0&&correct/attempts.length*100<threshold?i:-1;
  }).filter(i=>i>=0);
 }else{
  const stats=buildGoldAccuracy({roster:run.roster||{},questions,answersLog:run.answersLog||{},mode:'first'});
  indices=stats.questions.filter(x=>x.total>0&&Number(x.rate)<threshold).map(x=>x.index);
 }
 return indices.map((index,i)=>{
  const q=questions[index];
  return {number:i+1,prompt:String(q.prompt||''),type:q.type==='typing'?'typing':'multiple_choice',
   options:Array.isArray(q.options)?q.options:Object.values(q.options||{}),
   correctIndex:q.type==='typing'?0:Number(q.correctIndex||0),
   timeLimit:Number(q.timeLimit)||30,...(q.imageUrl?{imageUrl:q.imageUrl}:{})};
 });
}
