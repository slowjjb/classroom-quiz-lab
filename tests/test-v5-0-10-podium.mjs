import assert from 'node:assert/strict';
import fs from 'node:fs';
import {APP_VERSION,APP_BUILD} from '../js/version.js';
import {FISHING_PENALTY_COOLDOWN_MS,FISHING_PENALTY_CHANCE,FISHING_PENALTY_DURATION_MS} from '../js/fishing-core.js';
const load=path=>fs.readFileSync(path,'utf8');
assert.equal(APP_VERSION,'5.0.10');assert.equal(APP_BUILD,510);
assert.equal(FISHING_PENALTY_COOLDOWN_MS,30000);
assert.equal(FISHING_PENALTY_CHANCE,0.045);
assert.equal(FISHING_PENALTY_DURATION_MS,2700);
assert.equal(JSON.parse(load('version.json')).build,510);
assert.match(load('fishing-demo.html'),/FISHING_PENALTY_COOLDOWN_MS = 30000/);
const classic=load('js/classic-host.js');
assert.match(classic,/const isClassic=room\?\.meta\?\.mode==='classic'/);
assert.match(classic,/\$\('classic-panel'\)\.hidden=!isClassic/);
assert.match(classic,/\$\('classic-panel'\)\.hidden=true/);
const html=load('rooms.html');
for(const id of ['fishing-results-podium-wrap','fishing-results-podium','fishing-podium-toggle']){
  assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,id);
}
const host=load('js/fishing-host.js');
assert.match(host,/renderFishingPodium\(/);
assert.match(host,/podiumCollapsed/);
assert.match(host,/fishing-podium-toggle'\)\.addEventListener/);
assert.match(load('js/fishing-podium.js'),/toFixed\(1\).*kg/);
assert.ok(!load('js/fishing-podium.js').includes('점`'));
console.log('v5.0.10: fishing kg podium, classic-only controls, 30 sec cooldown PASS');
