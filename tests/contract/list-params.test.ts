import { describe, expect, it } from 'vitest';
import { pageNumber, pageWindow, utcInstant, utcStamp } from '@/app/admin/(console)/list-params';

/**
 * A console list's page arrives as a hand-editable query string and leaves as
 * an `OFFSET`, so both ends are bounded here rather than at the query.
 */
describe('pageNumber', () => {
  it('falls back to the first page rather than throwing on nonsense', () => {
    for (const value of [undefined, '0', '-4', 'abc', '', ['2']]) {
      expect(pageNumber(value as string | string[] | undefined)).toBe(1);
    }
  });

  it('reads a page an operator actually asked for', () => {
    expect(pageNumber('3')).toBe(3);
  });

  it('caps the offset a typed URL can ask Postgres to walk', () => {
    expect(pageNumber('99999999')).toBe(10_000);
  });

  it('reads the leading number of a page with junk after it', () => {
    expect(pageNumber('4abc')).toBe(4);
  });
});

/**
 * The footer reports the rows that came back, not the rows that were asked
 * for -- the difference is what keeps a page past the end from claiming a
 * range that holds nothing.
 */
describe('pageWindow', () => {
  it('reads 0-0 when the list is empty', () => {
    expect(pageWindow({ page: 1, total: 0, rows: 0 })).toEqual({
      pageCount: 1,
      from: 0,
      to: 0,
      pages: [1],
    });
  });

  it('numbers the first page from one', () => {
    expect(pageWindow({ page: 1, total: 3182, rows: 50 })).toEqual({
      pageCount: 64,
      from: 1,
      to: 50,
      pages: [1, 2, 3, 4, 5],
    });
  });

  it('centres the window on the active page', () => {
    expect(pageWindow({ page: 10, total: 3182, rows: 50 })).toEqual({
      pageCount: 64,
      from: 451,
      to: 500,
      pages: [8, 9, 10, 11, 12],
    });
  });

  it('pins the window to the end on the last page', () => {
    expect(pageWindow({ page: 64, total: 3182, rows: 32 })).toEqual({
      pageCount: 64,
      from: 3151,
      to: 3182,
      pages: [60, 61, 62, 63, 64],
    });
  });

  it('offers every page when there are fewer than the window is wide', () => {
    expect(pageWindow({ page: 2, total: 120, rows: 50 })).toEqual({
      pageCount: 3,
      from: 51,
      to: 100,
      pages: [1, 2, 3],
    });
  });

  it('claims no range at all past the end of the list', () => {
    expect(pageWindow({ page: 900, total: 12, rows: 0 })).toEqual({
      pageCount: 1,
      from: 0,
      to: 0,
      pages: [1],
    });
  });
});

/**
 * The audit log is read to reconstruct what happened in what order, and console
 * actions arrive in bursts -- so the minute the other lists print is not enough
 * resolution for this one.
 */
describe('utcInstant', () => {
  it('keeps the seconds that separate two entries in the same minute', () => {
    const enrol = new Date('2026-08-26T09:04:26.413Z');
    const signIn = new Date('2026-08-26T09:04:43.390Z');

    expect(utcInstant(enrol)).toBe('2026-08-26 09:04:26');
    expect(utcInstant(signIn)).toBe('2026-08-26 09:04:43');
    expect(utcInstant(enrol)).not.toBe(utcInstant(signIn));
    // The minute-precision formatter is exactly what would collapse them.
    expect(utcStamp(enrol)).toBe(utcStamp(signIn));
  });

  it('reads in UTC wherever it is opened', () => {
    expect(utcInstant(new Date('2026-08-26T23:59:59.999Z'))).toBe('2026-08-26 23:59:59');
  });

  it('renders an absent time as empty rather than a fake one', () => {
    expect(utcInstant(null)).toBe('');
  });
});
