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

/**
 * The page a list is on, 1-based.
 *
 * Clamped rather than validated: `?page=0`, `?page=-3` and `?page=banana` are
 * all a request for the first page, and an upper bound stops a hand-typed
 * `?page=99999999` turning into an offset Postgres has to count past.
 */
export function pageNumber(value: string | string[] | undefined, max = 10_000): number {
  if (typeof value !== 'string') return 1;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, max);
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

/** `YYYY-MM-DD HH:mm` in UTC, the shape the audit log prints. */
export function utcStamp(value: Date | null): string {
  if (!value) return '';
  const iso = value.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
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
 * The page numbers to draw around the current one.
 *
 * A console list can run to hundreds of pages, and a footer that prints every
 * one of them is unusable; a fixed window keeps the control the same size
 * whatever the total, and stays anchored at both ends rather than sliding off.
 */
export function pageWindow(activePage: number, totalPages: number, size = 5): number[] {
  if (totalPages <= 0) return [1];
  const span = Math.min(size, totalPages);
  const start = Math.min(Math.max(1, activePage - Math.floor(span / 2)), totalPages - span + 1);
  return Array.from({ length: span }, (_, index) => start + index);
}
