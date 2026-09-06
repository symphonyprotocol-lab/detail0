import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ImportWizard,
  type GithubImportState,
  type NotionImportState,
} from '@/components/dashboard/import-wizard';
import {
  checkDomainVerificationAction,
  createWorkspaceLibraryAction,
  prepareUploadAction,
  startDomainVerificationAction,
} from './actions';
import { Badge, IconTile, PANEL } from '@/components/dashboard/ui';
import { LockIcon, ShieldCheckIcon } from '@/components/ui/icons';
import { listImportablePages, listImportableRepositories } from '@/lib/application/auth';
import { quoteBuild } from '@/lib/application/plans';
import { fill } from '@/lib/i18n/format';
import { isGithubConnectOutcome } from '@/lib/domain/github';
import { isNotionConnectOutcome } from '@/lib/domain/notion';
import { isNotionOAuthConfigured } from '@/lib/infrastructure/identity/notion';
import { dashboardCopy } from '@/lib/dashboard/demo-data';
import { getMessages } from '@/lib/i18n/server';
import { requireSession } from '@/lib/http/session';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).dashboard.newLibrary.metaTitle };
}

/**
 * The wizard's GitHub state, read once per render: whether this person has
 * connected an account and, if so, which of their repositories may be
 * imported. GitHub being unreachable degrades to "connected, nothing listed"
 * with a flag, rather than taking the whole wizard down.
 */
async function githubImportState(userId: string): Promise<GithubImportState> {
  try {
    const listed = await listImportableRepositories(userId);
    if (!listed.connected) return { connected: false };
    return {
      connected: true,
      login: listed.login,
      repositories: listed.repositories.map((repository) => ({
        fullName: repository.fullName,
        description: repository.description,
        pushedAt: repository.pushedAt,
        archived: repository.archived,
      })),
    };
  } catch (error) {
    console.warn(`github repositories unavailable: ${error instanceof Error ? error.message : 'unknown'}`);
    return { connected: true, login: '', repositories: [], listingFailed: true };
  }
}

/**
 * The wizard's Notion state, read the same way: whether this person has
 * connected a Notion account and which pages that grant can read. Without
 * a Notion integration configured on this deployment the connect button
 * would only ever fail, so the wizard is told to say so instead.
 */
async function notionImportState(userId: string): Promise<NotionImportState> {
  if (!isNotionOAuthConfigured()) return { connected: false, unavailable: true };
  try {
    const listed = await listImportablePages(userId);
    if (!listed.connected) return { connected: false };
    return {
      connected: true,
      workspaceName: listed.workspaceName,
      ownerName: listed.ownerName,
      pages: listed.pages.map((page) => ({
        id: page.id,
        title: page.title,
        url: page.url,
        lastEditedAt: page.lastEditedAt,
      })),
    };
  } catch (error) {
    console.warn(`notion pages unavailable: ${error instanceof Error ? error.message : 'unknown'}`);
    return { connected: true, workspaceName: null, ownerName: null, pages: [], listingFailed: true };
  }
}

export default async function DashboardAddLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ github?: string; notion?: string }>;
}) {
  const session = await requireSession('/dashboard/libraries/new');
  const t = await getMessages();
  const n = t.dashboard.newLibrary;
  const reviewSteps = dashboardCopy(t).reviewSteps;
  const [github, notion, quote] = await Promise.all([
    githubImportState(session.user.id),
    notionImportState(session.user.id),
    /* library-build-billing.md 4.1: the worst case, over the page-fetching
       sources, shown before anything is queued. */
    quoteBuild({ workspaceId: session.workspace.id, fetchesPages: true }),
  ]);
  const number = new Intl.NumberFormat();
  const cost = n.buildCost;
  const params = await searchParams;
  const outcome = params.github;
  const notionOutcome = params.notion;

  return (
    <div className="flex flex-col gap-4">
      {/* Page header -- design source frame `ISF8H`. */}
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex flex-col gap-[5px]">
          <Link
            href="/dashboard/libraries"
            className="text-[12px] tracking-[-0.023em] text-brandink transition-colors hover:text-brand"
          >
            {n.back}
          </Link>
          <h1 className="mt-1.5 text-[25px] leading-[1.5] font-[650] tracking-[-0.045em] text-ink">
            {n.title}
          </h1>
          <p className="text-[13px] leading-[1.5] tracking-[-0.023em] text-muted">
            {n.description}
          </p>
        </div>
        <Badge tone="neutral">{n.draftSaved}</Badge>
      </header>

      <ImportWizard
        action={createWorkspaceLibraryAction}
        prepare={prepareUploadAction}
        github={github}
        githubOutcome={isGithubConnectOutcome(outcome) ? outcome : null}
        notion={notion}
        notionOutcome={isNotionConnectOutcome(notionOutcome) ? notionOutcome : null}
        startVerification={startDomainVerificationAction}
        checkVerification={checkDomainVerificationAction}
      />

      {/* Build cost -- library-build-billing.md 8. */}
      <aside className={`${PANEL} flex flex-col gap-3 p-6`}>
        <div className="flex flex-col gap-[3px]">
          <p className="text-[15px] leading-[1.4] tracking-[-0.025em] text-ink">{cost.title}</p>
          <p className="text-[11px] leading-[1.5] tracking-[-0.023em] text-muted">{cost.description}</p>
        </div>
        <ul className="flex flex-col gap-1.5 text-[12px] tracking-[-0.023em] text-ink">
          <li>
            {fill(cost.formula, {
              base: number.format(quote.rates.baseCalls),
              tokens: number.format(quote.rates.tokensPerCall),
              pages: number.format(quote.rates.pagesPerCall),
            })}
          </li>
          <li>{fill(cost.max, { calls: number.format(quote.maxCalls) })}</li>
          <li className={quote.affordable ? 'text-muted' : 'text-rose'}>
            {fill(cost.remaining, {
              plan: number.format(quote.planAllowanceRemaining),
              addon: number.format(quote.addonBalanceRemaining),
            })}
            {quote.affordable ? null : ` ${cost.insufficient}`}
          </li>
          {quote.mode === 'shadow' ? <li className="text-muted">{cost.shadow}</li> : null}
        </ul>
      </aside>

      {/* Review pipeline -- design source frame `ISF8H`. */}
      <aside className={`${PANEL} flex flex-col gap-4 p-6`}>
        <div className="flex items-center gap-2.5">
          <IconTile>
            <ShieldCheckIcon size={18} />
          </IconTile>
          <div className="flex flex-col gap-[3px]">
            <p className="text-[15px] leading-[1.4] tracking-[-0.025em] text-ink">
              {n.reviewTitle}
            </p>
            <p className="text-[11px] tracking-[-0.023em] text-muted">{n.reviewDescription}</p>
          </div>
        </div>

        <ol className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {reviewSteps.map((entry, index) => (
            <li key={entry.title} className="flex flex-col gap-2">
              <span
                aria-hidden
                className="flex size-6 items-center justify-center rounded-full bg-brandsoft text-[11px] text-brandink"
              >
                {index + 1}
              </span>
              <span className="text-[12px] tracking-[-0.023em] text-ink">{entry.title}</span>
              <span className="text-[10px] leading-[1.5] tracking-[-0.023em] text-muted">
                {entry.note}
              </span>
            </li>
          ))}
        </ol>

        <p className="flex items-center gap-1.5 border-t-2 border-line pt-3.5 text-[11px] tracking-[-0.023em] text-muted">
          <LockIcon size={13} />
          {n.privateSkips}
        </p>
      </aside>
    </div>
  );
}
