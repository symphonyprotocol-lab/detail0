/**
 * The caller's network address, as far as it can be trusted.
 *
 * `x-forwarded-for` is a list each proxy appends to, so the *rightmost* entry
 * is the one our own edge observed and everything to its left is whatever the
 * client chose to send. Taking the leftmost entry -- which every console
 * action and the admin sign-in route used to do, while `rateLimitKey` next
 * door deliberately took the rightmost and said why -- let an unauthenticated
 * caller write its own origin into the append-only audit log: a
 * credential-stuffing run could stamp every failed attempt with an address of
 * its choosing, and requirement.md 5.3's network-origin signal became
 * attacker-authored.
 *
 * One helper rather than eleven copies, so the rule cannot drift again.
 */

/** Both `NextRequest.headers` and `await headers()` satisfy this. */
export interface HeaderBag {
  get(name: string): string | null;
}

export function clientAddress(bag: HeaderBag): string | null {
  const forwarded = bag.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  return forwarded || bag.get('x-real-ip') || null;
}
