/**
 * Anchoring is a side system, and this is the rule that keeps it detachable.
 *
 * It has no switch of its own. Whether the product mentions anchoring follows
 * from whether anchoring is configured at all, so removing the APTOS_* entries
 * from an environment removes every trace of it -- the home page section, the
 * pricing row, the terms article, the dashboard panel. One less thing to
 * remember, and no way for the copy and the capability to disagree.
 */

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
