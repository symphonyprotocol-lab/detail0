/**
 * Placeholder catalog data for the public pages.
 *
 * The retrieval stack is not implemented yet (architecture.md 21 steps 3-6),
 * so these pages render from a fixture. Every field here has a real home in
 * db/schema.ts; swap this module for a query once Library Search exists.
 *
 * The split below is the i18n seam: measurements, ids and licences are facts
 * and live here, while the words that describe an entry live in the
 * dictionaries under `demo.catalog`. `catalog()` puts the two halves back
 * together for the requested language.
 */
import type { Dictionary } from '@/lib/i18n/dictionary';

type CatalogId = keyof Dictionary['demo']['catalog'];

interface CatalogFacts {
  libraryId: CatalogId;
  domain: string;
  trustScore: number;
  benchmarkScore: number;
  chunks: string;
  documents: number;
  tokens: string;
  sizeMb: number;
  version: string;
  anchored: boolean;
  claimedBy: string | null;
  sourceType: 'GitHub' | 'Website' | 'OpenAPI' | 'Notion';
  sourceLocation: string;
  license: string;
}

export interface CatalogEntry extends CatalogFacts {
  title: string;
  updated: string;
  language: string;
  description: string;
}

/** Domain names read as English labels in the design source, in both languages. */
const FACTS: CatalogFacts[] = [
  {
    libraryId: '/aperture/production-rag',
    domain: 'AI & Engineering',
    trustScore: 96,
    benchmarkScore: 92,
    chunks: '4.8K',
    documents: 342,
    tokens: '1.24M',
    sizeMb: 18.6,
    version: 'v2.4.0',
    anchored: true,
    claimedBy: 'Aperture Labs',
    sourceType: 'GitHub',
    sourceLocation: 'aperture/production-rag',
    license: 'Apache-2.0',
  },
  {
    libraryId: '/polaris/agent-reliability',
    domain: 'Research & Data',
    trustScore: 94,
    benchmarkScore: 90,
    chunks: '3.2K',
    documents: 214,
    tokens: '860K',
    sizeMb: 12.1,
    version: 'v1.8.2',
    anchored: true,
    claimedBy: 'Polaris Research',
    sourceType: 'GitHub',
    sourceLocation: 'polaris/agent-reliability',
    license: 'MIT',
  },
  {
    libraryId: '/regional-lab/asean-compliance',
    domain: 'Legal & Compliance',
    trustScore: 92,
    benchmarkScore: 88,
    chunks: '8.1K',
    documents: 526,
    tokens: '2.1M',
    sizeMb: 34.2,
    version: 'v2026.08',
    anchored: true,
    claimedBy: null,
    sourceType: 'Website',
    sourceLocation: 'compliance.regional-lab.org',
    license: 'CC-BY-4.0',
  },
  {
    libraryId: '/open-methods/research-guide',
    domain: 'Research & Data',
    trustScore: 91,
    benchmarkScore: 86,
    chunks: '2.7K',
    documents: 178,
    tokens: '720K',
    sizeMb: 9.4,
    version: 'v3.1.0',
    anchored: true,
    claimedBy: 'Open Methods',
    sourceType: 'GitHub',
    sourceLocation: 'open-methods/research-guide',
    license: 'CC-BY-SA-4.0',
  },
  {
    libraryId: '/mosaic/model-safety',
    domain: 'AI & Engineering',
    trustScore: 89,
    benchmarkScore: 84,
    chunks: '5.4K',
    documents: 391,
    tokens: '1.4M',
    sizeMb: 22.8,
    version: 'v1.5.0',
    anchored: true,
    claimedBy: 'Mosaic Safety',
    sourceType: 'GitHub',
    sourceLocation: 'mosaic/model-safety',
    license: 'Apache-2.0',
  },
  {
    libraryId: '/vercel/next.js',
    domain: 'Frameworks & Tools',
    trustScore: 96,
    benchmarkScore: 94,
    chunks: '12.5K',
    documents: 2418,
    tokens: '3.8M',
    sizeMb: 84.2,
    version: 'v16.1.0',
    anchored: true,
    claimedBy: 'Vercel',
    sourceType: 'GitHub',
    sourceLocation: 'vercel/next.js',
    license: 'MIT',
  },
  {
    libraryId: '/service-guild/support-ops',
    domain: 'Business & Operations',
    trustScore: 87,
    benchmarkScore: 82,
    chunks: '1.9K',
    documents: 124,
    tokens: '480K',
    sizeMb: 6.8,
    version: 'v4.2.0',
    anchored: true,
    claimedBy: null,
    sourceType: 'Website',
    sourceLocation: 'guild.support/handbook',
    license: 'CC-BY-4.0',
  },
  {
    libraryId: '/acme/drizzle-zh',
    domain: 'Frameworks & Tools',
    trustScore: 88,
    benchmarkScore: 85,
    chunks: '3.6K',
    documents: 246,
    tokens: '910K',
    sizeMb: 14.3,
    version: 'v0.44.5',
    anchored: false,
    claimedBy: null,
    sourceType: 'GitHub',
    sourceLocation: 'acme/drizzle-zh',
    license: 'MIT',
  },
];

export const CATALOG_TOTAL = 12_426;

/** Ids alone, for `generateStaticParams` and anything else that needs no copy. */
export const CATALOG_IDS: readonly string[] = FACTS.map((entry) => entry.libraryId);

export function catalog(t: Dictionary): CatalogEntry[] {
  return FACTS.map((facts) => ({ ...facts, ...t.demo.catalog[facts.libraryId] }));
}

export function findLibrary(t: Dictionary, libraryId: string): CatalogEntry | undefined {
  return catalog(t).find((entry) => entry.libraryId === libraryId);
}
