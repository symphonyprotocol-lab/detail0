/**
 * The origin recorded in the audit log must be one our own edge observed.
 *
 * `x-forwarded-for` is a list each proxy appends to, so only the rightmost
 * entry is ours; everything left of it is whatever the caller chose to send.
 * The console actions and the admin sign-in route all read the leftmost entry,
 * which let an unauthenticated caller stamp its own address on every failed
 * sign-in in the append-only, year-retained audit log (requirement.md 5.3).
 */
import { describe, expect, it } from 'vitest';
import { clientAddress } from '@/lib/http/client-address';

function bag(headers: Record<string, string>) {
  return { get: (name: string) => headers[name.toLowerCase()] ?? null };
}

describe('clientAddress', () => {
  it('takes the rightmost forwarded entry, which our edge wrote', () => {
    expect(clientAddress(bag({ 'x-forwarded-for': '203.0.113.9, 198.51.100.7' }))).toBe(
      '198.51.100.7',
    );
  });

  it('ignores an address the caller invented to the left of ours', () => {
    /* What an attacker sends; the edge appends its own observation. */
    const forged = clientAddress(bag({ 'x-forwarded-for': '10.0.0.5, 198.51.100.7' }));
    expect(forged).toBe('198.51.100.7');
    expect(forged).not.toBe('10.0.0.5');
  });

  it('handles a single entry and surrounding whitespace', () => {
    expect(clientAddress(bag({ 'x-forwarded-for': '  198.51.100.7  ' }))).toBe('198.51.100.7');
  });

  it('falls back to x-real-ip, then to null', () => {
    expect(clientAddress(bag({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7');
    expect(clientAddress(bag({ 'x-forwarded-for': '', 'x-real-ip': '198.51.100.7' }))).toBe(
      '198.51.100.7',
    );
    expect(clientAddress(bag({}))).toBeNull();
  });
});
