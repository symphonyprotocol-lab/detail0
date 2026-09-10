import Link from 'next/link';
import { Button, SectionHeading } from '@/components/ui/primitives';
import { ClaudeIcon, CodexIcon, CursorIcon, McpIcon } from '@/components/ui/brand-icons';
import { DirectorySearch } from '@/components/site/directory-search';
import { LibraryTable } from '@/components/site/library-table';
import { McpConnect } from '@/components/site/mcp-connect';
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BracesIcon,
  CircleCheckIcon,
  ClockIcon,
  KeyIcon,
  PlusIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SquareTerminalIcon,
} from '@/components/ui/icons';
import { listPublicLibraries, POPULARITY_WINDOW_DAYS } from '@/lib/application/libraries';
import { fill } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';

/** Vendor logomarks where the surface has one; the design source's glyph otherwise. */
const SURFACES = [
  { label: 'Claude', Icon: ClaudeIcon },
  { label: 'Codex', Icon: CodexIcon },
  { label: 'Cursor', Icon: CursorIcon },
  { label: 'REST API', Icon: BracesIcon },
  { label: 'MCP', Icon: McpIcon },
];

/** Where the public site lives when the deployment does not say. */
const PUBLIC_ORIGIN = 'https://re0.com';

export default async function HomePage() {
  const t = await getMessages();
  /* The MCP endpoint a person pastes into their client: the one thing every
     surface in the hero row shares. Anonymous use rides the trial limit; an
     API key from the dashboard lifts it (requirement.md 9.3). */
  const mcpUrl = `${(process.env.APP_BASE_URL ?? PUBLIC_ORIGIN).replace(/\/$/, '')}/mcp`;
  /* The featured table is the live catalogue's head, not copy. */
  const featured = (await listPublicLibraries({ sort: 'popular', limit: 6 })).map((row) => ({
    libraryId: row.publicId,
    title: row.title,
    domain: row.domainTag ?? row.publicId,
    trustScore: row.trustScore,
    chunks: row.totalChunks.toLocaleString('en-US'),
    updated: row.updatedAt ? new Date(row.updatedAt).toISOString().slice(0, 10) : '—',
  }));
  return (
    <>
      {/* Hero -- geometry, type and icons follow the design source frame `hRx0w`. */}
      <section>
        <div className="mx-auto flex w-full max-w-[1080px] flex-col items-start px-5 pt-[72px] pb-[40px]">
          <p className="flex w-full items-center gap-[7px] text-[12px] leading-[1.5] font-[650] text-brandink">
            <ShieldCheckIcon size={15} />
            {t.home.badge}
          </p>

          <h1 className="mt-4 text-[38px] leading-[1.04] font-[650] tracking-[-0.052em] text-ink sm:text-[48px]">
            {t.home.title}
          </h1>

          <p className="mt-[18px] max-w-full text-[17px] leading-[1.7] tracking-[-0.025em] text-muted">
            {t.home.lede}
          </p>

          <div className="mt-6 flex w-full flex-wrap items-center gap-2.5">
            <McpConnect url={mcpUrl} copyLabel={t.home.install} copiedLabel={t.home.installCopied} />
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-[20px] border-2 border-line bg-card px-5 text-[14px] font-medium tracking-[-0.029em] text-ink shadow-[0_4px_10px_rgba(45,45,83,0.1),0_1px_1px_rgba(45,45,83,0.1)] transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:bg-subtle hover:shadow-[0_10px_22px_-8px_rgba(3,26,30,0.24)]"
            >
              <KeyIcon />
              {t.home.getKey}
            </Link>
            <Link
              href="/playground"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-[20px] border-2 border-line bg-card px-5 text-[14px] font-medium tracking-[-0.029em] text-ink shadow-[0_4px_10px_rgba(45,45,83,0.1),0_1px_1px_rgba(45,45,83,0.1)] transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:bg-subtle hover:shadow-[0_10px_22px_-8px_rgba(3,26,30,0.24)]"
            >
              <SparklesIcon size={16} />
              {t.home.cli.tryOnline}
            </Link>
          </div>

          {/* The CLI (packages/cli): one command that writes the MCP entry
              into every client on the machine, for people who would rather
              not paste the endpoint by hand. */}
          <div className="mt-6 flex w-full flex-col gap-2.5">
            <p className="flex items-center gap-2 text-[12px] font-[650] tracking-[-0.029em] text-ink">
              <SquareTerminalIcon size={15} className="text-brand" />
              {t.home.cli.title}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <McpConnect
                url={t.home.cli.command}
                copyLabel={t.home.cli.copy}
                copiedLabel={t.home.cli.copied}
              />
              <p className="max-w-[46ch] text-[11px] leading-[1.6] tracking-[-0.029em] text-muted">
                {t.home.cli.note}
              </p>
            </div>
          </div>

          <ul className="mt-5 flex w-full flex-wrap items-center gap-x-5 gap-y-2 text-[11px] tracking-[-0.029em] text-muted">
            {t.home.heroPoints.map((p) => (
              <li key={p} className="flex items-center gap-1.5">
                <CircleCheckIcon size={14} className="text-brand" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Knowledge directory -- design source frame `EG2Gu`. */}
      <section className="mx-auto w-full max-w-[1080px] px-5 pt-6 pb-[70px]">
        <SectionHeading
          eyebrow="KNOWLEDGE DIRECTORY"
          title={t.home.directoryTitle}
          action={
            <Button
              href="/libraries/claim"
              className="shadow-[0_4px_10px_rgba(0,150,133,0.26)] hover:-translate-y-0.5 hover:shadow-[0_10px_22px_-8px_rgba(0,150,133,0.5)]"
            >
              <PlusIcon size={15} />
              {t.home.submitLibrary}
            </Button>
          }
        />

        <div className="mt-6">
          <div className="flex flex-wrap items-start gap-3 pb-[18px]">
            <DirectorySearch
              placeholder={t.home.searchPlaceholder}
              submitLabel={t.home.cli.searchSubmit}
            />
            {/* The featured table is the popular head; both toggles open the
                full directory in that order. */}
            <div className="flex h-[46px] shrink-0 items-center rounded-lg border-2 border-line bg-card/60 p-[5px]">
              <Link
                href="/libraries?sort=popular"
                className="flex h-9 items-center gap-1.5 rounded-md bg-brandsoft px-3 text-[12px] font-[550] tracking-[-0.027em] text-brandink"
              >
                <SparklesIcon size={15} />
                {t.home.popular}
              </Link>
              <Link
                href="/libraries?sort=recent"
                className="flex h-9 items-center gap-1.5 rounded-md px-3 text-[12px] font-[550] tracking-[-0.027em] text-muted transition-colors hover:bg-subtle hover:text-ink"
              >
                <ClockIcon size={15} />
                {t.home.recentlyUpdated}
              </Link>
            </div>
          </div>

          <LibraryTable entries={featured} />

          <div className="flex flex-wrap items-center justify-between gap-3 px-0.5 pt-3.5 text-[11px] tracking-[-0.029em]">
            <p className="text-muted">
              {fill(t.home.sampleNote, { count: featured.length, days: POPULARITY_WINDOW_DAYS })}
            </p>
            <Link
              href="/libraries"
              className="flex items-center gap-[5px] font-semibold text-brandink hover:underline"
            >
              {t.home.viewFullCatalog}
              <ArrowUpRightIcon size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* Surfaces -- design source frame `jByip`. */}
      <section className="mx-auto w-full max-w-[1080px] px-5 pt-11 pb-[54px]">
        <p className="text-center text-[13px] tracking-[-0.029em] text-muted">
          {t.home.surfacesNote}
        </p>
        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-4 sm:justify-between sm:px-[47px]">
          {SURFACES.map(({ label, Icon }) => (
            <li
              key={label}
              className="flex items-center gap-2 text-[15px] font-[650] tracking-[-0.025em] text-steel/78"
            >
              <Icon size={20} />
              {label}
            </li>
          ))}
        </ul>
      </section>


      {/* CTA -- design source frame `B1XJrb`. */}
      <section className="mx-auto w-full max-w-[1080px] px-5 pt-16 pb-16">
        <div className="flex flex-col items-start justify-between gap-[30px] rounded-xl bg-panel px-10 py-9 shadow-[0_4px_10px_rgba(45,45,83,0.06)] sm:flex-row sm:items-center">
          <div className="flex flex-col gap-[11px] pt-2">
            <span className="text-[11px] font-bold tracking-[-0.029em] text-brand">
              {t.home.ctaEyebrow}
            </span>
            <h2 className="text-[26px] leading-[1.5] font-[650] tracking-[-0.04em] text-ink">
              {t.home.ctaTitle}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button href="/pricing" variant="outline" size="md" className="bg-surface">
              {t.home.ctaPricing}
            </Button>
            <Button href="/libraries" size="md">
              {t.home.ctaBrowse}
              <ArrowRightIcon size={15} />
            </Button>
          </div>
        </div>
      </section>

    </>
  );
}
