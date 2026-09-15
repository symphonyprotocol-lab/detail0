/**
 * The day boundary the audit anchor commits to.
 *
 * The subject id of an audit leaf is the date, and `anchor_leaf` is unique on
 * it, so anchoring the wrong day writes a record that cannot be corrected in
 * place -- only superseded under a new schema version
 * (aptos-anchoring-proposal.md 4.5.1). Month, year and leap-day rollovers are
 * where a date walk goes wrong, so they are the cases here.
 */
import { describe, expect, it } from 'vitest';
import { previousUtcDay } from '@/lib/application/anchors';

describe('previousUtcDay', () => {
  const cases: [string, string, string][] = [
    ['mid-month', '2026-09-09T13:45:00.000Z', '2026-09-08'],
    ['just after midnight', '2026-09-09T00:00:00.001Z', '2026-09-08'],
    ['exactly midnight', '2026-09-09T00:00:00.000Z', '2026-09-08'],
    ['one second to midnight', '2026-09-09T23:59:59.999Z', '2026-09-08'],
    ['first of a month', '2026-09-01T06:00:00.000Z', '2026-08-31'],
    ['first of a year', '2026-01-01T06:00:00.000Z', '2025-12-31'],
    ['after a leap day', '2028-03-01T06:00:00.000Z', '2028-02-29'],
    ['after a non-leap february', '2026-03-01T06:00:00.000Z', '2026-02-28'],
  ];

  for (const [name, now, expected] of cases) {
    it(`gives ${expected} ${name}`, () => {
      expect(previousUtcDay(new Date(now)).date).toBe(expected);
    });
  }

  /* The window ends at the boundary, so an entry written at 00:00:00.000 the
     next day belongs to the next day's head and not to this one. */
  it('ends the window at midnight UTC of the current day', () => {
    expect(previousUtcDay(new Date('2026-09-09T13:45:00.000Z')).endsAt.toISOString()).toBe(
      '2026-09-09T00:00:00.000Z',
    );
  });

  /* A local-time reading would move the date for anyone east or west of UTC. */
  it('does not depend on where the run happens', () => {
    const late = previousUtcDay(new Date('2026-09-09T23:00:00.000Z')).date;
    const early = previousUtcDay(new Date('2026-09-09T01:00:00.000Z')).date;
    expect(late).toBe(early);
  });
});
