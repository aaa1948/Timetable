let sdkPromise;
export function loadSearchSdk(key) {
  if (!key) return Promise.reject(new Error('장소 검색 서비스가 아직 연결되지 않았습니다. 지금은 지도 클릭으로 위치를 지정해 주세요.'));
  if (globalThis.kakao?.maps?.services) return Promise.resolve(kakao.maps.services);
  if (!sdkPromise) sdkPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    const timer=setTimeout(()=>fail(),15000);
    const fail=()=>{clearTimeout(timer);script.remove();reject(new Error('검색 서비스를 불러오지 못했습니다. 지도 키와 사이트 등록을 확인해 주세요.'));};
    script.src=`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&libraries=services&autoload=false`;
    script.onerror=fail;
    script.onload=()=>{
      if (!globalThis.kakao?.maps?.load) return fail();
      kakao.maps.load(()=>{clearTimeout(timer);if(kakao.maps.services)resolve(kakao.maps.services);else fail();});
    };
    document.head.append(script);
  }).catch(error=>{sdkPromise=null;throw error;});
  return sdkPromise;
}
export async function searchPlaces(query,key,load=loadSearchSdk) {
  query=query.trim(); if(!query)throw new Error('지번 주소나 장소명을 입력해 주세요.');
  const services=await load(key);
  const request=(object,method)=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('검색 시간이 초과되었습니다. 다시 시도해 주세요.')),12000);
    object[method](query,(rows,status)=>{
      clearTimeout(timer);
      if(status===services.Status.OK)resolve(rows);
      else if(status===services.Status.ZERO_RESULT)resolve([]);
      else reject(new Error('검색에 실패했습니다. 잠시 후 다시 시도해 주세요.'));
    },{size:10});
  });
  const [addresses,places]=await Promise.all([request(new services.Geocoder(),'addressSearch'),request(new services.Places(),'keywordSearch')]);
  const seen=new Set();
  return [...places,...addresses].map(row=>({name:row.place_name || row.address_name,address:row.road_address_name || row.address_name,point:{lat:Number(row.y),lng:Number(row.x)}})).filter(row=>{
    if(!Number.isFinite(row.point.lat)||!Number.isFinite(row.point.lng)||Math.abs(row.point.lat)>90||Math.abs(row.point.lng)>180)return false;
    const key=`${row.name}:${row.point.lat}:${row.point.lng}`;if(seen.has(key))return false;seen.add(key);return true;
  }).slice(0,15);
}
