import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchPlaces,loadSearchSdk} from '../public/place-search.js';
const services=(status='OK')=>({Status:{OK:'OK',ZERO_RESULT:'ZERO',ERROR:'ERROR'},
Geocoder:class{addressSearch(q,cb){cb([{address_name:q,x:'126.51',y:'35.66'}],status);}},
Places:class{keywordSearch(q,cb){cb([{place_name:q,address_name:'부안군',x:'126.51',y:'35.66'},{place_name:'오류',x:'NaN',y:'3'}],status);}}});
test('지번 및 장소명 결과를 좌표로 변환하고 중복·잘못된 좌표를 제외',async()=>{
 const rows=await searchPlaces(' 고사포해수욕장 ','key',async()=>services());
 assert.equal(rows.length,1);assert.equal(rows[0].name,'고사포해수욕장');assert.deepEqual(rows[0].point,{lat:35.66,lng:126.51});
});
test('빈 검색어, 키 누락, 서비스 오류와 결과 없음 처리',async()=>{
 await assert.rejects(searchPlaces('','key'),/입력/);
 await assert.rejects(loadSearchSdk(''),/아직 연결/);
 await assert.rejects(searchPlaces('서울','key',async()=>services('ERROR')),/실패/);
 assert.deepEqual(await searchPlaces('서울','key',async()=>services('ZERO')),[]);
});
