/**
 * `%` and `_` are wildcards to `LIKE`, so a search for either would quietly
 * match every row rather than the character the operator typed.
 */
export function likePattern(term: string): string {
  return `%${term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
}
