import { createFromSource } from 'fumadocs-core/search/server';
import { source } from '@/lib/source';

/** Docs search index. Unrelated to knowledge retrieval under /api/v1. */

/*
 * One index per language, which means each locale has to name an analyser
 * Orama actually ships. It has no Chinese one -- `zh` is rejected outright --
 * so Chinese is indexed with the English analyser, exactly as the whole corpus
 * was before the docs became bilingual. Stemming does nothing useful for
 * Chinese either way; proper segmentation would need `@orama/tokenizers`.
 */
export const { GET } = createFromSource(source, {
  localeMap: { zh: 'english', en: 'english' },
});
