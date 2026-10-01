import Link from 'next/link';
import { Button, SectionHeading, ShowcaseCard } from '@/components/ui/primitives';
import { ClaudeIcon, CodexIcon, CursorIcon, McpIcon } from '@/components/ui/brand-icons';
import { DirectorySearch } from '@/components/site/directory-search';
import { HeroFigure } from '@/components/site/hero-figure';
import { LibraryTable } from '@/components/site/library-table';
import { ConnectTabs } from '@/components/site/connect-tabs';
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BracesIcon,
  CircleCheckIcon,
  ClockIcon,
  KeyIcon,
  PlusIcon,
  SparklesIcon,
} from '@/components/ui/icons';
import { listPublicLibraries, POPULARITY_WINDOW_DAYS } from '@/lib/application/libraries';
import { publicUrl } from '@/lib/site/origin';
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

export default async function HomePage() {
  const t = await getMessages();
  /* The MCP endpoint a person pastes into their client: the one thing every
     surface in the hero row shares. It is always the public host -- a visitor
     reading a preview deployment still has to connect to the real one.
     Anonymous use rides the trial limit; an API key from the dashboard lifts
     it (requirement.md 9.3). */
  const mcpUrl = publicUrl('/mcp');
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
      {/*
        Hero -- a split composition on the paper canvas: the copy and the
        action cluster on the left, the figure on the right. It centres again
        below the split's breakpoint, where there is no second column for the
        text to sit beside.
      */}
      <section>
        <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 items-center gap-12 px-5 pt-20 pb-16 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <p className="eyebrow">{t.home.badge}</p>

          <h1 className="mt-5 max-w-[18ch] text-[40px] leading-[1.25] font-semibold tracking-[0.018em] text-ink sm:text-[56px]">
            {t.home.title}
          </h1>

          <p className="mt-5 max-w-[60ch] text-subheading text-muted">{t.home.lede}</p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            <Button href="/login" size="md">
              <KeyIcon />
              {t.home.getKey}
            </Button>
            <Button href="/playground" variant="outline" size="md">
              <SparklesIcon size={16} />
              {t.home.cli.tryOnline}
            </Button>
          </div>

          {/* Three ways in, ordered by how little the reader has to know: hand
              the prompt to the model they are already talking to, paste the
              endpoint themselves, or run the CLI (packages/cli), which writes
              the same entry into every client on the machine. */}
          <div className="mt-10 w-full">
            <ConnectTabs
              options={[
                {
                  id: 'prompt',
                  label: t.home.connect.promptTab,
                  value: fill(t.home.connect.prompt, { url: mcpUrl }),
                  copyLabel: t.home.connect.promptCopy,
                  copiedLabel: t.home.installCopied,
                  note: t.home.connect.promptNote,
                },
                {
                  id: 'mcp',
                  label: t.home.connect.mcpTab,
                  value: mcpUrl,
                  copyLabel: t.home.install,
                  copiedLabel: t.home.installCopied,
                  note: t.home.connect.mcpNote,
                  mono: true,
                },
                {
                  id: 'cli',
                  label: t.home.connect.cliTab,
                  value: t.home.cli.command,
                  copyLabel: t.home.cli.copy,
                  copiedLabel: t.home.cli.copied,
                  note: t.home.cli.note,
                  mono: true,
                },
              ]}
            />
          </div>

          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-caption text-muted lg:justify-start">
            {t.home.heroPoints.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <CircleCheckIcon size={14} className="text-brandink" />
                {p}
              </li>
            ))}
          </ul>
          </div>

          <HeroFigure className="mx-auto hidden w-full max-w-[400px] lg:block" />
        </div>
      </section>

      {/* The centred logo row that closes the hero. */}
      <section>
        <div className="mx-auto w-full max-w-[1200px] px-5 pb-20">
          <p className="text-center text-caption text-muted">{t.home.surfacesNote}</p>
          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-14 gap-y-6">
            {SURFACES.map(({ label, Icon }) => (
              <li key={label} className="flex items-center gap-2 text-body text-ink">
                <Icon size={20} />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/*
        Knowledge directory -- a tinted zone with the product floating paper
        white on it. This is where the system shows the real thing rather than
        describing it.
      */}
      <section className="wash-band">
        <div className="mx-auto w-full max-w-[1200px] px-5 py-20">
          <SectionHeading
            eyebrow={t.home.directoryEyebrow}
            title={t.home.directoryTitle}
            action={
              <Button href="/libraries/claim">
                <PlusIcon size={15} />
                {t.home.submitLibrary}
              </Button>
            }
          />

          <ShowcaseCard className="mt-10">
            <div className="flex flex-wrap items-center gap-3 pb-5">
              <DirectorySearch
                placeholder={t.home.searchPlaceholder}
                submitLabel={t.home.cli.searchSubmit}
              />
              {/* The featured table is the popular head; both toggles open the
                  full directory in that order. */}
              <div className="flex shrink-0 items-center gap-1">
                <Link
                  href="/libraries?sort=popular"
                  className="flex h-10 items-center gap-2 rounded-full bg-brandsoft px-4 text-caption font-medium text-ink"
                >
                  <SparklesIcon size={15} />
                  {t.home.popular}
                </Link>
                <Link
                  href="/libraries?sort=recent"
                  className="flex h-10 items-center gap-2 rounded-full px-4 text-caption text-muted transition-colors hover:text-ink"
                >
                  <ClockIcon size={15} />
                  {t.home.recentlyUpdated}
                </Link>
              </div>
            </div>

            <LibraryTable entries={featured} />

            <div className="flex flex-wrap items-center justify-between gap-3 pt-5 text-caption">
              <p className="text-muted">
                {fill(t.home.sampleNote, { count: featured.length, days: POPULARITY_WINDOW_DAYS })}
              </p>
              <Link
                href="/libraries"
                className="flex items-center gap-1.5 text-brandink hover:underline"
              >
                {t.home.viewFullCatalog}
                <ArrowUpRightIcon size={14} />
              </Link>
            </div>
          </ShowcaseCard>
        </div>
      </section>

      {/* Closing call to action, back on the paper canvas. */}
      <section>
        <div className="mx-auto flex w-full max-w-[1200px] flex-col items-start justify-between gap-8 px-5 py-20 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-2">
            <span className="eyebrow">{t.home.ctaEyebrow}</span>
            <h2 className="max-w-[22ch] text-heading-sm font-semibold tracking-[0.018em] text-ink">
              {t.home.ctaTitle}
            </h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button href="/pricing" variant="outline" size="md">
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
