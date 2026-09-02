import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button, Card, Chip } from '@/components/ui/primitives';
import { publicLibraryDetail } from '@/lib/application/libraries';
import { fill } from '@/lib/i18n/format';
import { getMessages, translations } from '@/lib/i18n/server';

type Params = { params: Promise<{ libraryId: string[] }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const [{ libraryId }, t] = await Promise.all([params, getMessages()]);
  const entry = await publicLibraryDetail(`/${libraryId.join('/')}`);
  if (!entry) return { title: t.library.fallbackTitle };
  return { title: entry.title, description: entry.description ?? undefined };
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card className="flex flex-col gap-1 px-3.5 py-3">
      <span className="text-[9.5px] font-semibold tracking-[0.04em] text-muted">{label}</span>
      <span className="text-[21px] leading-tight font-bold tracking-[-0.03em] text-ink">{value}</span>
      <span className="text-[10.5px] text-faint">{note}</span>
    </Card>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-[12px] text-muted">{k}</span>
      <span className={`text-right text-[12px] text-ink ${mono ? 'font-mono text-[11px]' : 'font-medium'}`}>
        {v}
      </span>
    </div>
  );
}

function Panel({ title, right, children }: { title: string; right?: string; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b-2 border-line px-4 py-3">
        <h2 className="text-[13.5px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
        {right ? <span className="text-[11.5px] text-faint">{right}</span> : null}
      </div>
      <div className="flex flex-col gap-2.5 p-4">{children}</div>
    </Card>
  );
}

/**
 * A published library's public face, on the real rows: the routable predicate
 * decides existence (an invisible library 404s exactly like a missing one),
 * and every figure comes from the pinned current version. The anchor panel
 * reports pending until anchoring ships -- never a fabricated transaction.
 */
