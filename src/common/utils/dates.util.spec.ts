import { addDays, dayStart, localDay } from './dates.util';

describe('date helpers (IST)', () => {
  it('starts an IST day at 18:30 UTC the previous evening', () => {
    expect(dayStart('2026-10-06').toISOString()).toBe('2026-10-05T18:30:00.000Z');
  });

  it('puts a late-evening UTC time on the next IST day', () => {
    expect(localDay(new Date('2026-10-05T19:00:00Z'))).toBe('2026-10-06');
    expect(localDay(new Date('2026-10-05T18:00:00Z'))).toBe('2026-10-05');
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  });
});
