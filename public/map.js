import { KAKAO_JS_KEY } from './config.js?v=map-2';
import { searchPlaces } from './place-search.js?v=map-2';
const $ = id => document.getElementById(id);
export const validPoint = p => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat)<=90 && Math.abs(p.lng)<=180;
let map, layer, draftMarker, target, draft, locations=[], savePoint, acceptFormPoint, signature='';
export function setupMap(save, accept) {
  savePoint=save; acceptFormPoint=accept;
  $('search-map').addEventListener('click', runSearch);
  $('map-query').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();runSearch();}});
  $('fit-map').addEventListener('click', fit);
  $('cancel-map-pick').addEventListener('click', cancelPick);
  $('save-map-pick').addEventListener('click', async () => {
    if (!target || !validPoint(draft)) return;
    const selected=target, point={...draft}; $('save-map-pick').disabled=true;
    if (selected.id === 'form') { acceptFormPoint(point); cancelPick(); return; }
    try { if (await savePoint(selected.id, point)) cancelPick(); }
    finally { $('save-map-pick').disabled=!validPoint(draft); }
  });
  $('apply-coordinates').addEventListener('click', () => {
    const lat=$('map-lat').value.trim(), lng=$('map-lng').value.trim();
    const point={lat:Number(lat),lng:Number(lng)};
    if (!lat || !lng || !validPoint(point)) { $('map-status').textContent='위도(-90~90), 경도(-180~180)를 확인해 주세요.'; return; }
    if (!target) { $('map-status').textContent='먼저 위치를 지정할 장소를 선택해 주세요.'; return; }
    choose(point); map?.setView([point.lat,point.lng],16);
  });
  $('unmapped-list').addEventListener('click', e => {
    const button=e.target.closest('[data-locate]');
    const location=locations.find(l=>l.id===button?.dataset.locate);
    if(location) pickLocation(location);
  });
}
function ensureMap() {
  if (map) { map.invalidateSize(); return true; }
  if (!window.L) { $('map-status').textContent='지도를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요. 위도·경도 입력으로 위치를 저장할 수도 있습니다.'; return false; }
  map=L.map('locations-map',{scrollWheelZoom:false}).setView([36.3,127.8],7);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,referrerPolicy:'strict-origin-when-cross-origin',attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'}).addTo(map);
  layer=L.layerGroup().addTo(map);
  map.on('click', e=>{if(target) choose({lat:e.latlng.lat,lng:e.latlng.lng});});
  new ResizeObserver(()=>map.invalidateSize()).observe($('locations-map'));
  draw(); return true;
}
function choose(point) {
  draft=point;
  $('map-lat').value=point.lat.toFixed(6); $('map-lng').value=point.lng.toFixed(6);
  $('save-map-pick').disabled=false;
  if (map) {
    draftMarker?.remove();
    draftMarker=L.marker([point.lat,point.lng],{icon:L.divIcon({className:'map-pin draft-pin',html:'＋',iconSize:[30,30],iconAnchor:[15,15]})}).addTo(map);
  }
  $('map-status').textContent='위치를 확인한 뒤 ‘이 위치 저장’을 눌러 주세요.';
}
export function cancelPick() {
  searchVersion++; $('search-map').disabled=false; $('map-search-results').replaceChildren(); $('map-search-status').textContent=''; target=null; draft=null; draftMarker?.remove(); draftMarker=null;
  $('map-pick-panel').hidden=true; $('map-status').textContent='표시를 누르면 장소 정보를 확인할 수 있어요.';
}
export function pickLocation(location) {
  cancelPick(); target={id:location.id,name:location.name};
  $('map-pick-panel').hidden=false; $('map-pick-title').textContent=`${location.name} · 위치 지정`;
  $('map-lat').value=''; $('map-lng').value=''; $('save-map-pick').disabled=true;
  $('map-status').textContent='지도를 확대·이동한 뒤 정확한 위치를 누르세요. 좌표를 알고 있으면 직접 입력할 수 있어요.';
  $('map-query').value=location.address || (location.name==='새 장소'?'':location.name);
  ensureMap();
  if(validPoint(location.point)) {choose(location.point);map?.setView([location.point.lat,location.point.lng],16);}
  $('map-section').scrollIntoView({behavior:'smooth',block:'start'});
}
function fit() {
  if(!ensureMap())return;
  const points=locations.filter(l=>validPoint(l.point)).map(l=>[l.point.lat,l.point.lng]);
  if(points.length)map.fitBounds(points,{padding:[40,40],maxZoom:16});
  else map.setView([36.3,127.8],7);
}
function draw() {
  if(!map)return;
  layer.clearLayers();
  for(const location of locations.filter(l=>validPoint(l.point))) {
    const school=location.kind==='school';
    const popup=document.createElement('div');
    const title=document.createElement('strong');title.textContent=`${school?'학교':'촬영 장소'} · ${location.name}`;popup.append(title);
    for(const text of [location.address,location.note].filter(Boolean)){const p=document.createElement('p');p.textContent=text;popup.append(p);}
    const edit=document.createElement('button');edit.type='button';edit.textContent='지도 위치 수정';edit.addEventListener('click',()=>pickLocation(location));popup.append(edit);
    const color=/^#[0-9a-f]{6}$/i.test(location.markerColor || '')?location.markerColor:(school?'#e49b31':'#248565');
    const pin=document.createElement('div'); pin.className='place-pin'; pin.style.setProperty('--pin-color',color);
    const head=document.createElement('span'); head.className='place-pin-head'; head.textContent=school?'학':'●';pin.append(head);
    const label=document.createElement('span');label.className='place-pin-label';label.textContent=location.name;pin.append(label);
    const marker=L.marker([location.point.lat,location.point.lng],{title:location.name,alt:location.name,icon:L.divIcon({className:'place-marker',html:pin,iconSize:[44,56],iconAnchor:[22,56]})});
    marker.bindPopup(popup).addTo(layer);
  }
}
export function updateMap(next) {
  locations=next;
  const mapped=locations.filter(l=>validPoint(l.point));
  $('map-count').textContent=`전체 ${locations.length}곳 중 ${mapped.length}곳 표시 · 학교 ${mapped.filter(l=>l.kind==='school').length}곳`;
  $('unmapped-list').replaceChildren();
  for(const location of locations.filter(l=>!validPoint(l.point))){
    const button=document.createElement('button');button.type='button';button.className='secondary';button.dataset.locate=location.id;button.textContent=`${location.name} · 위치 지정`;$('unmapped-list').append(button);
  }
  $('unmapped-help').hidden=mapped.length===locations.length;
  const nextSignature=JSON.stringify(locations.map(l=>[l.id,l.name,l.address,l.note,l.kind,l.point,l.markerColor]));
  if(nextSignature!==signature){signature=nextSignature;draw();if(map&&!target)fit();}
  if(target && target.id!=='form' && !locations.some(l=>l.id===target.id))cancelPick();
}
export function showMap(){ensureMap();fit();}

