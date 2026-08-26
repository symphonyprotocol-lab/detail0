import { describe, expect, it } from 'vitest';
import { en } from '@/lib/i18n/messages/en';
import { zh } from '@/lib/i18n/messages/zh';
import {
  BILLING_DOCUMENT_KINDS,
  BILLING_DOCUMENT_STATUSES,
  BILLING_STATUS_FILTERS,
  BillingMirrorRefused,
  MAX_DOCUMENT_MINOR,
  isBillingDocumentKind,
  isBillingDocumentStatus,
  isCollected,
  isOutstanding,
  netMinor,
  parseProviderDocument,
  percentFromBps,
  refundRateBps,
  shortDocumentId,
  type BillingMirrorError,
  type ProviderDocumentInput,
} from '@/lib/domain/billing';

const ISSUED = new Date('2026-08-05T09:11:00.000Z');
const PAID = new Date('2026-08-05T09:12:00.000Z');

const INVOICE: ProviderDocumentInput = {
  provider: 'provider-a',
  externalId: 'in_3Qk2ZcJ8x1',
  number: 'INV-2026-0472',
  kind: 'subscription',
  status: 'paid',
  amountMinor: 500,
  currency: 'USD',
  method: 'card',
  issuedAt: ISSUED,
  paidAt: PAID,
  periodStart: new Date('2026-08-05T00:00:00.000Z'),
  periodEnd: new Date('2026-09-05T00:00:00.000Z'),
};

function refusal(input: ProviderDocumentInput): BillingMirrorError | 'accepted' {
  try {
    parseProviderDocument(input);
    return 'accepted';
  } catch (error) {
    if (error instanceof BillingMirrorRefused) return error.code;
    throw error;
  }
}

/**
 * requirement.md 4.1 sells a monthly subscription and a one-off call pack, and
 * nothing else. The mirror is written by adapters we do not control, so the
 * closed set has to be enforced here rather than assumed.
 */
describe('what a billing document can be', () => {
  it('is a subscription period or a call pack', () => {
    expect([...BILLING_DOCUMENT_KINDS]).toEqual(['subscription', 'pack']);
    for (const kind of ['enterprise', 'seat', '', 'Pack']) {
      expect(isBillingDocumentKind(kind)).toBe(false);
    }
  });

  it('carries the provider’s own state vocabulary', () => {
    expect([...BILLING_DOCUMENT_STATUSES]).toEqual([
      'draft',
      'open',
      'paid',
      'failed',
      'refunded',
      'void',
      'uncollectible',
    ]);
    for (const status of ['pending', 'due', '', 'Paid']) {
      expect(isBillingDocumentStatus(status)).toBe(false);
    }
  });

  it('offers every status as a filter, plus "all"', () => {
    expect(BILLING_STATUS_FILTERS[0]).toBe('all');
    expect(BILLING_STATUS_FILTERS).toHaveLength(BILLING_DOCUMENT_STATUSES.length + 1);
  });

  /*
   * A draft is not owed: nothing has been issued, so counting it as
   * outstanding would put money in the "chase this" figure that nobody has
   * been asked for yet.
   */
  it('owes money only once a document has been issued and not paid', () => {
    expect(BILLING_DOCUMENT_STATUSES.filter(isOutstanding)).toEqual(['open', 'failed']);
  });

  /*
   * A refunded document did collect, and then gave some of it back. Dropping
   * it out of revenue entirely would overstate the refund rate's denominator.
   */
  it('counts a refunded document as collected', () => {
    expect(BILLING_DOCUMENT_STATUSES.filter(isCollected)).toEqual(['paid', 'refunded']);
  });
});

