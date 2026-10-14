const fail = message => { throw Object.assign(new Error(message), { status:400 }); };
const str = (s, max = 120) => typeof s === 'string' && s.trim() && s.trim().length <= max ? s.trim() : fail('입력 내용을 확인해 주세요.');
export function applyAction(room, input) {
        switch (input.action) {
          case 'members': {
            if (!Array.isArray(input.names) || !input.names.length || room.members.length + input.names.length > 30) fail('팀원은 1~30명까지 등록할 수 있습니다.');
            const names = input.names.map(n => str(n, 30));
            if (new Set([...room.members.map(m => m.name), ...names]).size !== room.members.length + names.length) fail('이름이 중복됩니다. 동명이인은 구분해서 입력해 주세요.');
            room.members.push(...names.map(name => ({ id: crypto.randomUUID(), name, confirmed: false }))); break;
          }
          case 'confirm': {
            const member = room.members.find(m => m.id === input.memberId);
            if (!member) fail('팀원을 선택해 주세요.');
            member.confirmed = input.confirmed === true; break;
          }
          case 'blocks': {
            if (!Array.isArray(input.ranges) || !input.ranges.length || input.ranges.length > 168) fail('저장할 시간을 선택해 주세요.');
            // Validate the whole batch before modifying the original room.
            const draft = { ...room, blocks:[...room.blocks] };
            for (const range of input.ranges) applyAction(draft, { ...range, action:'block', memberId:input.memberId, reason:input.reason });
            room.blocks = draft.blocks; break;
          }
          case 'block': {
            if (!room.members.some(m => m.id === input.memberId)) fail('팀원을 선택해 주세요.');
            if (!Number.isInteger(input.day) || input.day < 0 || input.day > 6 || !Number.isInteger(input.start) || !Number.isInteger(input.end) || input.start < 0 || input.end > 48 || input.start >= input.end || input.start % 2 || input.end % 2) fail('요일과 시작·종료 시간을 확인해 주세요. 1시간 단위로 입력할 수 있습니다.');
            if (room.blocks.length >= 1500) fail('등록 가능한 일정 수를 초과했습니다.');
            room.blocks.push({ id: crypto.randomUUID(), memberId: input.memberId, day: input.day, start: input.start, end: input.end, reason: str(input.reason, 160) }); break;
          }
          case 'deleteBlock': room.blocks = room.blocks.filter(b => b.id !== input.id); break;
          case 'deleteMember': room.members = room.members.filter(m => m.id !== input.id); room.blocks = room.blocks.filter(b => b.memberId !== input.id); break;
          case 'location':
          case 'updateLocation': {
            const existing = input.action === 'updateLocation' ? room.locations.find(l => l.id === input.id) : null;
            if (input.action === 'updateLocation' && !existing) fail('이 장소가 삭제되었습니다. 새로 등록해 주세요.');
            if (!existing && room.locations.length >= 40) fail('장소는 최대 40개까지 저장할 수 있습니다.');
            let photo = input.photo === undefined ? (existing?.photo || '') : input.photo;
            if (typeof photo !== 'string' || (photo && (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo) || photo.length > 2_800_000))) fail('2MB 이하의 JPG, PNG, WebP 사진을 사용해 주세요.');
            const location = { id: existing?.id || crypto.randomUUID(), author: str(input.author, 30), name: str(input.name), address: str(input.address, 200), note: typeof input.note === 'string' ? input.note.trim().slice(0, 400) : '', photo };
            if (existing) room.locations[room.locations.indexOf(existing)] = location;
            else room.locations.push(location);
            break;
          }
          case 'deleteLocation': room.locations = room.locations.filter(l => l.id !== input.id); break;
          default: fail('알 수 없는 작업입니다.');
        }
return room;
}
