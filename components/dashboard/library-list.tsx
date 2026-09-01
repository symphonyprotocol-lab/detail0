'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Badge, PANEL, SearchField, StatusLabel, type StatusTone } from '@/components/dashboard/ui';
import { ArrowRightIcon } from '@/components/ui/icons';
import { useI18n } from '@/lib/i18n/client';

/** One row of the live list, mapped by the page from the workspace's rows. */
export interface LibraryListRow {
  slug: string;
  title: string;
  version: string | null;
  scope: 'public' | 'private';
  chunks: number;
  /** StatusLabel tone + its translated label, derived from lifecycle+index. */
  status: StatusTone;
  statusLabel: string;
  updated: string;
  initial: string;
}

/** Deterministic tile colour from the slug: stable across renders and rows. */
const TILE_COLORS = ['#0f9d77', '#5865f2', '#d97706', '#0ea5e9', '#9333ea', '#e11d48'];
function tileColor(slug: string): string {
  let hash = 0;
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TILE_COLORS[hash % TILE_COLORS.length]!;
}

/** Library table with its toolbar -- design source frame `fiSE2`, live rows. */
export function LibraryList({ rows: allRows }: { rows: LibraryListRow[] }) {
  const { locale, t } = useI18n();
  const l = t.dashboard.libraries;
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const [filter, setFilter] = useState<'all' | StatusTone>('all');
  const [term, setTerm] = useState('');

  const filters: { id: 'all' | StatusTone; label: string }[] = [
    { id: 'all', label: l.filters.all },
    { id: 'live', label: l.filters.live },
    { id: 'pending', label: l.filters.pending },
    { id: 'blocked', label: l.filters.blocked },
  ];

  const rows = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return allRows.filter((library) => {
      const matchesFilter = filter === 'all' || library.status === filter;
      const matchesTerm =
        needle === '' ||
        library.title.toLowerCase().includes(needle) ||
        library.slug.toLowerCase().includes(needle);
      return matchesFilter && matchesTerm;
    });
  }, [filter, term, allRows]);

  return (
    <section className={`${PANEL} overflow-hidden p-0.5`}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-line px-[18px] pt-3.5 pb-4">
        <div className="flex min-w-[220px] flex-1 items-center">
          <SearchField placeholder={l.searchPlaceholder} value={term} onChange={setTerm} />
        </div>
        <div className="flex gap-0 rounded-[7px] bg-mutedbg p-[3px]">
          {filters.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              aria-pressed={filter === option.id}
              className={`h-[29px] rounded-[5px] px-[9px] text-[11px] tracking-[-0.023em] transition-colors ${
                filter === option.id
                  ? 'bg-card text-ink shadow-[0_4px_10px_rgba(45,45,83,0.06)]'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[620px]">
          <div className="grid grid-cols-[minmax(0,1fr)_104px_74px_94px_92px_18px] items-center bg-subtle px-[18px] py-3 text-[11px] font-semibold tracking-[-0.023em] text-muted">
            {l.columns.map((column) => (
              <span key={column}>{column}</span>
            ))}
            <span />
          </div>

          {rows.map((library) => {
            /*
             * The public detail page only resolves ROUTABLE libraries (public,
             * published, ready, with a current version -- catalog.ts), so a
             * private or in-flight row renders the same cells unlinked rather
             * than a link that 404s on the owner.
             */
            const routable =
              library.scope === 'public' && library.status === 'live' && library.version !== null;
            const cells: ReactNode = (
              <>
                <span className="flex min-w-0 items-center gap-2.5 pr-3">
                  <span
                    aria-hidden
                    className="flex size-[34px] shrink-0 items-center justify-center rounded-lg text-[13px] font-medium text-white"
                    style={{ backgroundColor: tileColor(library.slug) }}
                  >
                    {library.initial}
                  </span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex items-center gap-1 text-[13px] tracking-[-0.023em] text-ink">
                      <span className="truncate">{library.title}</span>
                    </span>
                    <span className="truncate text-[10px] tracking-[-0.023em] text-muted">
                      {library.slug}
                      {library.version ? ` · ${library.version}` : ''}
                    </span>
                  </span>
                </span>

                <span className="flex flex-wrap gap-1.5 pr-3">
                  <Badge tone={library.scope === 'public' ? 'public' : 'private'}>
                    {library.scope === 'public' ? l.scopePublic : l.scopePrivate}
                  </Badge>
                </span>

                <span className="text-[12px] tracking-[-0.023em] text-steel">
                  {number.format(library.chunks)}
                </span>

                <StatusLabel tone={library.status}>{library.statusLabel}</StatusLabel>

                <span className="text-[12px] tracking-[-0.023em] text-muted">{library.updated}</span>

                {routable ? <ArrowRightIcon size={14} className="text-muted" /> : <span />}
              </>
            );
            const rowClass =
              'grid grid-cols-[minmax(0,1fr)_104px_74px_94px_92px_18px] items-center border-t-2 border-line px-[18px] py-[19px]';

            return routable ? (
              <Link
                key={library.slug}
                href={`/libraries${library.slug}`}
                className={`${rowClass} transition-colors hover:bg-subtle`}
              >
                {cells}
              </Link>
            ) : (
              <div key={library.slug} className={rowClass}>
                {cells}
              </div>
            );
          })}

          {rows.length === 0 ? (
            <p className="border-t-2 border-line px-[18px] py-10 text-center text-[13px] text-muted">
              {l.empty}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
