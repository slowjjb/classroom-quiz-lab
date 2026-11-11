/** PurpleKit v3.9: 배경 투명 완성형 캐릭터 20종. 외부 이미지/CDN에 의존하지 않습니다. */
export const AVATARS = Object.freeze([
  {id:'a01',name:'우주 탐험가',kind:'사람'}, {id:'a02',name:'별빛 마법사',kind:'사람'},
  {id:'a03',name:'스케이트 소년',kind:'사람'}, {id:'a04',name:'푸른 기사',kind:'사람'},
  {id:'a05',name:'그림 화가',kind:'사람'}, {id:'a06',name:'숲 탐험가',kind:'사람'},
  {id:'a07',name:'작은 과학자',kind:'사람'}, {id:'a08',name:'그림자 닌자',kind:'사람'},
  {id:'a09',name:'별여우',kind:'동물'}, {id:'a10',name:'냥이 탐정',kind:'동물'},
  {id:'a11',name:'달토끼',kind:'동물'}, {id:'a12',name:'판다 대장',kind:'동물'},
  {id:'a13',name:'눈꽃 펭귄',kind:'동물'}, {id:'a14',name:'아기 드래곤',kind:'상상 생물'},
  {id:'a15',name:'호랑이 용사',kind:'동물'}, {id:'a16',name:'수중 친구',kind:'동물'},
  {id:'a17',name:'미니 로봇',kind:'로봇'}, {id:'a18',name:'왕관 슬라임',kind:'상상 생물'},
  {id:'a19',name:'우주 외계인',kind:'상상 생물'}, {id:'a20',name:'버섯 요정',kind:'상상 생물'}
]);
const KNOWN = new Set(AVATARS.map(avatar=>avatar.id));
export const DEFAULT_AVATAR = 'a01';
export const avatarIdPattern = /^a(?:0[1-9]|1\d|20)$/;
export function normalizeAvatarId(value){
  return typeof value==='string'&&KNOWN.has(value)?value:DEFAULT_AVATAR;
}
export function avatarInfo(value){
  const id=normalizeAvatarId(value);
  return AVATARS.find(avatar=>avatar.id===id);
}
export function avatarImageUrl(value){
  return new URL(`../images/avatars/${normalizeAvatarId(value)}.png?v=3.9`,import.meta.url).href;
}
export function createAvatarImage(value,{size='sm',decorative=false}={}){
  const img=document.createElement('img');
  const info=avatarInfo(value);
  img.className=`avatar-pixel avatar-pixel--${size}`;
  img.src=avatarImageUrl(info.id);
  img.alt=decorative?'':`${info.name} 캐릭터`;
  img.loading='lazy';
  img.decoding='async';
  img.width=size==='lg'?90:size==='md'?56:36;
  img.height=img.width;
  if(decorative)img.setAttribute('aria-hidden','true');
  return img;
}
