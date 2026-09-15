/**
 * The arithmetic behind the console's overview: how a "last N days" window
 * is cut, how sparse daily counts become a full series, and how two periods
 * compare. Pure, so the page's figures can be checked without a database.
 * requirement.md 5.3: 运营概览.
 */

/** The windows the overview's range control offers, in days. */
export const OVERVIEW_RANGES = [7, 30, 90] as const;
export type OverviewRange = (typeof OVERVIEW_RANGES)[number];

export const DEFAULT_OVERVIEW_RANGE: OverviewRange = 30;

export function isOverviewRange(value: number): value is OverviewRange {
  return (OVERVIEW_RANGES as readonly number[]).includes(value);
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface OverviewWindow {
  /** UTC midnight of the first day in the window. */
  start: Date;
  /** UTC midnight of the first day of the same-length window before it. */
  previousStart: Date;
  /**
   * Where the previous window's comparison stops: as far into it as `now` is
   * into the current one. The current window runs up to this instant, so a
   * fair "against last period" has to stop the earlier one at the same point
   * -- a full 30 days against 29 and a morning reads as a fall on flat growth.
   */
  previousEnd: Date;
  /** The days in the window, oldest first, as UTC midnights. */
  days: Date[];
}

/**
 * A window of `range` days that ends today, in UTC.
 *
 * Today is included and counts as a full day even when it is not over yet:
 * an operator reading the page at 09:00 wants to see this morning's sign-ups
 * on the chart, not a series that stops at midnight.
 */
export function overviewWindow(now: Date, range: OverviewRange): OverviewWindow {
  const today = utcMidnight(now);
  const start = new Date(today.getTime() - (range - 1) * DAY_MS);
  const previousStart = new Date(start.getTime() - range * DAY_MS);
  const previousEnd = new Date(previousStart.getTime() + (now.getTime() - start.getTime()));
  const days = Array.from({ length: range }, (_, index) => new Date(start.getTime() + index * DAY_MS));
  return { start, previousStart, previousEnd, days };
}

export function utcMidnight(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/** `YYYY-MM-DD` of a UTC day; the key the daily queries group by. */
export function dayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export interface DailyPoint {
  day: Date;
  users: number;
  paid: number;
}

/**
 * Fills a window from two sparse day→count maps. A day with no row is a day
 * with nothing, not a gap: the chart has to draw the zero.
 */
export function fillDailySeries(
  days: Date[],
  users: ReadonlyMap<string, number>,
  paid: ReadonlyMap<string, number>,
): DailyPoint[] {
  return days.map((day) => {
    const key = dayKey(day);
    return { day, users: users.get(key) ?? 0, paid: paid.get(key) ?? 0 };
  });
}

/**
 * Period-over-period movement in basis points, or null when the earlier
 * period was empty. A move from nothing has no percentage -- "+∞%" is not a
 * figure an operator can act on -- so the page shows the absolute count
 * instead.
 *
 * Against a negative baseline (a month whose refunds outran its collections)
 * the size of the move is still measured on the baseline's magnitude, and the
 * sign still says which way things went: money moved, so there is a figure.
 */
export function changeBps(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 10_000);
}

/** A share in basis points, `0` when there is nothing to take a share of. */
export function shareBps(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 10_000);
}

/**
 * The chart's ceiling: the smallest round number at or above the tallest
 * point, so a series of single digits is not drawn against a scale of
 * hundreds. Never below 10, so an empty window still has a visible grid.
 */
export function chartCeiling(max: number): number {
  if (max <= 10) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= max) return candidate;
  }
  return 10 * magnitude;
}

/**
 * Which points carry an axis label: about seven, evenly spaced, always the
 * first and always the last -- the reader has to know where the window
 * starts and that its right edge is today.
 */
export function labelledIndices(pointCount: number, labels = 7): number[] {
  if (pointCount <= 0) return [];
  const last = pointCount - 1;
  const every = Math.max(1, Math.ceil(pointCount / labels));
  const indices: number[] = [];
  for (let index = 0; index < last; index += every) {
    /* Skip a label that would sit on top of the last one. */
    if (last - index <= every / 2) break;
    indices.push(index);
  }
  indices.push(last);
  return indices;
}
