/**
 * Shared reading of the console lists' query string.
 *
 * Every list is a GET form, so its state lives in the URL and arrives as
 * unvalidated strings. These narrow that to the values a screen actually
 * supports before anything reaches a query.
 */

/** One page of a console list. Exports take the full extract instead. */
export const PAGE_SIZE = 50;

export function searchTerm(value: string | string[] | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, 200);
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Falls back rather than throwing: a hand-edited URL should not 500. */
export function oneOf<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** `YYYY-MM-DD` in UTC, so a row reads the same wherever it is opened. */
export function utcDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : '';
}

/** `YYYY-MM-DD HH:mm` in UTC, for a list where the minute is the useful unit. */
export function utcStamp(value: Date | null): string {
  if (!value) return '';
  const iso = value.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

/**
 * `YYYY-MM-DD HH:mm:ss` in UTC, the shape the audit log prints.
 *
 * The seconds are not decoration. Console actions arrive in bursts -- an invite
 * and the enrolment it triggers land inside the same minute -- and a log whose
 * whole point is to show what happened in what order must not render two
 * chained entries with the same timestamp.
 */
export function utcInstant(value: Date | null): string {
  return value ? value.toISOString().slice(0, 19).replace('T', ' ') : '';
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1) {
    return parts
      .slice(0, 2)
      .map((part) => (Array.from(part)[0] ?? '').toUpperCase())
      .join('');
  }
  return Array.from(name).slice(0, 2).join('').toUpperCase() || '?';
}

/** Bytes as the console shows them: `18.6 MB`, `4.3 kB`, `—` for nothing. */
export function bytes(value: number): string {
  if (!value) return '—';
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 100 || unit === 0 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`;
}

/** Minor units to a displayed amount, e.g. 500 -> `$5.00`. */
export function money(minor: number, currency = 'USD'): string {
  const symbol = currency === 'USD' ? '$' : `${currency} `;
  const sign = minor < 0 ? '−' : '';
  return `${sign}${symbol}${(Math.abs(minor) / 100).toFixed(2)}`;
}

/**
 * A hand-edited `?page=` is bounded here rather than at the query.
 *
 * The page number becomes an `OFFSET`, and Postgres will happily walk billions
 * of rows to satisfy one; the cap keeps a typed URL from turning into a scan.
 */
const MAX_PAGE = 10_000;

export function pageNumber(value: string | string[] | undefined): number {
  if (typeof value !== 'string') return 1;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, MAX_PAGE);
}

export interface PageWindow {
  pageCount: number;
  /** 1-based range of the rows actually on screen; `0`–`0` when there are none. */
  from: number;
  to: number;
  /** The page numbers the footer offers, a window around the active one. */
  pages: number[];
}

/**
 * The footer's view of one page, derived after the query rather than before it.
 *
 * `rows` is what came back, not what was asked for, so a page past the end
 * reads `0`–`0` instead of claiming a range that holds nothing.
 */
export function pageWindow(input: {
  page: number;
  total: number;
  rows: number;
  size?: number;
  span?: number;
}): PageWindow {
  const size = input.size ?? PAGE_SIZE;
  const span = input.span ?? 5;
  const pageCount = Math.max(1, Math.ceil(input.total / size));
  const offset = (input.page - 1) * size;

  const width = Math.min(span, pageCount);
  const first = Math.min(Math.max(1, input.page - Math.floor(width / 2)), pageCount - width + 1);

  return {
    pageCount,
    from: input.rows === 0 ? 0 : offset + 1,
    to: input.rows === 0 ? 0 : offset + input.rows,
    pages: Array.from({ length: width }, (_, index) => first + index),
  };
}
