import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const data = resolve(process.env.DATA_DIR || resolve(root, 'data'));
mkdirSync(data, { recursive: true });
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (s, max = 120) => typeof s === 'string' && s.trim() && s.trim().length <= max ? s.trim() : fail('입력 내용을 확인해 주세요.');
function save(code, room) {
  const path = resolve(data, code + '.json');
  writeFileSync(path + '.tmp', JSON.stringify(room));
  renameSync(path + '.tmp', path);
}
function load(code) {
  if (!/^[a-f0-9]{32}$/.test(code) || !existsSync(resolve(data, code + '.json'))) fail('팀 공간을 찾을 수 없습니다. 초대 링크를 확인해 주세요.', 404);
  return JSON.parse(readFileSync(resolve(data, code + '.json'), 'utf8'));
}
async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 5_000_000) fail('첨부 파일이 너무 큽니다.', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('잘못된 요청입니다.'); }
}
const send = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
export function createServer() {
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        const origin = req.headers.origin;
        const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://aaa1948.github.io').split(',').map(s => s.trim());
        if (origin && new URL(origin).host !== req.headers.host && !allowedOrigins.includes(origin)) fail('허용되지 않은 요청입니다.', 403);
        if (origin && allowedOrigins.includes(origin)) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Vary', 'Origin');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        }
        if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
        if (req.method === 'POST' && !req.headers['content-type']?.startsWith('application/json')) fail('JSON 요청만 가능합니다.', 415);
        if (url.pathname === '/api/rooms' && req.method === 'POST') {
          const input = await body(req);
          const code = randomBytes(16).toString('hex');
          const room = { name: str(input.name, 60), members: [], blocks: [], locations: [], updatedAt: Date.now() };
          save(code, room); return send(res, 201, { code, room });
        }
        const match = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{32})$/);
        if (!match) fail('주소를 찾을 수 없습니다.', 404);
        const code = match[1];
        if (req.method === 'GET') return send(res, 200, load(code));
        if (req.method !== 'POST') fail('지원하지 않는 요청입니다.', 405);
        const input = await body(req);
        // Read after the asynchronous body, then mutate and persist synchronously.
        // Concurrent requests cannot overwrite one another's independent changes.
        const room = load(code);
        switch (input.action) {
          case 'members': {
            if (!Array.isArray(input.names) || !input.names.length || room.members.length + input.names.length > 30) fail('팀원은 1~30명까지 등록할 수 있습니다.');
            const names = input.names.map(n => str(n, 30));
            if (new Set([...room.members.map(m => m.name), ...names]).size !== room.members.length + names.length) fail('이름이 중복됩니다. 동명이인은 구분해서 입력해 주세요.');
            room.members.push(...names.map(name => ({ id: randomUUID(), name, confirmed: false }))); break;
          }
          case 'confirm': {
            const member = room.members.find(m => m.id === input.memberId);
            if (!member) fail('팀원을 선택해 주세요.');
            member.confirmed = input.confirmed === true; break;
          }
          case 'block': {
            if (!room.members.some(m => m.id === input.memberId)) fail('팀원을 선택해 주세요.');
            if (!Number.isInteger(input.day) || input.day < 0 || input.day > 6 || !Number.isInteger(input.start) || !Number.isInteger(input.end) || input.start < 0 || input.end > 48 || input.start >= input.end || input.start % 2 || input.end % 2) fail('요일과 시작·종료 시간을 확인해 주세요. 1시간 단위로 입력할 수 있습니다.');
            if (room.blocks.length >= 1500) fail('등록 가능한 일정 수를 초과했습니다.');
            room.blocks.push({ id: randomUUID(), memberId: input.memberId, day: input.day, start: input.start, end: input.end, reason: str(input.reason, 160) }); break;
          }
          case 'deleteBlock': room.blocks = room.blocks.filter(b => b.id !== input.id); break;
          case 'deleteMember': room.members = room.members.filter(m => m.id !== input.id); room.blocks = room.blocks.filter(b => b.memberId !== input.id); break;
          case 'location': {
            if (room.locations.length >= 40) fail('장소는 최대 40개까지 저장할 수 있습니다.');
            let photo = input.photo || '';
            if (typeof photo !== 'string' || (photo && (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo) || photo.length > 2_800_000))) fail('2MB 이하의 JPG, PNG, WebP 사진을 사용해 주세요.');
            room.locations.push({ id: randomUUID(), author: str(input.author, 30), name: str(input.name), address: str(input.address, 200), note: typeof input.note === 'string' ? input.note.trim().slice(0, 400) : '', photo }); break;
          }
          case 'deleteLocation': room.locations = room.locations.filter(l => l.id !== input.id); break;
          default: fail('알 수 없는 작업입니다.');
        }
        room.updatedAt = Math.max(Date.now(), room.updatedAt + 1); save(code, room); return send(res, 200, room);
      }
      const files = { '/cloud.js': ['cloud.js', 'text/javascript'], '/room.js': ['room.js', 'text/javascript'], '/': ['index.html', 'text/html'], '/config.js': ['config.js', 'text/javascript'], '/app.js': ['app.js', 'text/javascript'], '/schedule.js': ['schedule.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
      const file = files[url.pathname];
      if (!file || req.method !== 'GET') fail('주소를 찾을 수 없습니다.', 404);
      res.writeHead(200, { 'Content-Type': file[1] + '; charset=utf-8' }); res.end(readFileSync(resolve(root, 'public', file[0])));
    } catch (error) { if (!error.status) console.error('Request failed:', error.code || error.name, error.message); if (!res.headersSent) send(res, error.status || 500, { error: error.status ? error.message : '저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }); else res.end(); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) createServer().listen(Number(process.env.PORT || 3000), process.env.HOST || '0.0.0.0', () => console.log(`Timetable: http://localhost:${process.env.PORT || 3000}`));
