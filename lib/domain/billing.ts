/**
 * Subscription billing rules, as pure functions. No Next.js, no driver, no fetch.
 *
 * detail0 never moves money. Payments, cards, invoices and refunds belong to an
 * external Payment Provider (requirement.md 4.3), the console's billing screen
 * is a read-only mirror of that provider's state, and every human action --
 * refunding, retrying, reissuing -- happens over there (requirement.md 5.3).
 *
 * So everything here is about one question: what may be written into that
 * mirror, and what does the mirror mean once written. There is no charge, no
 * refund and no price calculation in this file, because none of those are ours
 * to perform.
 *
 * What the mirror is allowed to hold is fixed by architecture.md 11.3: the
 * external id, the status, the amount and the currency. Not a card number, not
 * a billing address, not the provider's rendered invoice.
 */

/* ------------------------------------------------------------------ shapes */

/**
 * What the money bought.
 *
 * Two kinds and no more, because requirement.md 4.1 sells two things: a monthly
 * subscription, and the one-off Additional Calls pack. A pack is not a
 * subscription tier (architecture.md 6.1), which is exactly why it needs its
 * own kind here rather than a `subscription` row with a strange period.
 */
export const BILLING_DOCUMENT_KINDS = ['subscription', 'pack'] as const;

export type BillingDocumentKind = (typeof BILLING_DOCUMENT_KINDS)[number];

export function isBillingDocumentKind(value: unknown): value is BillingDocumentKind {
  return typeof value === 'string' && (BILLING_DOCUMENT_KINDS as readonly string[]).includes(value);
}

/**
 * Where the document stands at the provider.
 *
 * One column covers issuing and payment because the provider models it that
 * way: a document is drafted, issued, then paid or not. Splitting it into an
 * "invoice status" and a "payment status" would invent a distinction the source
 * of truth does not make, and a mirror that reshapes what it mirrors is a
 * mirror an operator cannot reconcile against the provider's own dashboard.
 *
 * `failed` is a payment that was attempted and did not go through; the document
 * is still owed. `uncollectible` is the platform giving up on it. `void` is the
 * document being withdrawn before it was ever owed.
 */
export const BILLING_DOCUMENT_STATUSES = [
  'draft',
  'open',
  'paid',
  'failed',
  'refunded',
  'void',
  'uncollectible',
] as const;

export type BillingDocumentStatus = (typeof BILLING_DOCUMENT_STATUSES)[number];

export function isBillingDocumentStatus(value: unknown): value is BillingDocumentStatus {
  return (
    typeof value === 'string' && (BILLING_DOCUMENT_STATUSES as readonly string[]).includes(value)
  );
}

/** The console's status filter: every status, plus "don't filter". */
export const BILLING_STATUS_FILTERS = ['all', ...BILLING_DOCUMENT_STATUSES] as const;

export type BillingStatusFilter = (typeof BILLING_STATUS_FILTERS)[number];

/**
 * Narrows a query-string value to a filter this list actually serves.
 *
 * `billing_document.status` is a Postgres enum, so an unknown value is not an
 * empty result -- it is `invalid input value for enum` and a 500. Every entry
 * point that takes the filter from a URL has to come through here.
 */
export function isBillingStatusFilter(value: unknown): value is BillingStatusFilter {
  return typeof value === 'string' && (BILLING_STATUS_FILTERS as readonly string[]).includes(value);
}

/**
 * Money the platform is still waiting for.
 *
 * `draft` is deliberately not owed: nothing has been issued, so counting it as
 * outstanding would put money in the operator's "chase this" number that
 * nobody has been asked for yet.
 */
export function isOutstanding(status: BillingDocumentStatus): boolean {
  return status === 'open' || status === 'failed';
}

/**
 * Whether this document's money actually arrived.
 *
 * A refunded document did collect -- and then gave some or all of it back,
 * which is what `refundedMinor` is for. Dropping refunded documents out of
 * revenue entirely would overstate the refund rate's denominator and understate
 * the month.
 */
