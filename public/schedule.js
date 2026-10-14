export const days = ['월', '화', '수', '목', '금', '토', '일'];
export const time = slot => `${String(Math.floor(slot / 2)).padStart(2, '0')}:${slot % 2 ? '30' : '00'}`;
export const conflicts = (blocks, day, slot, memberId = '') => blocks.filter(b => b.day === day && b.start <= slot && b.end > slot && (!memberId || b.memberId === memberId));
export function availableRanges(blocks, day, start = 0, end = 48) {
  const ranges = []; let from = null;
  for (let slot = start; slot <= end; slot++) {
    const free = slot < end && !conflicts(blocks, day, slot).length;
    if (free && from === null) from = slot;
    if (!free && from !== null) { ranges.push([from, slot]); from = null; }
  }
  return ranges;
}
