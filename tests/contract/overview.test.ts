/**
 * The arithmetic behind the console overview: the window a range cuts, the
 * series that fills it, and how two periods compare. Wrong here and every
 * tile on the landing page is wrong in the same direction.
 */
import { describe, expect, it } from 'vitest';
import {
  changeBps,
  chartCeiling,
  dayKey,
  fillDailySeries,
  labelledIndices,
  overviewWindow,
  shareBps,
} from '@/lib/domain/overview';

describe('overviewWindow', () => {
  const now = new Date('2026-09-07T09:15:00Z');

  it('ends on today, counts today as a whole day, and starts range days back', () => {
    const window = overviewWindow(now, 7);
    expect(window.days).toHaveLength(7);
    expect(dayKey(window.start)).toBe('2026-09-01');
    expect(dayKey(window.days[6]!)).toBe('2026-09-07');
    expect(window.start.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('puts the previous window immediately before, with the same length', () => {
    const window = overviewWindow(now, 30);
    expect(dayKey(window.start)).toBe('2026-08-09');
    expect(dayKey(window.previousStart)).toBe('2026-07-10');
    expect((window.start.getTime() - window.previousStart.getTime()) / 86_400_000).toBe(30);
  });

  it('cuts the previous window as far in as now is into the current one', () => {
    const window = overviewWindow(now, 7);
    /* 2026-09-01 00:00 → 09-07 09:15 is 6 days 9h15m; same distance from 08-25. */
    expect(window.previousEnd.toISOString()).toBe('2026-08-31T09:15:00.000Z');
    expect(window.previousEnd.getTime() - window.previousStart.getTime()).toBe(
      now.getTime() - window.start.getTime(),
    );
  });

  it('cuts days at UTC midnight regardless of the hour it is read at', () => {
    const late = overviewWindow(new Date('2026-09-07T23:59:59Z'), 7);
    const early = overviewWindow(new Date('2026-09-07T00:00:01Z'), 7);
    expect(late.start.toISOString()).toBe(early.start.toISOString());
  });
});

describe('fillDailySeries', () => {
  it('draws a zero for a day with no row rather than leaving a gap', () => {
    const { days } = overviewWindow(new Date('2026-09-07T12:00:00Z'), 7);
    const series = fillDailySeries(
      days,
      new Map([['2026-09-01', 4], ['2026-09-07', 1]]),
      new Map([['2026-09-02', 2]]),
    );
    expect(series.map((point) => [point.users, point.paid])).toEqual([
      [4, 0],
      [0, 2],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [1, 0],
    ]);
  });
});

describe('changeBps and shareBps', () => {
  it('reports a rise and a fall against the previous period', () => {
    expect(changeBps(128, 100)).toBe(2800);
    expect(changeBps(75, 100)).toBe(-2500);
    expect(changeBps(100, 100)).toBe(0);
  });

  it('has no percentage for a move from nothing', () => {
    expect(changeBps(12, 0)).toBeNull();
    expect(changeBps(0, 0)).toBeNull();
  });

  it('measures against a negative baseline by its size, keeping the direction', () => {
    /* Last month refunds outran collections by 100; this month netted 50. */
    expect(changeBps(50, -100)).toBe(15_000);
    expect(changeBps(-150, -100)).toBe(-5000);
  });

  it('takes a share of nothing as zero rather than NaN', () => {
    expect(shareBps(3, 40)).toBe(750);
    expect(shareBps(0, 0)).toBe(0);
  });
});

describe('chart scale', () => {
  it('rounds the ceiling up to a figure the grid can be read against', () => {
    expect(chartCeiling(0)).toBe(10);
    expect(chartCeiling(9)).toBe(10);
    expect(chartCeiling(11)).toBe(20);
    expect(chartCeiling(23)).toBe(25);
    expect(chartCeiling(302)).toBe(500);
    expect(chartCeiling(1000)).toBe(1000);
  });

  it('labels about seven points, always including the first and the last', () => {
    expect(labelledIndices(7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(labelledIndices(30)).toEqual([0, 5, 10, 15, 20, 25, 29]);
    expect(labelledIndices(90)).toEqual([0, 13, 26, 39, 52, 65, 78, 89]);
    expect(labelledIndices(1)).toEqual([0]);
    expect(labelledIndices(0)).toEqual([]);
  });

  it('drops a label that would land on top of the last one', () => {
    /* every=2 over 14 points: 12 is one step from 13, closer than half a step. */
    expect(labelledIndices(14)).toEqual([0, 2, 4, 6, 8, 10, 13]);
  });
});
