/**
 * Whether anchoring is presented as a live capability, as a pure rule.
 *
 * The chain half of anchoring exists (move/re0_anchor, published to testnet)
 * but nothing writes to it yet: no leaf construction, no batch workflow, no
 * signer. Meanwhile the marketing pages, the pricing table and the legal terms
 * all describe it in the present tense, and requirement.md 6.4 now forbids
 * exactly that -- a capability may not be claimed before it runs. This flag is
 * how the copy waits for the capability instead of being rewritten twice.
 *
 * `hidden` is the default on purpose. A missing or misspelled variable must not
 * be what puts the claims back on the site; flipping it to `live` has to be a
 * deliberate act, taken when batches are actually confirming on mainnet.
 */
export const ANCHORING_MODES = ['hidden', 'live'] as const;

export type AnchoringMode = (typeof ANCHORING_MODES)[number];

export function isAnchoringMode(value: unknown): value is AnchoringMode {
  return typeof value === 'string' && (ANCHORING_MODES as readonly string[]).includes(value);
}

export function anchoringMode(value: string | undefined): AnchoringMode {
  return isAnchoringMode(value) ? value : 'hidden';
}

/**
 * Does this line of copy talk about anchoring?
 *
 * Some of the claims are items inside localised arrays -- a pricing comparison
 * row, an FAQ entry, a scope card -- which carry no id to filter on. Matching
 * the text is the honest alternative to hard-coding an index, which would
 * silently hide the wrong row the day someone reorders the array.
 *
 * `proof` is in the list because English does not always say "anchoring": the
 * pricing table calls the row "Version proofs". Give this only the short,
 * naming fields -- a row's capability name, a question, a card's kicker and
 * title -- never a whole paragraph, where these words turn up incidentally.
 */
export function mentionsAnchoring(text: string): boolean {
  return /存证|锚定|anchor|aptos|proof/i.test(text);
}