export function isCollected(status: BillingDocumentStatus): boolean {
  return status === 'paid' || status === 'refunded';
}

/**
 * Whether this kind of document covers a period at all.
 *
 * A pack never does: requirement.md 4.3 makes its balance non-expiring and
 * carried across periods, so a period on one would be a validity window -- the
 * one thing a quota check must never read.
 */
export function hasBillingPeriod(kind: BillingDocumentKind): boolean {
  return kind === 'subscription';
}

/* ------------------------------------------------------------------- money */

/**
 * What a collected document is worth after refunds, in minor units.
 *
 * Refunds are held as their own column rather than by rewriting the amount: the
 * amount is what the customer was charged and is a fact about the past, and a
 * dispute that cannot see both numbers cannot be settled.
 */
export function netMinor(document: { amountMinor: number; refundedMinor: number }): number {
  return document.amountMinor - document.refundedMinor;
}

/**
 * Refunds as a share of what was collected, in basis points.
 *
 * Basis points rather than a float because this ends up on screen as a
 * percentage with two decimals, and going through a float to get there is how
 * `0.42%` becomes `0.41999999999999998%`.
 */
export function refundRateBps(input: { collectedMinor: number; refundedMinor: number }): number {
  if (input.collectedMinor <= 0) return 0;
  return Math.round((input.refundedMinor * 10_000) / input.collectedMinor);
}

/** Basis points as a displayed percentage: 42 -> `0.42`, 2000 -> `20`. */
export function percentFromBps(bps: number): string {
  const percent = bps / 100;
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(2);
}

/* ------------------------------------------------------------------ errors */

/**
 * Why a provider document was refused by the mirror.
 *
 * These are narrower than they could be, on purpose. A refusal means the
 * console keeps showing the state before the event -- so refusing a legitimate
 * refund notification because a field looked odd would leave an operator
 * reading "paid" about money that has gone back. Only contradictions that would
 * make the mirror lie about money are refused; everything else is normalised.
 */
export const BILLING_MIRROR_ERRORS = [
  'unknown_provider',
  'unknown_external_id',
  'unknown_kind',
  'unknown_status',
  'invalid_amount',
  'invalid_refund',
  'invalid_currency',
  'contradictory_status',
] as const;

export type BillingMirrorError = (typeof BILLING_MIRROR_ERRORS)[number];

export function isBillingMirrorError(value: unknown): value is BillingMirrorError {
  return typeof value === 'string' && (BILLING_MIRROR_ERRORS as readonly string[]).includes(value);
}

export class BillingMirrorRefused extends Error {
  constructor(
    readonly code: BillingMirrorError,
    message: string,
  ) {
    super(message);
    this.name = 'BillingMirrorRefused';
  }
}

/* -------------------------------------------------------------- validation */

/** Enough room for any provider id anyone ships, and a bound so none is unbounded. */
const MAX_PROVIDER_LENGTH = 40;
const MAX_EXTERNAL_ID_LENGTH = 200;
const MAX_NUMBER_LENGTH = 64;
/** A method *type* -- `card`, `alipay` -- never an instrument. See `parseProviderDocument`. */
const MAX_METHOD_LENGTH = 40;

/**
 * The largest amount the mirror will accept, in minor units: one million in
 * whatever the currency is. A self-serve catalogue whose most expensive line is
 * $5 has no legitimate six-figure document, so a number past this is a unit
 * mistake in an adapter -- minor units posted as major, or the other way -- and
 * a wrong order of magnitude in a revenue readout is worse than a gap in it.
 */
export const MAX_DOCUMENT_MINOR = 100_000_000;

