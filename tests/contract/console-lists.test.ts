/**
 * The pure parts of a console list: reading the page out of a URL nobody
 * validated, and deciding which page numbers to draw.
 *
 * Both run on every list render and both take input straight from the address
 * bar, so the cases that matter are the hostile ones.
 */
import { describe, expect, it } from 'vitest';
import { pageNumber, pageWindow } from '@/app/admin/(console)/list-params';
import { isUserAccountStatus, USER_ACCOUNT_STATUSES } from '@/lib/domain/admin';

describe('pageNumber', () => {
  it('reads a page from the query string', () => {
    expect(pageNumber('3')).toBe(3);
    expect(pageNumber('1')).toBe(1);
  });

  it('treats anything that is not a page as the first one', () => {
    for (const value of [undefined, '', 'banana', '0', '-4', 'NaN', ['2', '3']]) {
      expect(pageNumber(value)).toBe(1);
    }
  });

  it('caps the page, so a hand-typed offset cannot make Postgres count to a billion', () => {
    expect(pageNumber('99999999')).toBe(10_000);
    expect(pageNumber('99999999', 50)).toBe(50);
  });

  it('ignores trailing junk rather than failing the render', () => {
    expect(pageNumber('4abc')).toBe(4);
  });
});

describe('pageWindow', () => {
  it('never grows past its size, however many pages there are', () => {
    expect(pageWindow(1, 900)).toHaveLength(5);
    expect(pageWindow(450, 900)).toEqual([448, 449, 450, 451, 452]);
  });

  it('stays anchored at both ends instead of sliding off', () => {
    expect(pageWindow(1, 900)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(900, 900)).toEqual([896, 897, 898, 899, 900]);
  });

  it('shrinks to the pages that exist', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(2, 2)).toEqual([1, 2]);
  });

  it('still draws a page when the list is empty', () => {
    expect(pageWindow(1, 0)).toEqual([1]);
  });
});

describe('isUserAccountStatus', () => {
  it('accepts only the two states the console decides between', () => {
    expect(USER_ACCOUNT_STATUSES).toEqual(['active', 'suspended']);
    expect(isUserAccountStatus('active')).toBe(true);
    expect(isUserAccountStatus('suspended')).toBe(true);
  });

  it('refuses anything else a form could post', () => {
    for (const value of ['disabled', 'deleted', '', 'ACTIVE', null, 1, undefined]) {
      expect(isUserAccountStatus(value)).toBe(false);
    }
  });
});
