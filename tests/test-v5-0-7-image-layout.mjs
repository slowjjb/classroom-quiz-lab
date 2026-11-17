import assert from 'node:assert/strict';
import fs from 'node:fs';
import {APP_VERSION,APP_BUILD} from '../js/version.js';
const read=path=>fs.readFileSync(path,'utf8');
const join=read('join.html'),gold=read('js/gold-student.js'),fishing=read('js/fishing-student.js');
const goldCss=read('gold.css'),fishingCss=read('fishing.css');
const manifest=JSON.parse(read('version.json'));
assert.equal(APP_VERSION,'5.0.7');assert.equal(APP_BUILD,507);
assert.equal(manifest.version,APP_VERSION);assert.equal(manifest.build,APP_BUILD);
for(const name of ['gold','fishing']) {
  assert.match(join,new RegExp(`id="${name}-question-card"`));
  assert.match(join,new RegExp(`class="${name}-question-copy"`));
  assert.match(join,new RegExp(`id="${name}-question-image-wrap"`));
}
assert.match(gold,/card\.classList\.remove\('has-image'\)/);
assert.match(gold,/card\.classList\.add\('has-image'\)/);
assert.match(gold,/image\.onerror/);
assert.match(fishing,/card\.classList\.remove\('has-image'\)/);
assert.match(fishing,/card\.classList\.add\('has-image'\)/);
assert.ok(fishing.indexOf('opts.append(field)')<fishing.indexOf('fullQuestionImageUrl(own.imageUrl,location.href)'));
assert.ok(fishing.indexOf('opts.append(button)')<fishing.indexOf('fullQuestionImageUrl(own.imageUrl,location.href)'));
for(const css of [goldCss,fishingCss]){
  assert.match(css,/\.has-image\{/);
  assert.match(css,/grid-template-columns:minmax\(0,2fr\) minmax\(0,3fr\)/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/object-fit:contain/);
}
assert.match(join,/gold\.css\?v=5\.0\.7/);
assert.match(join,/fishing\.css\?v=5\.0\.7/);
assert.match(read('js/join.js'),/gold-student\.js\?v=5\.0\.7/);
assert.match(read('js/join.js'),/fishing-student\.js\?v=5\.0\.7/);
console.log('v5.0.7: responsive image-only 40/60 layouts, image failure fallback, cache version PASS');
