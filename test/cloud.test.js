import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCloudClient } from '../public/cloud.js';
import { availableRanges, conflicts, time } from '../public/schedule.js';
test('기존 30분 일정은 겹치는 전체 1시간 칸을 막는다', () => {
  const blocks = [{day:0,start:19,end:21,memberId:'a'}];
  assert.equal(conflicts(blocks,0,18).length,1);
  assert.equal(conflicts(blocks,0,20).length,1);
  assert.equal(conflicts(blocks,0,22).length,0);
  assert.deepEqual(availableRanges(blocks,0),[[0,18],[22,48]]);
  assert.equal(time(48),'24:00');
});
test('공유 저장 충돌 후 최신 데이터로 재시도하여 다른 팀원 입력을 보존', async () => {
  let current = {name:'팀',members:[],blocks:[],locations:[],updatedAt:1}; let saves=0;
  const client = createCloudClient('https://test.supabase.co','sb_publishable_test',async (url, options) => {
    assert.equal(options.headers.apikey,'sb_publishable_test');
    assert.equal(options.headers.Authorization,undefined);
    const body=JSON.parse(options.body);
    if (url.endsWith('scene_get_room')) return {ok:true,json:async()=>structuredClone(current)};
    if (++saves === 1) {
      current.members.push({id:'other',name:'다른 팀원',confirmed:false}); current.updatedAt++;
      return {ok:false,json:async()=>({message:'SCENE_CONFLICT'})};
    }
    assert.equal(body.p_version,2); current=body.p_room; current.updatedAt=3;
    return {ok:true,json:async()=>current};
  });
  const result = await client('/api/rooms/'+'a'.repeat(32),{action:'members',names:['내 이름']});
  assert.deepEqual(result.members.map(m=>m.name),['다른 팀원','내 이름']); assert.equal(saves,2);
});
test('잘못된 클라우드 주소와 비밀 키를 거부', () => {
  assert.throws(()=>createCloudClient('http://test.supabase.co','sb_publishable_test'));
  assert.throws(()=>createCloudClient('https://test.supabase.co','sb_secret_private'));
});
