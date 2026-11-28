import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

// Verify actual nesting rather than just counting CSS classes: orphan host panels caused
// the three modes to unexpectedly extend beyond the teacher workspace.
function ancestorsForIds(html){
 const result=new Map(),stack=[],voids=new Set(['meta','link','img','input','br','hr','source']);
 for(const match of html.matchAll(/<\/?([a-z][\w-]*)([^>]*)>/gi)){
  const tag=match[1].toLowerCase(),closing=match[0].startsWith('</');
  if(closing){
   const index=stack.findLastIndex(e=>e.tag===tag);
   if(index>=0)stack.splice(index);
  }else if(!voids.has(tag)){
   const id=match[2].match(/\bid="([^"]+)"/)?.[1];
   if(id)result.set(id,stack.map(e=>e.id||e.tag));
   stack.push({tag,id});
  }
 }
 assert.equal(stack.length,0,'teacher page must have fully closed layout containers');
 return result;
}
test('all game management panels share the same width-constrained workspace',()=>{
 const a=ancestorsForIds(src('rooms.html'));
 for(const id of ['room-detail','classic-panel','racing-host-panel','fishing-panel','gold-panel'])
  assert.ok(a.get(id).includes('room-workspace'),id+' escaped the teacher grid');
 assert.ok(a.get('room-saved-list').includes('room-saved-workspace'),'saved rooms not in gated sidebar');
 assert.ok(a.get('room-saved-workspace').includes('aside'),'saved rooms not under left sidebar');
});
test('room list access and create form are session-safe',()=>{
 const js=src('js/rooms.js'),html=src('rooms.html');
 assert.match(html,/id="room-create-disclosure"[^>]*open/);
 assert.match(js,/createDisclosure\.open=false/);
 assert.match(js,/\['room-workspace','room-saved-workspace'\]/);
 assert.match(html,/class="rooms-list-maintenance"/);
});
test('racing toolbar contains the game title, remaining time and actions in one wrapper',()=>{
 const a=ancestorsForIds(src('rooms.html'));
 for(const id of ['racing-play-clock','racing-play-summary','racing-play-focus-toggle','racing-play-focus-pause','racing-play-focus-end'])
  assert.ok(a.get(id).includes('div'),'racing toolbar child missing '+id);
 const html=src('rooms.html');
 const toolbarStart=html.indexOf('<div class="racing-compact-toolbar">');
 const toolbarEnd=html.indexOf('</div>\n    <div class="racing-play-settings">',toolbarStart);
 assert.ok(toolbarStart>0&&toolbarEnd>toolbarStart,'racing compact header wrapper missing');
 const markup=html.slice(toolbarStart,toolbarEnd);
 for(const cls of ['racing-play-header','racing-play-hud','racing-control-actions'])
  assert.ok(markup.includes('class="'+cls+'"'),cls);
});
test('responsive and compact CSS is scoped to teacher dashboard and monitor',()=>{
 const rooms=src('styles.css'),racing=src('racing-lobby.css');
 assert.match(rooms,/\.rooms-shell\{max-width:1640px/);
 assert.match(rooms,/\.rooms-dashboard\{grid-template-columns:minmax\(264px,290px\)/);
 assert.match(rooms,/@media\(max-width:1070px\)/);
 assert.match(rooms,/@media\(max-width:700px\)/);
 assert.match(racing,/\.racing-play-focus \.racing-compact-toolbar\{/);
 assert.match(racing,/position:sticky;top:-8px/);
 assert.match(racing,/\.racing-play-focus \.racing-play-ranking\{[^}]*max-height:calc\(100dvh - 110px\)/);
});
