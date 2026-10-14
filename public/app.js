import { days, time, conflicts, availableRanges } from './schedule.js';
const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let code = new URLSearchParams(location.hash.slice(1)).get('room') || '', room, busy = false, loading = false, selectedSlot;
function message(text, error = false) { $('message').textContent = text; $('message').className = error ? 'error' : ''; $('message').hidden = false; clearTimeout(message.timer); message.timer = setTimeout(() => $('message').hidden = true, error ? 9000 : 3500); }
async function request(path, data) {
  const response = await fetch(path, data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : { cache: 'no-store' });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || '서버에 연결할 수 없습니다.'); return result;
}
async function mutate(data) {
  if (busy) return false;
  busy = true;
  try { room = await request(`/api/rooms/${code}`, data); render(); message('저장했습니다. 팀원들에게도 반영됩니다.'); return true; }
  catch (error) { message(error.message, true); return false; }
  finally { busy = false; }
}
function drawNames() {
  const count = Number($('people-count').value);
  const old = [...$('name-inputs').querySelectorAll('input')].map(i => i.value);
  if (!Number.isInteger(count) || count < 1 || count > 30) return;
  $('name-inputs').innerHTML = Array.from({length: count}, (_, i) => `<label for="name-${i}">팀원 ${i + 1}</label><input id="name-${i}" maxlength="30" placeholder="이름" required value="${escape(old[i] || '')}">`).join('');
}
$('people-count').addEventListener('input', drawNames); drawNames();
const options = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => `<option value="${i + from}">${time(i + from)}</option>`).join('');
$('day').innerHTML = days.map((day, i) => `<option value="${i}">${day}요일</option>`).join('');
$('start').innerHTML = options(0, 47); $('end').innerHTML = options(1, 48); $('start').value = 18; $('end').value = 20;
$('start').addEventListener('change', () => { if (+$('end').value <= +$('start').value) $('end').value = +$('start').value + 1; });
$('create-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  try { const result = await request('/api/rooms', { name: $('project-name').value }); code = result.code; room = result.room; history.replaceState(null, '', `#room=${code}`); render(); } catch (error) { message(error.message, true); } finally { button.disabled = false; }
});
$('invite').addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); message('초대 링크를 복사했습니다. 링크를 가진 팀원은 조회·수정할 수 있어요.'); } catch { window.prompt('이 링크를 복사해 팀원에게 전달하세요.', location.href); } });
for (const page of ['schedule', 'locations']) $('tab-' + page).addEventListener('click', () => {
  for (const target of ['schedule', 'locations']) { $(target + '-page').hidden = target !== page; $('tab-' + target).classList.toggle('active', target === page); $('tab-' + target).setAttribute('aria-selected', String(target === page)); }
});
$('members-form').addEventListener('submit', async event => { event.preventDefault(); if (await mutate({action:'members', names:[...$('name-inputs').querySelectorAll('input')].map(i => i.value)})) $('name-inputs').querySelectorAll('input').forEach(i => i.value = ''); });
$('block-form').addEventListener('submit', async event => {
  event.preventDefault(); if (+$('start').value >= +$('end').value) return message('종료 시간은 시작 시간보다 늦어야 합니다. 자정을 넘는 일정은 요일별로 나눠 입력해 주세요.', true);
  if (await mutate({ action:'block', memberId:$('person').value, day:+$('day').value, start:+$('start').value, end:+$('end').value, reason:$('reason').value })) $('reason').value = '';
});
$('confirm-schedule').addEventListener('click', () => { const member = room.members.find(m => m.id === $('person').value); if (!member) return message('팀원을 먼저 등록해 주세요.', true); mutate({ action:'confirm', memberId:member.id, confirmed:!member.confirmed }); });
$('person').addEventListener('change', renderConfirm); $('view').addEventListener('change', renderSchedule);
function renderConfirm() { const m = room.members.find(m => m.id === $('person').value); $('confirm-schedule').textContent = m?.confirmed ? '입력 완료 해제 (수정 중)' : '선택한 팀원 일정 입력 완료'; }
function render() {
  $('welcome').hidden = true; $('workspace').hidden = false; $('room-name').textContent = room.name;
  $('sync').textContent = '● 저장됨 · 5초마다 자동 동기화'; $('member-count').textContent = `${room.members.length} MEMBERS`;
  for (const id of ['person', 'view']) { const value = $(id).value; $(id).innerHTML = (id === 'view' ? '<option value="">전체 팀원</option>' : '<option value="">팀원을 선택하세요</option>') + room.members.map(m => `<option value="${m.id}">${escape(m.name)}</option>`).join(''); if (room.members.some(m => m.id === value)) $(id).value = value; }
  $('member-list').innerHTML = room.members.map(m => `<div class="item"><div>${escape(m.name)}<span class="member-badge">${m.confirmed ? '✓ 일정 입력 완료' : '○ 일정 확인 전'}</span></div><button class="delete" data-action="deleteMember" data-id="${m.id}" aria-label="${escape(m.name)} 팀원 삭제">삭제</button></div>`).join('');
  renderConfirm(); renderSchedule(); renderLocations();
}
function nameOf(id) { return room.members.find(m => m.id === id)?.name || '삭제된 팀원'; }
function renderSchedule() {
  const filter = $('view').value, confirmed = room.members.length > 0 && room.members.every(m => m.confirmed);
  const pending = room.members.filter(m => !m.confirmed);
  $('pending').textContent = !room.members.length ? '팀원을 등록한 뒤 일정을 입력해 주세요.' : pending.length ? `확인 전: ${pending.map(m => m.name).join(', ')} · 빈칸은 아직 모두 가능한 시간으로 확정되지 않았어요.` : '모든 팀원이 입력을 완료했어요. 겹치는 일정이 없는 시간이 초록색으로 표시됩니다.';
  let html = '<thead><tr><th scope="col">KST</th>' + days.map(d => `<th scope="col">${d}</th>`).join('') + '</tr></thead><tbody>';
  for (let slot = 0; slot < 48; slot++) {
    html += `<tr><td>${time(slot)}</td>`;
    for (let day = 0; day < 7; day++) {
      const blocks = conflicts(room.blocks, day, slot, filter), names = [...new Set(blocks.map(b => nameOf(b.memberId)))];
      const known = filter ? room.members.find(m => m.id === filter)?.confirmed : confirmed;
      const text = blocks.length ? names.join(', ') : known ? (filter ? '가능' : '모두 가능') : '확인 전';
      html += `<td><button class="${blocks.length ? 'busy' : known ? '' : 'unknown'}" data-day="${day}" data-slot="${slot}" aria-label="${days[day]}요일 ${time(slot)} ${escape(text)}">${escape(text)}</button></td>`;
    }
    html += '</tr>';
  }
  $('timetable').innerHTML = html + '</tbody>';
  $('available').innerHTML = !confirmed ? '<p class="hint">전원이 일정 입력을 완료하면 모두 가능한 시간대를 안내합니다.</p>' : days.map((d, day) => `<div class="range"><b>${d}</b><span>${availableRanges(room.blocks, day).map(([a,b]) => `${time(a)}–${time(b)}`).join('<br>') || '가능한 시간 없음'}</span></div>`).join('');
  const blocks = room.blocks.filter(b => !filter || b.memberId === filter).sort((a,b) => a.day - b.day || a.start - b.start);
  $('block-list').innerHTML = blocks.length ? blocks.map(b => `<div class="item"><div><strong>${escape(nameOf(b.memberId))}</strong> · ${days[b.day]} ${time(b.start)}–${time(b.end)}<p>${escape(b.reason)}</p></div><button class="delete" data-action="deleteBlock" data-id="${b.id}">삭제</button></div>`).join('') : '<p class="hint">아직 등록된 불가능한 일정이 없어요.</p>';
  if (selectedSlot) showSlot(...selectedSlot);
}
function showSlot(day, slot) {
  selectedSlot = [day, slot]; const blocks = conflicts(room.blocks, day, slot, $('view').value);
  $('slot-detail').innerHTML = `<strong>${days[day]}요일 ${time(slot)}–${time(slot+1)}</strong><br>` + (blocks.length ? blocks.map(b => `${escape(nameOf(b.memberId))} · ${escape(b.reason)}`).join('<br>') : '등록된 불가능한 일정이 없습니다. 입력 완료 여부도 확인해 주세요.');
}
$('timetable').addEventListener('click', event => { const button = event.target.closest('[data-slot]'); if (button) showSlot(+button.dataset.day, +button.dataset.slot); });
document.addEventListener('click', event => { const button = event.target.closest('[data-action]'); if (!button) return; const warning = button.dataset.action === 'deleteMember' ? '이 팀원과 해당 팀원의 모든 일정을 삭제할까요?' : '이 항목을 삭제할까요?'; if (confirm(warning)) mutate({ action:button.dataset.action, id:button.dataset.id }); });
async function readPhoto(file) {
  if (!file) return '';
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) throw new Error('2MB 이하의 JPG, PNG, WebP 사진을 선택해 주세요.');
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('사진을 읽을 수 없습니다.')); reader.readAsDataURL(file); });
}
$('photo').addEventListener('change', async () => { try { const data = await readPhoto($('photo').files[0]); $('photo-preview').src = data; $('photo-preview').hidden = !data; } catch(error) { $('photo').value = ''; $('photo-preview').hidden = true; message(error.message, true); } });
$('location-form').addEventListener('submit', async event => {
  event.preventDefault(); event.submitter.disabled = true;
  try { if (await mutate({ action:'location', author:$('author').value, name:$('location-name').value, address:$('address').value, note:$('note').value, photo:await readPhoto($('photo').files[0]) })) { $('location-form').reset(); $('photo-preview').hidden = true; } } catch(error) { message(error.message, true); } finally { event.submitter.disabled = false; }
});
function renderLocations() {
  $('location-count').textContent = `${room.locations.length} LOCATIONS`;
  $('location-list').innerHTML = room.locations.length ? room.locations.map(l => `<article class="location-card"><div class="info"><div class="eyebrow">SCOUTED BY ${escape(l.author)}</div><h3>${escape(l.name)}</h3><p>${escape(l.address)}</p>${l.note ? `<p>${escape(l.note)}</p>` : ''}<button class="delete" data-action="deleteLocation" data-id="${l.id}">장소 삭제</button></div><div class="map-links"><a href="https://map.naver.com/p/search/${encodeURIComponent(l.address + ' ' + l.name)}" target="_blank" rel="noopener noreferrer">네이버 지도 ↗</a><a href="https://map.kakao.com/link/search/${encodeURIComponent(l.address + ' ' + l.name)}" target="_blank" rel="noopener noreferrer">카카오맵 ↗</a></div>${l.photo ? `<img src="${escape(l.photo)}" alt="${escape(l.name)} 장소 사진" loading="lazy">` : '<div class="no-photo">첨부된 사진이 없어요</div>'}</article>`).join('') : '<div class="empty"><strong>첫 번째 장소를 기다리고 있어요.</strong>좋은 장면이 떠오르는 장소를 등록해 보세요.<br>지도와 사진을 팀원들과 함께 볼 수 있습니다.</div>';
}
async function sync() {
  if (!code || busy || loading || document.hidden) return;
  loading = true;
  try { const next = await request(`/api/rooms/${code}`); if (!busy && (!room || next.updatedAt > room.updatedAt)) { room = next; render(); } $('sync').textContent = '● 연결됨 · 5초마다 자동 동기화'; }
  catch(error) { $('sync').textContent = '연결 끊김 · 다시 연결하는 중'; if (!room) { $('welcome').hidden = false; message(error.message, true); } }
  finally { loading = false; }
}
window.addEventListener('hashchange', () => location.reload());
document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
if (code) sync(); setInterval(sync, 5000);
