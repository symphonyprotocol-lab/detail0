import Link from 'next/link';
import { Button, SectionHeading } from '@/components/ui/primitives';
import { ClaudeIcon, CodexIcon, CursorIcon, McpIcon } from '@/components/ui/brand-icons';
import { LibraryTable } from '@/components/site/library-table';
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BracesIcon,
  CircleCheckIcon,
  ClockIcon,
  CopyIcon,
  KeyIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from '@/components/ui/icons';
import { listPublicLibraries } from '@/lib/application/libraries';
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
  /* The featured table is the live catalogue's head, not copy. */
  const featured = (await listPublicLibraries({ sort: 'popular', limit: 6 })).map((row) => ({
    libraryId: row.publicId,
    title: row.title,
    domain: row.domainTag ?? row.publicId,
    trustScore: row.trustScore,
    chunks: row.totalChunks.toLocaleString('en-US'),
    updated: row.updatedAt ? new Date(row.updatedAt).toISOString().slice(0, 10) : '—',
    anchored: false,
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
            <div className="flex h-12 items-center gap-[92px] rounded-lg border-2 border-termline bg-inkdeep py-0.5 pr-[11px] pl-[18px] shadow-[0_4px_10px_rgba(45,45,83,0.12),0_1px_1px_rgba(45,45,83,0.12)]">
              <code className="font-mono text-[12px] tracking-[-0.03em] text-[#e4edee]">
                $ npx re0 setup
              </code>
              <span className="flex h-7 items-center gap-1.5 border-l-2 border-[#294043] pr-[9px] pl-[11px] text-[#b8d4d5]">
                <CopyIcon size={15} />
                <span className="text-[11px] tracking-[-0.029em]">{t.home.install}</span>
              </span>
            </div>
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-[20px] border-2 border-line bg-card px-5 text-[14px] font-medium tracking-[-0.029em] text-ink shadow-[0_4px_10px_rgba(45,45,83,0.1),0_1px_1px_rgba(45,45,83,0.1)] transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:bg-subtle hover:shadow-[0_10px_22px_-8px_rgba(3,26,30,0.24)]"
            >
              <KeyIcon />
              {t.home.getKey}
            </Link>
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
            <label className="flex h-[46px] min-w-0 flex-1 items-center gap-2.5 rounded-lg border-2 border-line bg-card/60 px-[15px] py-0.5 shadow-[0_4px_10px_rgba(45,45,83,0.06)]">
              <SearchIcon size={18} className="text-muted" />
              <input
                placeholder={t.home.searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-[13px] tracking-[-0.025em] text-ink outline-none placeholder:text-muted/70"
              />
              <kbd className="flex h-[34px] shrink-0 items-center rounded-[5px] border-2 border-line bg-mutedbg px-1.5 text-[16px] text-muted">
                ⌘ K
              </kbd>
            </label>
            <div className="flex h-[46px] shrink-0 items-center rounded-lg border-2 border-line bg-card/60 p-[5px]">
              <span className="flex h-9 items-center gap-1.5 rounded-md bg-brandsoft px-3 text-[12px] font-[550] tracking-[-0.027em] text-brandink">
                <SparklesIcon size={15} />
                {t.home.popular}
              </span>
              <span className="flex h-9 items-center gap-1.5 rounded-md px-3 text-[12px] font-[550] tracking-[-0.027em] text-muted">
                <ClockIcon size={15} />
                {t.home.recentlyUpdated}
              </span>
            </div>
          </div>

          <LibraryTable entries={featured} showAnchor={false} />

          <div className="flex flex-wrap items-center justify-between gap-3 px-0.5 pt-3.5 text-[11px] tracking-[-0.029em]">
            <p className="text-muted">{t.home.sampleNote}</p>
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

      {/* On-chain proof -- design source frame `oKG2g`. */}
      <section className="mx-auto w-full max-w-[1080px] px-5 pt-13 pb-[70px]">
        <SectionHeading eyebrow="ON-CHAIN PROOF" title={t.home.proofTitle} />
        <div className="mt-7 grid gap-[18px] sm:grid-cols-3">
          {t.home.proof.map((item) => (
            <div key={item.title} className="border-t-2 border-line pt-[18px]">
              <h3 className="text-[14px] leading-[1.4] font-[650] tracking-[-0.029em] text-ink">
                {item.title}
              </h3>
              <p className="mt-2 text-[11px] leading-[1.6] tracking-[-0.029em] text-muted">
                {item.body}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-7 text-[10px] leading-[1.5] tracking-[-0.032em] text-muted">
          {t.home.proofNote}
        </p>
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
