/**
 * Placeholder data for the dashboard surfaces.
 *
 * Usage metering, API keys and billing are not implemented yet
 * (architecture.md 21), so these screens render from this fixture. The shapes
 * mirror db/schema.ts closely enough that each block can be swapped for a
 * query one at a time.
 *
 * Numbers, ids and enum values are facts and stay in this module; the words
 * that label them live in the dictionaries under `demo`. `dashboardCopy()`
 * assembles the two for one language, so a screen calls it once and reads the
 * same shapes it always did.
 */
import { fill } from '@/lib/i18n/format';
import type { Dictionary } from '@/lib/i18n/dictionary';

export interface Workspace {
  name: string;
  /** Avatar monogram, as drawn in the design source. */
  initial: string;
  plan: string;
}

/** Language independent, so the avatar can render without a dictionary. */
export const WORKSPACE_INITIAL = 'M';

export interface Quota {
  used: number;
  limit: number;
}

export const MONTHLY_CALLS: Quota = { used: 642, limit: 1_000 };

export interface StatCard {
  label: string;
  value: string;
  /** Either a caption under the value, or a quota bar in its place. */
  caption?: string;
  quota?: Quota;
}

export interface UsageDay {
  label: string;
  /** Context retrieval calls -- the darker segment at the foot of each bar. */
  retrieval: number;
  /** Document fetches -- the lighter segment above it. */
  docs: number;
}

/** Ten days of call volume, plotted against a fixed 120-call ceiling. */
export const USAGE_SCALE_MAX = 120;

const USAGE_VOLUME: [number, number][] = [
  [3, 19],
  [6, 23],
  [1, 9],
  [2, 17],
  [1, 12],
  [49, 45],
  [31, 39],
  [6, 28],
  [13, 33],
  [4, 20],
];

export interface ApiKey {
  name: string;
  /** Masked prefix + last four, the only form the API ever returns. */
  masked: string;
  createdAt: string;
  lastUsed: string;
}

export const INSTALL_COMMAND = 'npx recall0 setup';

export interface QuickstartTab {
  id: string;
  label: string;
  request: string;
  response: string;
}

const SEARCH_REQUEST = `curl -X GET "https://recall0.com/api/v1/libraries/search?library_name=next.js&query=auth" \\
  -H "Authorization: Bearer $RECALL0_API_KEY"`;

const SEARCH_RESPONSE = `{
  "results": [{
    "library_id": "/vercel/next.js",
    "title": "Next.js",
    "version": "v16.1.0",
    "trust_score": 96,
    "chunks": 12486,
    "anchor": "verified"
  }]
}`;

const CONTEXT_REQUEST = `curl -X GET "https://recall0.com/api/v1/context?library_id=/vercel/next.js&topic=middleware" \\
  -H "Authorization: Bearer $RECALL0_API_KEY"`;

const CONTEXT_RESPONSE = `{
  "library_id": "/vercel/next.js",
  "version": "v16.1.0",
  "tokens": 1842,
  "snippets": [{
    "source": "docs/app/building/middleware.mdx",
    "updated_at": "2026-08-14T09:12:00Z",
    "citation": "/vercel/next.js@v16.1.0#middleware"
  }]
}`;

/* ---------------------------------------------------------------- libraries */

export type ReviewStatus = 'live' | 'pending' | 'blocked' | 'exempt';

export interface DashboardLibrary {
  title: string;
  /** `libraryId · version`, as the design prints it under the title. */
  slug: string;
  version: string;
  initial: string;
  /** Brand colour of the source project, used for the monogram tile. */
  color: string;
  scope: 'public' | 'private';
  revenueShare: boolean;
  chunks: number;
  status: ReviewStatus;
  statusLabel: string;
  updated: string;
}

/* ------------------------------------------------------------------- keys */

export interface ApiKeyDetail extends ApiKey {
  /** `environment · created …`, the sub-line under the key name. */
  environment: string;
  scopes: string[];
}

/* --------------------------------------------------------------- requests */

export const REQUEST_TREND_MAX = 80;

const REQUEST_VOLUME = [31, 44, 26, 50, 38, 69, 58, 76, 65, 77, 53, 55];

export interface RequestLogEntry {
  id: string;
  time: string;
  operation: string;
  surface: 'REST API' | 'MCP';
  library: string;
  key: string;
  status: number;
  latency: string;
}

export const REQUEST_TOTAL = 642;

/* ---------------------------------------------------------------- revenue */

/** Same twelve days as the request trend, priced at the 20% share. */
export const REVENUE_TREND_MAX = 16;