export default async function LibraryDetailPage({ params }: Params) {
  const [{ libraryId }, { locale, t }] = await Promise.all([params, translations()]);
  const entry = await publicLibraryDetail(`/${libraryId.join('/')}`);
  if (!entry) notFound();

  const l = t.library;
  const number = new Intl.NumberFormat(locale);
  const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const updated = entry.updatedAt ? date.format(new Date(entry.updatedAt)) : '—';
  const sizeMb = Math.max(1, Math.round(entry.storageBytes / 1_048_576));

  return (
    <section className="mx-auto w-full max-w-[918px] px-5 pt-7 pb-14">
      <nav className="flex items-center gap-2 text-[12px] text-muted">
        <Link href="/libraries" className="hover:text-ink">
          {l.breadcrumb}
        </Link>
        <span aria-hidden className="text-line">/</span>
        {entry.domainTag ? (
          <>
            <span>{entry.domainTag}</span>
            <span aria-hidden className="text-line">/</span>
          </>
        ) : null}
        <span className="font-semibold text-ink">{entry.title}</span>
      </nav>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[28px] leading-tight font-bold tracking-[-0.04em] text-ink">
              {entry.title}
            </h1>
            <Chip tone="brand">{l.public}</Chip>
            {entry.claimedBy ? (
              <Chip tone="good">{l.claimed}</Chip>
            ) : (
              <Chip tone="warn">{l.unclaimed}</Chip>
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <code className="rounded-md border-2 border-line bg-subtle px-2.5 py-1 font-mono text-[12px] text-steel">
              {entry.publicId}
            </code>
            <span className="text-[12px] text-faint">
              {l.pinnedVersion}
              {entry.publicId}/{entry.version.label}
            </span>
          </div>

          {entry.description ? (
            <p className="mt-3 max-w-[70ch] text-[13.5px] leading-[1.7] text-muted">
              {entry.description}
            </p>
          ) : null}

          <div className="mt-3.5 flex flex-wrap gap-2">
            {entry.domainTag ? <Chip>{entry.domainTag}</Chip> : null}
            {entry.language ? <Chip>{entry.language}</Chip> : null}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button href="/playground">{l.tryInPlayground}</Button>
          <Button href="/docs" variant="outline">
            {l.viewExamples}
          </Button>
        </div>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label={l.stats.trust} value={String(entry.trustScore)} note={l.stats.trustNote} />
        <Stat
          label={l.stats.benchmark}
          value={String(entry.benchmarkScore)}
          note={l.stats.benchmarkNote}
        />
        <Stat
          label={l.stats.chunks}
          value={number.format(entry.version.totalChunks)}
          note={fill(l.stats.chunksNote, { count: entry.version.documents })}
        />
        <Stat
          label={l.stats.tokens}
          value={compact.format(entry.version.totalTokens)}
          note={l.stats.tokensNote}
        />
        <Stat label={l.stats.size} value={`${sizeMb} MB`} note={l.stats.sizeNote} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_312px]">
        <div className="flex flex-col gap-4">
          <Panel title={l.versionPanel} right={l.versionPanelRight}>
            <div className="rounded-lg border-2 border-line bg-subtle p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[14px] font-bold text-ink">
                    {entry.version.label}
                  </span>
                  <Chip tone="brand">{l.currentVersion}</Chip>
                  <Chip tone="good">Ready</Chip>
                </div>
                <span className="text-[11.5px] text-faint">
                  {fill(l.publishedAt, {
                    when: entry.version.publishedAt
                      ? date.format(new Date(entry.version.publishedAt))
                      : updated,
                  })}
                </span>
              </div>
              <div className="mt-2.5 flex flex-col">
                <Row
                  k="Parser / Chunker"
                  v={`${entry.version.parserVersion} · ${entry.version.chunkerVersion}`}
                />
                <Row k="Embedding Model" v={entry.version.embeddingModel} />
              </div>
            </div>
            <p className="text-[11.5px] leading-[1.7] text-faint">
              {l.versionNote}
            </p>
          </Panel>

          <Panel title={l.examplesPanel} right={l.examplesPanelRight}>
            <div className="rounded-lg border-2 border-line bg-subtle p-3.5">
              <pre className="overflow-x-auto font-mono text-[11px] leading-[1.75] text-good">
{`query-docs
  libraryId: "${entry.publicId}"
  query:     "how do I get started"
  maxTokens: 4000`}
              </pre>
            </div>
            <p className="text-[11.5px] leading-[1.7] text-faint">
              {l.examplesNote}
            </p>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel title={l.sourcePanel}>
            {entry.sources.map((source) => (
              <div key={`${source.type}-${source.location}`} className="flex items-center gap-2">
                <Chip>{source.type}</Chip>
                <span className="truncate font-mono text-[11.5px] text-steel">
                  {source.location}
                </span>
              </div>
            ))}
            <Row k={l.lastSync} v={updated} />
          </Panel>

          <Panel title={l.anchorPanel}>
            <div className="flex items-center gap-2">
              <Chip tone="warn">{l.unanchored}</Chip>
              <span className="text-[11.5px] text-muted">{l.aptosMainnet}</span>
            </div>
            <p className="text-[11.5px] text-muted">{l.notAnchoredYet}</p>
            <Button href="/docs/anchoring" variant="outline" className="mt-1 w-full">
              {l.verifyVersion}
            </Button>
            <p className="text-[11px] leading-[1.65] text-faint">{l.verifyNote}</p>
          </Panel>

          <Panel title={l.ownershipPanel}>
            {entry.claimedBy ? (
              <div className="flex items-center gap-2">
                <Chip tone="good">{l.claimed}</Chip>
                <span className="text-[12px] font-semibold text-ink">{entry.claimedBy}</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Chip tone="warn">{l.unclaimed}</Chip>
                  <span className="text-[12px] text-muted">{l.noOwner}</span>
                </div>
                <p className="text-[11px] leading-[1.65] text-faint">{l.claimNote}</p>
                <Button href="/libraries/claim" className="mt-1 w-full">
                  {l.claimCta}
                </Button>
              </>
            )}
          </Panel>
        </div>
      </div>
    </section>
  );
}
