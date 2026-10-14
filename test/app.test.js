import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { availableRanges, conflicts } from '../public/schedule.js';

const dir = mkdtempSync(join(process.env.TEST_TMP_DIR || tmpdir(), 'scene-test-'));
process.env.DATA_DIR = dir;
const { createServer } = await import('../server.js');
let server, base;
async function start() { server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`; }
before(start);
after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive:true, force:true }); });
async function api(path, data) { const res = await fetch(base + path, data ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)} : {}); return {status:res.status, data:await res.json()}; }
test('공통 시간 계산: 겹침, 경계, 자정, 빈 일정', () => {
  const blocks = [{day:0,start:18,end:20,memberId:'a'}, {day:0,start:19,end:22,memberId:'b'}, {day:0,start:46,end:48,memberId:'a'}];
  assert.deepEqual(availableRanges(blocks,0), [[0,18],[22,46]]);
  assert.deepEqual(availableRanges(blocks,1), [[0,48]]);
  assert.equal(conflicts(blocks,0,20,'a').length,0);
  assert.equal(conflicts(blocks,0,19).length,2);
  assert.deepEqual(availableRanges([{day:6,start:0,end:48}],6), []);
});
test('공유 저장, 동시 입력, 검증, 사진 및 서버 재시작 후 복원', async () => {
  const created = await api('/api/rooms', {name:'우리의 촬영'});
  assert.equal(created.status,201); const path = '/api/rooms/' + created.data.code;
  let result = await api(path,{action:'members',names:['민지','준호']});
  const [a,b] = result.data.members;
  assert.equal(a.confirmed,false);
  assert.equal((await api(path,{action:'members',names:['민지']})).status,400);
  assert.equal((await api(path,{action:'block',memberId:a.id,day:0,start:20,end:18,reason:'잘못된 시간'})).status,400);
  assert.equal((await api(path,{action:'block',memberId:'missing',day:0,start:18,end:20,reason:'수업'})).status,400);
  await Promise.all([api(path,{action:'block',memberId:a.id,day:0,start:18,end:20,reason:'수업'}), api(path,{action:'block',memberId:b.id,day:0,start:19,end:22,reason:'아르바이트'})]);
  result = await api(path); assert.equal(result.data.blocks.length,2);
  await api(path,{action:'confirm',memberId:a.id,confirmed:true});
  const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9d8AAAAASUVORK5CYII=';
  await api(path,{action:'location',author:'민지',name:'서울숲',address:'서울 성동구',note:'오후 촬영',photo});
  assert.equal((await api(path,{action:'location',author:'민지',name:'위험',address:'주소',photo:'data:image/svg+xml;base64,AAAA'})).status,400);
  await new Promise(resolve => server.close(resolve)); await start();
  result = await api(path); assert.equal(result.data.locations[0].photo,photo); assert.equal(result.data.members[0].confirmed,true); assert.equal(result.data.blocks.length,2);
  await api(path,{action:'deleteMember',id:a.id}); result = await api(path); assert.equal(result.data.members.length,1); assert.equal(result.data.blocks.length,1); assert.equal(result.data.blocks[0].memberId,b.id);
  await api(path,{action:'deleteLocation',id:result.data.locations[0].id}); assert.equal((await api(path)).data.locations.length,0);
  assert.equal((await api('/api/rooms/' + '0'.repeat(32))).status,404);
  const cross = await fetch(base + path,{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://other.example'},body:JSON.stringify({action:'members',names:['침입']})}); assert.equal(cross.status,403);
  assert.equal((await fetch(base + '/')).status,200);
});
