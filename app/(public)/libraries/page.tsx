import type { Metadata } from 'next';
import Link from 'next/link';
import { Button, SectionHeading } from '@/components/ui/primitives';
import { LibraryTable, type LibraryTableEntry } from '@/components/site/library-table';
import { countPublicLibraries, listPublicLibraries } from '@/lib/application/libraries';
import { resolveLibrary } from '@/lib/application/retrieval/resolve-library';
import { fill } from '@/lib/i18n/format';
import { getMessages, translations } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { catalog: c } = await getMessages();
  return { title: c.metaTitle, description: c.metaDescription };
}

type Search = { searchParams: Promise<{ q?: string; sort?: string }> };

/**
 * The public directory, on the real rows. Browsing lists routable libraries
 * (the same predicate retrieval admits); a search query runs the same
 * content-based resolve the MCP tool uses (architecture.md 9.6), so what the
 * directory finds is exactly what an agent would find. Server-side and
 * unmetered: resolve never counts a Call.
 */
export default async function CatalogPage({ searchParams }: Search) {
  const [{ q, sort }, { locale, t }] = await Promise.all([searchParams, translations()]);
  const c = t.catalog;

  const query = (q ?? '').trim().slice(0, 200);
  const recent = sort === 'recent';
  const number = new Intl.NumberFormat(locale);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  let entries: LibraryTableEntry[];
  if (query) {
    const resolved = await resolveLibrary(
      { workspaceId: null, apiKeyId: null, requestId: crypto.randomUUID(), anonymous: true },
      { query },
    );
    entries = resolved.results.map((candidate) => ({
      libraryId: candidate.libraryId,
      title: candidate.title,
      domain: candidate.description ?? candidate.libraryId,
      trustScore: candidate.trustScore,
      chunks: number.format(candidate.chunks),
      updated: date.format(new Date(candidate.updatedAt)),
      anchored: false,
    }));
  } else {
    const rows = await listPublicLibraries({ sort: recent ? 'recent' : 'popular' });
    entries = rows.map((row) => ({
      libraryId: row.publicId,
      title: row.title,
      domain: row.domainTag ?? row.publicId,
      trustScore: row.trustScore,
      chunks: number.format(row.totalChunks),
      updated: row.updatedAt ? date.format(new Date(row.updatedAt)) : '—',
      anchored: false,
    }));
  }

  const total = number.format(await countPublicLibraries());

  return (
    <section className="mx-auto w-full max-w-[918px] px-5 pt-11 pb-16">
      <SectionHeading
        eyebrow="KNOWLEDGE DIRECTORY"
        title={c.title}
        action={
          <div className="flex flex-wrap gap-2.5">
            <Button href="/libraries/claim" variant="outline">
              {c.claim}
            </Button>
            <Button href="/libraries/claim">{c.submit}</Button>
          </div>
        }
      />

      <p className="mt-4 max-w-[80ch] text-[13px] leading-[1.7] text-muted">{c.lede}</p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <form
          method="get"
          className="flex h-[46px] min-w-0 flex-1 items-center gap-2.5 rounded-lg border-2 border-line bg-card px-4 shadow-[0_4px_10px_rgba(45,45,83,0.06)]"
        >
          <span aria-hidden className="text-muted">
            ⌕
          </span>
          <input
            name="q"
            defaultValue={query}
            placeholder={c.searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted/70"
          />
          {recent ? <input type="hidden" name="sort" value="recent" /> : null}
          <button
            type="submit"
            className="rounded border-2 border-line bg-mutedbg px-1.5 py-0.5 text-[11px] text-muted"
          >
            ⏎
          </button>
        </form>
        <div className="flex h-[46px] items-center gap-1 rounded-lg border-2 border-line bg-card p-1">
          <Link
            href={query ? `/libraries?q=${encodeURIComponent(query)}` : '/libraries'}
            className={`rounded-md px-3 py-1.5 text-[12px] font-medium ${
              recent ? 'text-muted' : 'bg-brandsoft text-brandink'
            }`}
          >
            {c.popular}
          </Link>
          <Link
            href={
              query ? `/libraries?sort=recent&q=${encodeURIComponent(query)}` : '/libraries?sort=recent'
            }
            className={`rounded-md px-3 py-1.5 text-[12px] font-medium ${
              recent ? 'bg-brandsoft text-brandink' : 'text-muted'
            }`}
          >
            {c.recentlyUpdated}
          </Link>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[12px]">
        <p className="text-muted">{fill(c.totalLine, { total })}</p>
        <p className="text-faint">{c.freeNote}</p>
      </div>

      <div className="mt-3">
        <LibraryTable entries={entries} />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-muted">
          {fill(c.rangeLine, { shown: entries.length, total })}
        </p>
      </div>
    </section>
  );
}
