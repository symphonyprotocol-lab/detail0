import type { Metadata } from 'next';
import { Button, SectionHeading } from '@/components/ui/primitives';
import { LibraryTable } from '@/components/site/library-table';
import { catalog, CATALOG_TOTAL } from '@/lib/site/demo-data';
import { fill } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { catalog: c } = await getMessages();
  return { title: c.metaTitle, description: c.metaDescription };
}

export default async function CatalogPage() {
  const t = await getMessages();
  const c = t.catalog;
  const entries = catalog(t);
  const total = CATALOG_TOTAL.toLocaleString('en-US');
  const pages = [c.previous, '1', '2', '3', '…', '1554', c.next];

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
        <label className="flex h-[46px] min-w-0 flex-1 items-center gap-2.5 rounded-lg border-2 border-line bg-card px-4 shadow-[0_4px_10px_rgba(45,45,83,0.06)]">
          <span aria-hidden className="text-muted">
            ⌕
          </span>
          <input
            placeholder={c.searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted/70"
          />
          <kbd className="rounded border-2 border-line bg-mutedbg px-1.5 py-0.5 text-[11px] text-muted">
            ⌘ K
          </kbd>
        </label>
        <div className="flex h-[46px] items-center gap-1 rounded-lg border-2 border-line bg-card p-1">
          <span className="rounded-md bg-brandsoft px-3 py-1.5 text-[12px] font-medium text-brandink">
            {c.popular}
          </span>
          <span className="rounded-md px-3 py-1.5 text-[12px] font-medium text-muted">
            {c.recentlyUpdated}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2.5">
        {c.filters.map((f) => (
          <button
            key={f}
            type="button"
            className="flex h-[34px] items-center gap-2 rounded-lg border-2 border-line bg-card px-3 text-[12px] font-medium text-muted transition-colors hover:bg-subtle"
          >
            {f}
            <span aria-hidden className="text-[10px] text-faint">
              ▾
            </span>
          </button>
        ))}
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
        <nav className="flex items-center gap-1.5">
          {pages.map((p) => (
            <span
              key={p}
              className={`inline-flex h-[30px] items-center rounded-md px-2.5 text-[12px] font-medium ${
                p === '1' ? 'bg-brand text-white' : 'border-2 border-line bg-card text-muted'
              }`}
            >
              {p}
            </span>
          ))}
        </nav>
      </div>
    </section>
  );
}
