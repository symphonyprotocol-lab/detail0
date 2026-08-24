import { createFromSource } from 'fumadocs-core/search/server';
import { source } from '@/lib/source';

/** Docs search index. Unrelated to knowledge retrieval under /api/v1. */
export const { GET } = createFromSource(source);
