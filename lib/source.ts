import { loader } from 'fumadocs-core/source';
import { docs } from '@/.source';
import { docsI18n } from '@/lib/i18n/docs';

/**
 * Fumadocs loader for the developer documentation site.
 *
 * The docs site is content, not application: it reads MDX from the repository
 * and never touches Postgres, object storage or any use case. architecture.md 4.
 *
 * With `i18n` supplied the loader builds one page tree per language, so callers
 * must say which one they want: `source.getPage(slug, locale)` and
 * `source.getPageTree(locale)`.
 */
export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
  i18n: docsI18n,
});