/** What an adapter hands the mirror, before any of it is trusted. */
export interface ProviderDocumentInput {
  provider: string;
  externalId: string;
  /** The provider's human-facing document number, if it issues one. */
  number?: string | null;
  kind: string;
  status: string;
  amountMinor: number;
  /**
   * Cumulative refunded to date, not this event's delta. Omit it on an event
   * that is not about a refund -- the mirror keeps what the row already has.
   *
   * State it alongside any change to `amountMinor` on a document that has been
   * refunded: the table refuses a refund larger than the charge, so lowering
   * the amount without restating the refund is a write the database rejects.
   */
  refundedMinor?: number;
  currency: string;
  method?: string | null;
  /** Absent on a follow-up event that only reports a state change. */
  issuedAt?: Date | null;
  paidAt?: Date | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}

/**
 * A validated document, ready to write into the mirror.
 *
 * Every field a partial event may leave out is nullable, and null means "this
 * event said nothing about it" rather than "this is empty". The distinction is
 * the whole point: a provider's later notifications about one document -- a
 * refund, a failed retry -- routinely carry the id, the status and the money
 * and nothing else, and a mirror that treated their silence as a value would
 * blank the fields they did not mention.
 *
 * The two nullable fields that are *derived* rather than merely absent --
 * a pack's period and an uncollected document's payment time -- are decided by
 * `hasBillingPeriod` and `isCollected`, which the writer applies to the same
 * draft. Null alone cannot tell those apart, and nothing here pretends it can.
 */
export interface BillingDocumentDraft {
  provider: string;
  externalId: string;
  /** The provider's own number, or null when this event carried none. */
  number: string | null;
  kind: BillingDocumentKind;
  status: BillingDocumentStatus;
  amountMinor: number;
  /**
   * Cumulative refunded to date, or null when this event did not state it.
   *
   * A `refunded` status always states it -- `parseProviderDocument` refuses one
   * that does not -- so a null here only ever means "this event was about
   * something else", and the refund already on the row stands.
   */
  refundedMinor: number | null;
  currency: string;
  method: string | null;
  issuedAt: Date | null;
  paidAt: Date | null;
  periodStart: Date | null;
  periodEnd: Date | null;
}

function trimmed(value: string | null | undefined, max: number): string {
  return (value ?? '').trim().slice(0, max);
}

/**
 * Turns what a provider reported into a row the mirror may hold, or refuses it.
 *
 * Three things happen here that are worth naming.
 *
 * The currency is kept as the provider reported it rather than forced to USD.
 * requirement.md 4.3 prices the catalogue in USD and says an order stores its
 * original amount and currency -- so a document that arrives in another
 * currency is a fact to record and look at, not a fact to overwrite. The
 * console shows the code beside the amount for exactly that reason.
 *
 * The method is a coarse type -- `card`, `alipay`, `paypal` -- and never an
 * instrument. requirement.md 4.3 and architecture.md 11.3 keep card data at the
 * provider, and a last-four is card data by any useful definition. An operator
 * routing a chargeback needs to know it was a card; they do not need to know
 * which one, and this row is not where that would be safe to keep.
 *
 * The period only survives on a subscription document. The pack is a one-off
 * purchase whose balance never expires (requirement.md 4.3), so a period on it
 * would be a validity window -- the one thing quota checks must never read.
 */
