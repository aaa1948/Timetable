import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction } from '../public/room.js';
import { selectedRanges } from '../public/schedule.js';
const initial = () => ({members:[{id:'person',name:'팀원'}],blocks:[],locations:[]});
test('여러 요일의 비연속 선택을 연속 구간으로 묶고 자정 경계를 유지', () => {
  assert.deepEqual(selectedRanges(new Set(['0:18','0:20','0:26','6:46'])), [
    {day:0,start:18,end:22},{day:0,start:26,end:28},{day:6,start:46,end:48}
  ]);
  assert.deepEqual(selectedRanges(new Set()),[]);
});
test('여러 시간 저장은 전체 검증 후 적용하므로 일부만 저장되지 않음', () => {
  const room=initial();
  assert.throws(()=>applyAction(room,{action:'blocks',memberId:'person',reason:'수업',ranges:[{day:0,start:18,end:20},{day:7,start:18,end:20}]}));
  assert.equal(room.blocks.length,0);
  applyAction(room,{action:'blocks',memberId:'person',reason:'수업',ranges:[{day:0,start:18,end:20},{day:2,start:26,end:28}]});
  assert.equal(room.blocks.length,2); assert.equal(new Set(room.blocks.map(b=>b.id)).size,2);
  assert.ok(room.blocks.every(b=>b.reason==='수업'));
});
test('장소 수정은 ID와 사진을 유지하고 교체·제거를 지원하며 삭제된 장소를 되살리지 않음', () => {
  const room=initial();
  const fields={author:'팀원',name:'공원',address:'서울',note:'오후'};
  const photo='data:image/png;base64,AAAA';
  applyAction(room,{action:'location',...fields,photo});
  const id=room.locations[0].id;
  applyAction(room,{action:'updateLocation',...fields,id,name:'새 장소'});
  assert.equal(room.locations.length,1); assert.equal(room.locations[0].id,id); assert.equal(room.locations[0].photo,photo); assert.equal(room.locations[0].name,'새 장소');
  applyAction(room,{action:'updateLocation',...fields,id,photo:'data:image/jpeg;base64,BBBB'});
  assert.equal(room.locations[0].photo,'data:image/jpeg;base64,BBBB');
  applyAction(room,{action:'updateLocation',...fields,id,photo:''}); assert.equal(room.locations[0].photo,'');
  applyAction(room,{action:'deleteLocation',id});
  assert.throws(()=>applyAction(room,{action:'updateLocation',...fields,id})); assert.equal(room.locations.length,0);
});
