import { loader } from 'fumadocs-core/source';
import { docs } from '@/.source';

/**
 * Fumadocs loader for the developer documentation site.
 *
 * The docs site is content, not application: it reads MDX from the repository
 * and never touches Postgres, object storage or any use case. architecture.md 4.
 */
export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});
