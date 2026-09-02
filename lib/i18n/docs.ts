import { defineI18n } from 'fumadocs-core/i18n';
import { LOCALES } from '@/lib/i18n/locale';

/**
 * The docs site's half of the language setup.
 *
 * `defaultLanguage` is not "the language a visitor gets" -- that is still
 * decided per request by `currentLocale()`. It names the language whose files
 * carry no suffix on disk, which for this repository is Chinese: `index.mdx` is
 * Chinese and `index.en.mdx` is its translation. It is also the fallback, so a
 * page that has not been translated yet renders in Chinese rather than 404ing.
 *
 * `hideLocale: 'always'` keeps the locale out of the URL, because this product
 * never puts it there (lib/i18n/locale.ts). `/docs/anchoring` is the address in
 * both languages and the cookie decides which one renders -- which is why the
 * docs pages are rendered per request rather than prerendered, the same trade
 * every other page in this app already makes.
 *
 * Fumadocs' own i18n middleware is deliberately not mounted: nothing needs to
 * rewrite a URL that never carries a locale, and the locale is handed to
 * `getPage`/`getPageTree` explicitly instead.
 */
export const docsI18n = defineI18n({
  languages: [...LOCALES],
  defaultLanguage: 'zh',
  hideLocale: 'always',
});
