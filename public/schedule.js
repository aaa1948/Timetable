export const days = ['월', '화', '수', '목', '금', '토', '일'];
export const time = slot => `${String(Math.floor(slot / 2)).padStart(2, '0')}:${slot % 2 ? '30' : '00'}`;
export function selectedRanges(keys) {
  const ranges = [];
  for (let day = 0; day < 7; day++) {
    for (let slot = 0; slot < 48; slot += 2) {
      if (!keys.has(`${day}:${slot}`)) continue;
      const start = slot;
      while (slot + 2 < 48 && keys.has(`${day}:${slot + 2}`)) slot += 2;
      ranges.push({day, start, end:slot + 2});
    }
  }
  return ranges;
}
// Keep the existing half-hour storage format so saved schedules retain their times.
// Each displayed hour is unavailable if either half overlaps an existing block.
export const conflicts = (blocks, day, slot, memberId = '') => blocks.filter(b => b.day === day && b.start < slot + 2 && b.end > slot && (!memberId || b.memberId === memberId));
export function availableRanges(blocks, day, start = 0, end = 48) {
  const ranges = []; let from = null;
  for (let slot = start; slot <= end; slot += 2) {
    const free = slot < end && !conflicts(blocks, day, slot).length;
    if (free && from === null) from = slot;
    if (!free && from !== null) { ranges.push([from, slot]); from = null; }
  }
  return ranges;
}
