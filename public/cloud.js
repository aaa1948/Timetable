import { applyAction } from './room.js?v=map-1';
export function createCloudClient(url, key, fetcher = fetch) {
  if (!/^https:\/\/[^/]+\/?$/.test(url) || !key || key.startsWith('sb_secret_')) throw new Error('Supabase 프로젝트 URL과 공개 키를 확인해 주세요.');
  const headers = { 'Content-Type':'application/json', apikey:key };
  // Legacy anon JWTs require Authorization; publishable keys use apikey only.
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  async function rpc(name, input) {
    const response = await fetcher(`${url.replace(/\/$/,'')}/rest/v1/rpc/${name}`, { method:'POST', headers, body:JSON.stringify(input), cache:'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || '공유 저장소에 연결할 수 없습니다.');
    return result;
  }
  return async (path, data) => {
    if (path === '/api/rooms' && data) return rpc('scene_create_room', { p_name:data.name });
    const code = path.split('/').at(-1);
    if (!data) return rpc('scene_get_room', { p_code:code });
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await rpc('scene_get_room', { p_code:code });
      const version = current.updatedAt;
      const updated = applyAction(current, data);
      try { return await rpc('scene_save_room', { p_code:code, p_version:version, p_room:updated }); }
      catch (error) { if (!error.message.includes('SCENE_CONFLICT')) throw error; }
    }
    throw new Error('다른 팀원이 수정 중입니다. 잠시 후 다시 저장해 주세요.');
  };
}
