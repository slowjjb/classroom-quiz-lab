// Purplekit v5.0 Fishing Frenzy — pure balancing and scoring helpers.
// All random rewards are chosen in the teacher's authenticated browser.
export const FISHING_DURABILITY = 5;
export const FISHING_PENALTY_CHANCE = 0.03;
export const FISHING_PENALTY_COOLDOWN_MS = 60000;
export const FISHING_PENALTY_DURATION_MS = 1800;
export const FISHING_LURE_HEAL = 0; // 0 by default; adjust to 1 after classroom tests.
export const CREATURES = Object.freeze([
  {id:'mackerel',name:'고등어',tier:'normal',emoji:'🐟'},
  {id:'flatfish',name:'광어',tier:'normal',emoji:'🐟'},
  {id:'puffer',name:'복어',tier:'normal',emoji:'🐡'},
  {id:'flyingfish',name:'날치',tier:'normal',emoji:'🐠'},
  {id:'jellyfish',name:'해파리',tier:'normal',emoji:'🪼'},
  {id:'salmon',name:'연어',tier:'normal',emoji:'🐟'},
  {id:'eel',name:'장어',tier:'normal',emoji:'🐍'},
  {id:'crab',name:'꽃게',tier:'normal',emoji:'🦀'},
  {id:'tuna',name:'참치',tier:'big',emoji:'🐟'},
  {id:'shark',name:'상어',tier:'big',emoji:'🦈'},
  {id:'turtle',name:'바다거북',tier:'big',emoji:'🐢'},
  {id:'whale',name:'고래',tier:'big',emoji:'🐳',minLevel:4},
  {id:'octopus',name:'문어',tier:'big',emoji:'🐙'},
  {id:'sawshark',name:'톱상어',tier:'rare',emoji:'🦈'},
  {id:'sunfish',name:'개복치',tier:'rare',emoji:'🐟'},
  {id:'orca',name:'범고래',tier:'rare',emoji:'🐋',minLevel:4},
  {id:'ray',name:'가오리',tier:'rare',emoji:'🐠'},
  {id:'anglerfish',name:'아귀',tier:'rare',emoji:'🐡'},
  {id:'megalodon',name:'메갈로돈',tier:'legend',emoji:'🦈',minLevel:5},
  {id:'mosasaurus',name:'모사사우루스',tier:'legend',emoji:'🦕',minLevel:5},
  {id:'manta',name:'만타가오리',tier:'legend',emoji:'🐠',minLevel:5},
  {id:'bluewhale',name:'대왕고래',tier:'legend',emoji:'🐋',minLevel:5},
  {id:'giantsquid',name:'대왕오징어',tier:'legend',emoji:'🦑',minLevel:5}
]);
const EARLY_RANGES=[[1,10],[5,20],[10,30],[20,50],[30,75],[45,100],[60,130],[80,165]];
const LEGEND_ODDS=[0,0,0,0,0,0.01,0.02,0.04,0.07,0.10,0.12];
const randomIndex=(n,rng=Math.random)=>Math.min(n-1,Math.max(0,Math.floor(rng()*n)));
export const rollInt=(min,max,rng=Math.random)=>min+randomIndex(max-min+1,rng);
export function lureInterval(level){return level<=3?3:level<=6?4:5;}
export function lureRetryInterval(rng=Math.random){return rollInt(1,3,rng);}
export function weightRange(level){
  const n=Math.max(1,Math.floor(Number(level)||1));
  if(n<=8)return [...EARLY_RANGES[n-1]];
  const k=n-8;
  const lo=5*Math.round((80+20*k+1.5*k*(k-1))/5);
  const hi=5*Math.round((165+35*k+2*k*(k-1))/5);
  return [lo,hi];
}
export function legendChance(level){const n=Math.max(1,Math.floor(Number(level)||1));return n<5?0:n<=10?LEGEND_ODDS[n]:Math.min(.15,.12+.01*(n-10));}
export function tierOdds(level){
  const legend=legendChance(level),rare=Math.min(.31,.05+.028*(level-1));
  const big=Math.min(.43,.13+.033*(level-1));
  return {legend,rare,big,normal:Math.max(0,1-legend-rare-big)};
}
export function pickCreature(level,rng=Math.random){
  const odds=tierOdds(level),r=rng();
  let tier=r<odds.legend?'legend':r<odds.legend+odds.rare?'rare':r<odds.legend+odds.rare+odds.big?'big':'normal';
  let pool=CREATURES.filter(x=>x.tier===tier&&(x.minLevel||1)<=level);
  if(!pool.length){tier='normal';pool=CREATURES.filter(x=>x.tier===tier);}
  const fish=pool[randomIndex(pool.length,rng)];
  const [min,max]=weightRange(level);
  const kg=Math.round((min+(max-min)*Math.pow(rng(),1.5))*10)/10;
  const juvenile=(fish.tier==='big'||fish.tier==='rare')&&level<=3;
  return {...fish,kg,displayName:juvenile?`어린 ${fish.name}`:fish.name,level};
}
export function freshScore(name,avatarId,rng=Math.random){return {name,avatarId,kg:0,answered:0,correct:0,level:1,durability:FISHING_DURABILITY,progress:0,nextUpgradeAt:lureInterval(1,rng),lastAnswerNonce:'',lastResult:null};}
export function resolveCatch(score,{correct,upgrade=false,canPenalty=false,rng=Math.random}={}){
  const next={...score,answered:(score.answered||0)+1,correct:(score.correct||0)+(correct?1:0)};
  if(!correct){
    next.durability=Math.max(0,(next.durability||FISHING_DURABILITY)-1);
    let type='miss';
    if(upgrade){next.progress=0;next.nextUpgradeAt=lureRetryInterval(rng);type='upgrade-miss';}
    if(next.durability===0){
      next.level=1;next.durability=FISHING_DURABILITY;next.progress=0;next.nextUpgradeAt=lureInterval(1,rng);
      type='broken';
    }
    return {score:next,result:{type,correct:false,kg:0}};
  }
  if(upgrade){
    next.level=(next.level||1)+1;next.progress=0;next.nextUpgradeAt=lureInterval(next.level,rng);
    next.durability=Math.min(FISHING_DURABILITY,next.durability+FISHING_LURE_HEAL);
    return {score:next,result:{type:'upgrade',correct:true,kg:0,newLevel:next.level}};
  }
  next.progress=(next.progress||0)+1;
  if(canPenalty&&rng()<FISHING_PENALTY_CHANCE){
    const effects=['school','jelly','ink','shrink'];
    return {score:next,result:{type:'penalty',correct:true,kg:0,effect:effects[randomIndex(effects.length,rng)]}};
  }
  const creature=pickCreature(next.level,rng);
  next.kg=Math.round((next.kg+creature.kg)*10)/10;
  return {score:next,result:{type:'fish',correct:true,kg:creature.kg,creatureId:creature.id,name:creature.displayName,tier:creature.tier,emoji:creature.emoji,level:next.level}};
}
export function fishingRanking(scores={}){return Object.entries(scores).map(([uid,s])=>({uid,...s})).sort((a,b)=>b.kg-a.kg||b.correct-a.correct||a.name.localeCompare(b.name,'ko'));}
