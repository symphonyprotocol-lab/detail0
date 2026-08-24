/**
 * Placeholder catalog data for the public pages.
 *
 * The retrieval stack is not implemented yet (architecture.md 21 steps 3-6),
 * so these pages render from a fixture. Every field here has a real home in
 * db/schema.ts; swap this module for a query once Library Search exists.
 */
export interface CatalogEntry {
  libraryId: string;
  title: string;
  domain: string;
  trustScore: number;
  benchmarkScore: number;
  chunks: string;
  documents: number;
  tokens: string;
  sizeMb: number;
  updated: string;
  version: string;
  anchored: boolean;
  claimedBy: string | null;
  sourceType: 'GitHub' | 'Website' | 'OpenAPI' | 'Notion';
  sourceLocation: string;
  language: string;
  license: string;
  description: string;
}

export const CATALOG: CatalogEntry[] = [
  {
    libraryId: '/aperture/production-rag',
    title: 'Production RAG Playbook',
    domain: 'AI & Engineering',
    trustScore: 96,
    benchmarkScore: 92,
    chunks: '4.8K',
    documents: 342,
    tokens: '1.24M',
    sizeMb: 18.6,
    updated: '2 小时前',
    version: 'v2.4.0',
    anchored: true,
    claimedBy: 'Aperture Labs',
    sourceType: 'GitHub',
    sourceLocation: 'aperture/production-rag',
    language: 'English · 中文',
    license: 'Apache-2.0',
    description:
      '面向生产环境的 RAG 系统实践手册，覆盖检索策略、评估方法、上线与回归流程。由 Aperture Labs 维护，文档随仓库自动刷新。',
  },
  {
    libraryId: '/polaris/agent-reliability',
    title: 'Agent Reliability Benchmarks',
    domain: 'Research & Data',
    trustScore: 94,
    benchmarkScore: 90,
    chunks: '3.2K',
    documents: 214,
    tokens: '860K',
    sizeMb: 12.1,
    updated: '6 小时前',
    version: 'v1.8.2',
    anchored: true,
    claimedBy: 'Polaris Research',
    sourceType: 'GitHub',
    sourceLocation: 'polaris/agent-reliability',
    language: 'English',
    license: 'MIT',
    description: 'Agent 可靠性评测集与复现实验说明，含失败模式分类和回归基线。',
  },
  {
    libraryId: '/regional-lab/asean-compliance',
    title: 'ASEAN Compliance Monitor',
    domain: 'Legal & Compliance',
    trustScore: 92,
    benchmarkScore: 88,
    chunks: '8.1K',
    documents: 526,
    tokens: '2.1M',
    sizeMb: 34.2,
    updated: '1 天前',
    version: 'v2026.08',
    anchored: true,
    claimedBy: null,
    sourceType: 'Website',
    sourceLocation: 'compliance.regional-lab.org',
    language: '中文 · English',
    license: 'CC-BY-4.0',
    description: '东盟各国合规要求的持续监测汇编，按司法辖区与生效日期组织。',
  },
  {
    libraryId: '/open-methods/research-guide',
    title: 'Open Research Methods',
    domain: 'Research & Data',
    trustScore: 91,
    benchmarkScore: 86,
    chunks: '2.7K',
    documents: 178,
    tokens: '720K',
    sizeMb: 9.4,
    updated: '3 天前',
    version: 'v3.1.0',
    anchored: true,
    claimedBy: 'Open Methods',
    sourceType: 'GitHub',
    sourceLocation: 'open-methods/research-guide',
    language: 'English',
    license: 'CC-BY-SA-4.0',
    description: '开放研究方法指南，覆盖实验设计、数据管理与可复现性检查表。',
  },
  {
    libraryId: '/mosaic/model-safety',
    title: 'Model Safety Casebook',
    domain: 'AI & Engineering',
    trustScore: 89,
    benchmarkScore: 84,
    chunks: '5.4K',
    documents: 391,
    tokens: '1.4M',
    sizeMb: 22.8,
    updated: '5 天前',
    version: 'v1.5.0',
    anchored: true,
    claimedBy: 'Mosaic Safety',
    sourceType: 'GitHub',
    sourceLocation: 'mosaic/model-safety',
    language: 'English',
    license: 'Apache-2.0',
    description: '模型安全事故案例集，含缓解措施、检测方法与事后复盘模板。',
  },
  {
    libraryId: '/vercel/next.js',
    title: 'Next.js 官方文档',
    domain: 'Frameworks & Tools',
    trustScore: 96,
    benchmarkScore: 94,
    chunks: '12.5K',
    documents: 2418,
    tokens: '3.8M',
    sizeMb: 84.2,
    updated: '8 分钟前',
    version: 'v16.1.0',
    anchored: true,
    claimedBy: 'Vercel',
    sourceType: 'GitHub',
    sourceLocation: 'vercel/next.js',
    language: 'English',
    license: 'MIT',
    description: 'Next.js 官方文档，随上游仓库持续刷新。',
  },
  {
    libraryId: '/service-guild/support-ops',
    title: 'Support Operations Manual',
    domain: 'Business & Operations',
    trustScore: 87,
    benchmarkScore: 82,
    chunks: '1.9K',
    documents: 124,
    tokens: '480K',
    sizeMb: 6.8,
    updated: '1 周前',
    version: 'v4.2.0',
    anchored: true,
    claimedBy: null,
    sourceType: 'Website',
    sourceLocation: 'guild.support/handbook',
    language: '中文',
    license: 'CC-BY-4.0',
    description: '客服运营手册，含分级流程、SLA 定义与升级路径。',
  },
  {
    libraryId: '/acme/drizzle-zh',
    title: 'Drizzle ORM 中文文档',
    domain: 'Frameworks & Tools',
    trustScore: 88,
    benchmarkScore: 85,
    chunks: '3.6K',
    documents: 246,
    tokens: '910K',
    sizeMb: 14.3,
    updated: '2 天前',
    version: 'v0.44.5',
    anchored: false,
    claimedBy: null,
    sourceType: 'GitHub',
    sourceLocation: 'acme/drizzle-zh',
    language: '中文',
    license: 'MIT',
    description: 'Drizzle ORM 的中文翻译文档，社区维护。',
  },
];

export const CATALOG_TOTAL = 12_426;

export function findLibrary(libraryId: string): CatalogEntry | undefined {
  return CATALOG.find((entry) => entry.libraryId === libraryId);
}