const REVENUE_VOLUME = [6.2, 8.8, 5.2, 10, 7.6, 13.8, 11.6, 15.2, 13, 15.4, 10.6, 11];

export type SettlementStatus = 'accrued' | 'held' | 'paid';

export interface RevenueRow {
  title: string;
  libraryId: string;
  calls: string;
  share: string;
  rate: string;
  period: string;
  status: SettlementStatus;
  statusLabel: string;
  amount: string;
}

export const REVENUE_LIBRARY_TOTAL = 14;

/* ----------------------------------------------------------- access rules */

export interface SourceToggle {
  id: string;
  name: string;
  note: string;
}

export interface QualityFilter {
  /** Stable key, so the editor can pick an icon without matching on the label. */
  id: string;
  label: string;
  options: string[];
}

export const POLICY_BLOCKED = ['legacy-docs'];
export const POLICY_ALLOWED = ['recall0-official'];
export const POLICY_REACHABLE = 12_426;

/* -------------------------------------------------------- add a library */

export interface ImportSource {
  id: string;
  name: string;
  note: string;
}

/* ------------------------------------------------------------------------ */

/** Every string-bearing fixture, resolved for one language. */
export function dashboardCopy(t: Dictionary) {
  const d = t.demo;

  const workspace: Workspace = {
    name: d.workspace.name,
    initial: WORKSPACE_INITIAL,
    plan: fill(t.dashboard.shell.planLine, { plan: d.workspace.plan }),
  };

  const stats: StatCard[] = [
    { label: d.overviewStats.calls, value: '642 / 1,000', quota: MONTHLY_CALLS },
    { label: d.overviewStats.context, value: '18.6k', caption: d.overviewStats.contextCaption },
    { label: d.overviewStats.libraries, value: '4', caption: d.overviewStats.librariesCaption },
    {
      label: d.overviewStats.cost,
      value: d.overviewStats.costValue,
      caption: d.overviewStats.costCaption,
    },
  ];

  const usageDays: UsageDay[] = USAGE_VOLUME.map(([retrieval, docs], index) => ({
    label: d.usageDays[index] ?? '',
    retrieval,
    docs,
  }));

  const apiKeys: ApiKey[] = [
    {
      name: d.keyNames.local,
      masked: 'r0_live_••••ef41',
      createdAt: d.keyDates.local,
      lastUsed: d.when.today,
    },
    {
      name: d.keyNames.cursor,
      masked: 'r0_live_••••d447',
      createdAt: d.keyDates.cursor,
      lastUsed: d.when.twoDays,
    },
  ];

  const quickstartTabs: [QuickstartTab, ...QuickstartTab[]] = [
    {
      id: 'search',
      label: d.quickstartTabs.search,
      request: SEARCH_REQUEST,
      response: SEARCH_RESPONSE,
    },
    {
      id: 'context',
      label: d.quickstartTabs.context,
      request: CONTEXT_REQUEST,
      response: CONTEXT_RESPONSE,
    },
  ];

  const libraries: DashboardLibrary[] = [
    {
      ...d.libraries.nextjs,
      statusLabel: d.libraries.nextjs.status,
      slug: '/vercel/next.js',
      initial: 'N',
      color: '#111827',
      scope: 'public',
      revenueShare: true,
      chunks: 12_486,
      status: 'live',
    },
    {
      ...d.libraries.react,
      statusLabel: d.libraries.react.status,
      slug: '/reactjs/react.dev',
      initial: 'R',
      color: '#149eca',
      scope: 'public',
      revenueShare: false,
      chunks: 8_214,
      status: 'pending',
    },
    {
      ...d.libraries.supabase,
      statusLabel: d.libraries.supabase.status,
      slug: '/supabase/supabase',
      initial: 'S',
      color: '#16a37a',
      scope: 'public',
      revenueShare: false,
      chunks: 9_035,
      status: 'blocked',
    },
    {
      ...d.libraries.handbook,
      statusLabel: d.libraries.handbook.status,
      slug: '/docs/product-handbook',
      initial: 'P',
      color: '#735fce',
      scope: 'private',
      revenueShare: false,
      chunks: 346,
      status: 'exempt',
    },
  ];

  const libraryFilters = [
    { id: 'all', label: d.libraryFilters.all },
    { id: 'live', label: d.libraryFilters.live },
    { id: 'pending', label: d.libraryFilters.pending },
    { id: 'blocked', label: d.libraryFilters.blocked },
  ];

  const libraryStats = [
    { key: 'total', value: '4', label: d.libraryStats.total },
    { key: 'published', value: '1', label: d.libraryStats.published },
    { key: 'review', value: '2', label: d.libraryStats.review },
    { key: 'chunks', value: '30,081', label: d.libraryStats.chunks },
  ];

  const reviewQueue = { ...d.reviewQueue, percent: 68 };

  const apiKeyStats = [
    { key: 'active', value: '2', label: d.apiKeyStats.active },
    { key: 'calls', value: '642', label: d.apiKeyStats.calls },
    { key: 'recent', value: d.when.minutes23, label: d.apiKeyStats.recent },
    { key: 'security', value: d.apiKeyStats.securityValue, label: d.apiKeyStats.security },
  ];

  const scopes = [d.keyScopes.retrieve, d.keyScopes.read];

  const apiKeyDetails: ApiKeyDetail[] = [
    {
      name: d.keyNames.local,
      masked: 'r0_test_••••ef41',
      environment: d.keyEnvironments.local,
      createdAt: d.keyDates.local,
      lastUsed: d.when.minutes23,
      scopes,
    },
    {
      name: d.keyNames.cursor,
      masked: 'r0_live_••••d447',
      environment: d.keyEnvironments.cursor,
      createdAt: d.keyDates.cursor,
      lastUsed: d.when.twoDays,
      scopes,
    },
  ];

  const apiKeyActivity = [
    { name: d.keyNames.local, detail: `${d.keyScopes.retrieve} · 200 OK`, when: d.when.minutes23 },
    { name: d.keyNames.cursor, detail: `${d.keyScopes.read} · 200 OK`, when: d.when.twoDays },
  ];

  const requestStats = [
    { key: 'calls', value: '642', label: d.requestStats.calls },
    { key: 'success', value: '99.2%', label: d.requestStats.success },
    { key: 'latency', value: '186 ms', label: d.requestStats.latency },
    { key: 'tokens', value: '18.6k', label: d.requestStats.tokens },
  ];

  /** Only every other bar carries a label in the design. */
  const trendLabels = (index: number) =>
    index % 2 === 0 ? d.trendDays[index / 2] : undefined;

  const requestTrend = REQUEST_VOLUME.map((value, index) => ({
    label: trendLabels(index),
    value,
  }));

  const revenueTrend = REVENUE_VOLUME.map((value, index) => ({
    label: trendLabels(index),
    value,
  }));

  const requestLog: RequestLogEntry[] = [
    {
      id: 'req_8f2a91',
      time: d.requestLogTimes[0] ?? '',
      operation: 'query-docs',
      surface: 'REST API',
      library: d.libraries.nextjs.title,
      key: d.keyNames.local,
      status: 200,
      latency: '184 ms',
    },
    {
      id: 'req_7c41de',
      time: d.requestLogTimes[1] ?? '',
      operation: 'resolve-library-id',
      surface: 'MCP',
      library: d.libraries.react.title,
      key: d.keyNames.cursor,
      status: 200,
      latency: '96 ms',
    },
    {
      id: 'req_5d8be3',
      time: d.requestLogTimes[2] ?? '',
      operation: 'query-docs',
      surface: 'MCP',
      library: d.libraries.supabase.title,
      key: d.keyNames.cursor,
      status: 200,
      latency: '231 ms',
    },
    {
      id: 'req_4a26cf',
      time: d.requestLogTimes[3] ?? '',
      operation: 'query-docs',
      surface: 'REST API',
      library: d.libraries.handbook.title,
      key: d.keyNames.local,
      status: 403,
      latency: '41 ms',
    },
    {
      id: 'req_39bd72',
      time: d.requestLogTimes[4] ?? '',
      operation: 'resolve-library-id',
      surface: 'REST API',
      library: d.libraries.nextjs.title,
      key: d.keyNames.local,
      status: 200,
      latency: '82 ms',
    },
    {
      id: 'req_1e76a4',
      time: d.requestLogTimes[5] ?? '',
      operation: 'query-docs',
      surface: 'MCP',
      library: d.libraries.react.title,
      key: d.keyNames.cursor,
      status: 200,
      latency: '176 ms',
    },
  ];

  const revenueStats = [
    { key: 'estimate', value: '$128.40', label: d.revenueStats.estimate },
    { key: 'billable', value: '51,360', label: d.revenueStats.billable },
    { key: 'pending', value: '$86.20', label: d.revenueStats.pending },
    { key: 'paid', value: '$412.60', label: d.revenueStats.paid },
  ];

  const revenueFacts: [keyof typeof d.revenueRows, string, string, string, SettlementStatus, string, string][] = [
    ['rag', '/acme/rag-playbook', '18,240', '35.5%', 'accrued', '2026-08', '$45.60'],
    ['drizzle', '/acme/drizzle-zh', '12,905', '25.1%', 'accrued', '2026-08', '$32.26'],
    ['openapi', '/docs/openapi-style', '9,470', '18.4%', 'accrued', '2026-08', '$23.68'],
    ['k8s', '/docs/k8s-runbook', '6,120', '11.9%', 'held', '2026-07', '$15.30'],
    ['postgres', '/docs/pg-tuning', '3,180', '6.2%', 'paid', '2026-06', '$7.95'],
    ['terraform', '/docs/tf-modules', '1,445', '2.9%', 'paid', '2026-06', '$3.61'],
  ];

  const revenueRows: RevenueRow[] = revenueFacts.map(
    ([key, libraryId, calls, percent, status, period, amount]) => ({
      title: d.revenueRows[key],
      libraryId,
      calls,
      share: fill(d.revenueShare, { percent }),
      rate: '20%',
      period,
      status,
      statusLabel: d.settlementStatus[status],
      amount,
    }),
  );

  const sourceGroups: { title: string; items: SourceToggle[] }[] = [
    {
      title: d.sourceGroups.publicTitle,
      items: [
        { id: 'repos', ...d.sourceGroups.repos },
        { id: 'sites', ...d.sourceGroups.sites },
        { id: 'schema', ...d.sourceGroups.schema },
      ],
    },
    {
      title: d.sourceGroups.connectedTitle,
      items: [
        { id: 'notion', ...d.sourceGroups.notion },
        { id: 'uploads', ...d.sourceGroups.uploads },
        { id: 'private', ...d.sourceGroups.private },
      ],
    },
  ];

  /** Threshold groups; the first has no sub-heading in the design. */
  const qualityFilterGroups: { title?: string; items: QualityFilter[] }[] = [
    {
      items: [
        { id: 'reviewState', ...d.qualityFilters.reviewState },
        { id: 'trustScore', ...d.qualityFilters.trustScore },
      ],
    },
    {
      title: d.qualityFilters.repoGroup,
      items: [
        { id: 'stars', ...d.qualityFilters.stars },
        { id: 'license', ...d.qualityFilters.license },
      ],
    },
    {
      title: d.qualityFilters.siteGroup,
      items: [
        { id: 'backlinks', ...d.qualityFilters.backlinks },
        { id: 'referringDomains', ...d.qualityFilters.referringDomains },
        { id: 'organicTraffic', ...d.qualityFilters.organicTraffic },
      ],
    },
  ];

  const account = {
    name: 'Yuzhao',
    initials: 'YZ',
    kind: d.account.kind,
    verified: d.account.verified,
    email: 'yuzhao@example.com',
    provider: 'GitHub',
    joined: d.account.joined,
  };

  const plan = {
    name: 'Free',
    price: '$0',
    period: d.plan.period,
    note: d.plan.note,
    perks: d.plan.perks,
  };

  /** Percentages are derived from the values themselves, not from bar widths. */
  const usageMeters = [
    { ...d.usageMeters.libraries, percent: 80 },
    { ...d.usageMeters.largest, percent: 93 },
    { ...d.usageMeters.calls, percent: 64 },
  ];

  const importSources: ImportSource[] = [
    { id: 'github', name: 'GitHub', note: d.importSources.github },
    { id: 'pdf', name: 'PDF', note: d.importSources.pdf },
    { id: 'markdown', name: 'Markdown', note: d.importSources.markdown },
    { id: 'notion', name: 'Notion', note: d.importSources.notion },
    { id: 'openapi', name: 'OpenAPI', note: d.importSources.openapi },
    { id: 'website', name: 'Website / llms.txt', note: d.importSources.website },
  ];

  return {
    workspace,
    stats,
    usageDays,
    apiKeys,
    quickstartTabs,
    libraries,
    libraryFilters,
    libraryStats,
    reviewQueue,
    libraryPlan: d.libraryPlan,
    apiKeyStats,
    apiKeyDetails,
    apiKeyQuota: d.apiKeyQuota,
    apiKeyActivity,
    requestStats,
    requestTrend,
    requestLog,
    revenueStats,
    revenueTrend,
    revenueRows,
    sourceGroups,
    qualityFilterGroups,
    account,
    plan,
    billingPeriod: d.billingPeriod,
    usageMeters,
    importSteps: d.importSteps,
    importSources,
    reviewSteps: d.reviewSteps,
  };
}