describe('mirroring a provider document', () => {
  it('accepts what a provider actually sends', () => {
    const draft = parseProviderDocument(INVOICE);
    expect(draft.number).toBe('INV-2026-0472');
    expect(draft.amountMinor).toBe(500);
    expect(draft.refundedMinor).toBe(0);
    expect(draft.currency).toBe('USD');
    expect(draft.paidAt).toEqual(PAID);
  });

  it('refuses a document with no provider or no external id', () => {
    expect(refusal({ ...INVOICE, provider: '  ' })).toBe('unknown_provider');
    expect(refusal({ ...INVOICE, externalId: '' })).toBe('unknown_external_id');
  });

  it('refuses a kind or a state it has no meaning for', () => {
    expect(refusal({ ...INVOICE, kind: 'seat_licence' })).toBe('unknown_kind');
    expect(refusal({ ...INVOICE, status: 'pending' })).toBe('unknown_status');
  });

  /*
   * The bound is not a product limit. A catalogue whose most expensive line is
   * $5 has no legitimate six-figure document, so a number past it is an
   * adapter posting major units as minor -- and a wrong order of magnitude in a
   * revenue readout is worse than a gap in it.
   */
  it('refuses an amount that is not whole minor units in range', () => {
    for (const amountMinor of [-1, 5.5, Number.NaN, MAX_DOCUMENT_MINOR + 1]) {
      expect(refusal({ ...INVOICE, amountMinor })).toBe('invalid_amount');
    }
    expect(refusal({ ...INVOICE, amountMinor: 0, status: 'void' })).toBe('accepted');
  });

  /*
   * More back than went out is not an over-refund: it is two documents being
   * conflated, or a currency mismatch inside the adapter. Letting it through
   * would drive the month's net negative.
   */
  it('refuses a refund larger than the charge', () => {
    expect(refusal({ ...INVOICE, refundedMinor: 501 })).toBe('invalid_refund');
    expect(refusal({ ...INVOICE, refundedMinor: -1 })).toBe('invalid_refund');
    expect(refusal({ ...INVOICE, refundedMinor: 500, status: 'refunded' })).toBe('accepted');
  });

  it('refuses a refund on a document that was never collected', () => {
    for (const status of ['draft', 'open', 'failed', 'void', 'uncollectible']) {
      expect(refusal({ ...INVOICE, status, refundedMinor: 100 })).toBe('contradictory_status');
    }
  });

  it('refuses a refunded document that says nothing came back', () => {
    expect(refusal({ ...INVOICE, status: 'refunded', refundedMinor: 0 })).toBe(
      'contradictory_status',
    );
  });

  /*
   * requirement.md 4.3 prices the catalogue in USD and stores an order's
   * original amount and currency. A document in another currency is a fact to
   * record and look at, not a fact to overwrite -- so the code is normalised,
   * never replaced.
   */
  it('keeps the currency the provider settled in', () => {
    expect(parseProviderDocument({ ...INVOICE, currency: 'eur' }).currency).toBe('EUR');
    expect(refusal({ ...INVOICE, currency: 'DOLLARS' })).toBe('invalid_currency');
    expect(refusal({ ...INVOICE, currency: '' })).toBe('invalid_currency');
  });

  it('falls back to the provider id when no number was issued', () => {
    expect(parseProviderDocument({ ...INVOICE, number: null }).number).toBe('in_3Qk2ZcJ8x1');
    expect(parseProviderDocument({ ...INVOICE, number: '   ' }).number).toBe('in_3Qk2ZcJ8x1');
  });

  /*
   * requirement.md 4.3 makes a pack balance non-expiring and carried across
   * periods. A period on a pack document would be a validity window, which is
   * the one thing a quota check must never read.
   */
  it('drops the period from a pack, and keeps it on a subscription', () => {
    const pack = parseProviderDocument({ ...INVOICE, kind: 'pack' });
    expect(pack.periodStart).toBeNull();
    expect(pack.periodEnd).toBeNull();
    expect(parseProviderDocument(INVOICE).periodEnd).not.toBeNull();
  });

  /** A payment time on a document nobody paid is a contradiction worth erasing. */
  it('drops a payment time from a document that was not collected', () => {
    expect(parseProviderDocument({ ...INVOICE, status: 'open' }).paidAt).toBeNull();
  });

  /*
   * A method type is routing information; a last-four is card data. Only the
   * type is stored, and an unrecognised one is kept rather than blanked -- a
   * provider can add a method next week.
   */
  it('keeps the method type it was given, or nothing at all', () => {
    expect(parseProviderDocument({ ...INVOICE, method: 'alipay' }).method).toBe('alipay');
    expect(parseProviderDocument({ ...INVOICE, method: null }).method).toBeNull();
    expect(parseProviderDocument({ ...INVOICE, method: '  ' }).method).toBeNull();
  });
});

describe('the money on a document', () => {
  it('nets refunds off the amount without rewriting it', () => {
    expect(netMinor({ amountMinor: 500, refundedMinor: 0 })).toBe(500);
    expect(netMinor({ amountMinor: 500, refundedMinor: 200 })).toBe(300);
    expect(netMinor({ amountMinor: 500, refundedMinor: 500 })).toBe(0);
  });

  it('reads a refund rate off what was collected', () => {
    expect(refundRateBps({ collectedMinor: 100_000, refundedMinor: 420 })).toBe(42);
    expect(refundRateBps({ collectedMinor: 500, refundedMinor: 500 })).toBe(10_000);
    // Nothing collected is not an infinite refund rate.
    expect(refundRateBps({ collectedMinor: 0, refundedMinor: 0 })).toBe(0);
  });

  /*
   * Basis points rather than a float all the way to the screen: going through
   * one is how `0.42%` becomes `0.41999999999999998%`.
   */
  it('prints basis points as a percentage', () => {
    expect(percentFromBps(42)).toBe('0.42');
    expect(percentFromBps(2000)).toBe('20');
    expect(percentFromBps(0)).toBe('0');
    expect(percentFromBps(10_000)).toBe('100');
  });
});

describe('shortDocumentId', () => {
  it('is short enough to sit in a sentence', () => {
    expect(shortDocumentId('01920000-0000-7000-8000-000000000003')).toBe('#01920000');
  });
});

/**
 * The billing screen renders a status on every row and a kind on every
 * document, both straight out of the dictionary. A missing key is not a crash
 * there -- it is `uncollectible` sitting in a column of words.
 */
describe('every mirrored state has words for it', () => {
  it('is spelled out in both languages', () => {
    for (const status of BILLING_DOCUMENT_STATUSES) {
      expect(zh.admin.billing.statuses[status]).toBeTruthy();
      expect(en.admin.billing.statuses[status]).toBeTruthy();
    }
    for (const kind of BILLING_DOCUMENT_KINDS) {
      expect(zh.admin.billing.kinds[kind]).toBeTruthy();
      expect(en.admin.billing.kinds[kind]).toBeTruthy();
    }
  });
});