let searchVersion=0;
async function runSearch() {
  if(!target)return;
  const version=++searchVersion;
  $('search-map').disabled=true; $('map-search-results').replaceChildren(); $('map-search-status').textContent='검색 중…';
  try {
    const results=await searchPlaces($('map-query').value,KAKAO_JS_KEY);
    if(version!==searchVersion)return;
    $('map-search-status').textContent=results.length?`${results.length}개 결과 · 정확한 장소를 선택해 주세요.`:'검색 결과가 없어요. 지역명을 함께 입력하거나 지도에서 직접 선택해 주세요.';
    for(const result of results){
      const button=document.createElement('button');button.type='button';button.className='map-search-result';
      const name=document.createElement('strong');name.textContent=result.name;const address=document.createElement('span');address.textContent=result.address;button.append(name,address);
      button.addEventListener('click',()=>{
        if(version!==searchVersion || !target)return;
        choose(result.point);map?.setView([result.point.lat,result.point.lng],16);
        $('map-search-status').textContent=`선택: ${result.name} · ‘이 위치 저장’을 눌러 적용하세요.`;
        for(const item of $('map-search-results').children)item.setAttribute('aria-pressed',String(item===button));
        $('locations-map').scrollIntoView({behavior:'smooth',block:'center'});
      });
      $('map-search-results').append(button);
    }
  } catch(error){if(version===searchVersion)$('map-search-status').textContent=error.message;}
  finally {if(version===searchVersion)$('search-map').disabled=false;}
}