export function parseProviderDocument(input: ProviderDocumentInput): BillingDocumentDraft {
  const provider = trimmed(input.provider, MAX_PROVIDER_LENGTH);
  if (provider.length === 0) {
    throw new BillingMirrorRefused('unknown_provider', 'a mirrored document names its provider');
  }

  const externalId = trimmed(input.externalId, MAX_EXTERNAL_ID_LENGTH);
  if (externalId.length === 0) {
    throw new BillingMirrorRefused(
      'unknown_external_id',
      'a mirrored document carries the provider id it mirrors',
    );
  }

  if (!isBillingDocumentKind(input.kind)) {
    throw new BillingMirrorRefused('unknown_kind', `nothing here is sold as "${input.kind}"`);
  }
  if (!isBillingDocumentStatus(input.status)) {
    throw new BillingMirrorRefused('unknown_status', `"${input.status}" is not a billing state`);
  }

  if (
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor < 0 ||
    input.amountMinor > MAX_DOCUMENT_MINOR
  ) {
    throw new BillingMirrorRefused('invalid_amount', 'the amount must be whole minor units');
  }

  /*
   * Absent is not zero. A follow-up notification about a paid document that
   * says nothing about refunds must not wipe the refund already recorded
   * against it, so "not stated" travels as null and the writer keeps the
   * stored value.
   */
  const refundedMinor = input.refundedMinor ?? null;
  if (refundedMinor !== null && (!Number.isSafeInteger(refundedMinor) || refundedMinor < 0)) {
    throw new BillingMirrorRefused('invalid_refund', 'the refunded amount must be whole minor units');
  }
  /*
   * More back than went out is not a partial refund and not an over-refund: it
   * is two documents being conflated, or a currency mismatch inside the
   * adapter. Either way the net would go negative and the month's revenue with
   * it, which is not a number to publish and then explain.
   */
  if (refundedMinor !== null && refundedMinor > input.amountMinor) {
    throw new BillingMirrorRefused('invalid_refund', 'more was refunded than was ever charged');
  }

  /*
   * ISO 4217 is three letters. The list is not enumerated: the provider decides
   * what it settles in, and a mirror that rejects a real document because its
   * code is missing from our table is a mirror that hides money.
   */
  /*
   * Validated whole, never truncated to three characters first: slicing would
   * turn a garbled `DOLLARS` into a confident `DOL`, and a currency the mirror
   * invented is worse than a document it refused.
   */
  const currency = (input.currency ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new BillingMirrorRefused('invalid_currency', 'the currency must be an ISO 4217 code');
  }

  /*
   * A refund against a document that was never collected is a contradiction the
   * console cannot render honestly -- there is no payment for the money to have
   * come back from.
   */
  if (refundedMinor !== null && refundedMinor > 0 && !isCollected(input.status)) {
    throw new BillingMirrorRefused(
      'contradictory_status',
      `a ${input.status} document cannot carry a refund`,
    );
  }
  /*
   * Refused whether the amount is stated as zero or not stated at all, and that
   * is what makes a null refund unambiguous everywhere else: `refunded` is the
   * one status that cannot be reported without a figure, so a null can only
   * ever mean an event that was about something other than the refund.
   */
  if (input.status === 'refunded' && (refundedMinor === null || refundedMinor === 0)) {
    throw new BillingMirrorRefused(
      'contradictory_status',
      'a refunded document has to say how much came back',
    );
  }

  return {
    provider,
    externalId,
    /*
     * Not defaulted to the external id here. A document with no number of its
     * own does need something in the column an operator searches by, but that
     * substitution belongs to the insert: applied here it would be
     * indistinguishable from a provider that really did send a number, and a
     * later event's silence would overwrite `INV-2026-0472` with `in_3Qk2Zc`.
     */
    number: trimmed(input.number, MAX_NUMBER_LENGTH) || null,
    kind: input.kind,
    status: input.status,
    amountMinor: input.amountMinor,
    refundedMinor,
    currency,
    method: trimmed(input.method, MAX_METHOD_LENGTH) || null,
    issuedAt: input.issuedAt ?? null,
    /*
     * A payment time on a document nobody paid is a contradiction, so it is
     * erased. Otherwise it is passed through untouched, including the null
     * that means "this event did not repeat it" -- `isCollected` is what tells
     * the writer which of the two it is looking at.
     */
    paidAt: isCollected(input.status) ? (input.paidAt ?? null) : null,
    periodStart: hasBillingPeriod(input.kind) ? (input.periodStart ?? null) : null,
    periodEnd: hasBillingPeriod(input.kind) ? (input.periodEnd ?? null) : null,
  };
}

/**
 * Enough of a document id to recognise a row by, and short enough to sit in a
 * sentence -- the same treatment `shortPlanVersionId` gives a plan version.
 */
export function shortDocumentId(id: string): string {
  return `#${id.replace(/-/g, '').slice(0, 8)}`;
}
