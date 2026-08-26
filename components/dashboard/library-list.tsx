'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge, PANEL, SearchField, StatusLabel } from '@/components/dashboard/ui';
import { ArrowRightIcon, BadgeCheckIcon } from '@/components/ui/icons';
import { dashboardCopy } from '@/lib/dashboard/demo-data';
import { useI18n } from '@/lib/i18n/client';

/** Library table with its toolbar -- design source frame `fiSE2`. */
export function LibraryList() {
  const { t } = useI18n();
  const l = t.dashboard.libraries;
  const { libraries, libraryFilters } = dashboardCopy(t);
  const [filter, setFilter] = useState('all');
  const [term, setTerm] = useState('');

  const rows = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return libraries.filter((library) => {
      const matchesFilter = filter === 'all' || library.status === filter;
      const matchesTerm =
        needle === '' ||
        library.title.toLowerCase().includes(needle) ||
        library.slug.toLowerCase().includes(needle);
      return matchesFilter && matchesTerm;
    });
  }, [filter, term, libraries]);

  return (
    <section className={`${PANEL} overflow-hidden p-0.5`}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-line px-[18px] pt-3.5 pb-4">
        <div className="flex min-w-[220px] flex-1 items-center">
          <SearchField placeholder={l.searchPlaceholder} value={term} onChange={setTerm} />
        </div>
        <div className="flex gap-0 rounded-[7px] bg-mutedbg p-[3px]">
          {libraryFilters.map((option) => (
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

          {rows.map((library) => (
            <Link
              key={library.slug}
              href={`/libraries${library.slug}`}
              className="grid grid-cols-[minmax(0,1fr)_104px_74px_94px_92px_18px] items-center border-t-2 border-line px-[18px] py-[19px] transition-colors hover:bg-subtle"
            >
              <span className="flex min-w-0 items-center gap-2.5 pr-3">
                <span
                  aria-hidden
                  className="flex size-[34px] shrink-0 items-center justify-center rounded-lg text-[13px] font-medium text-white"
                  style={{ backgroundColor: library.color }}
                >
                  {library.initial}
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex items-center gap-1 text-[13px] tracking-[-0.023em] text-ink">
                    <span className="truncate">{library.title}</span>
                    <BadgeCheckIcon size={13} className="text-brand" />
                  </span>
                  <span className="truncate text-[10px] tracking-[-0.023em] text-muted">
                    {library.slug} · {library.version}
                  </span>
                </span>
              </span>

              <span className="flex flex-wrap gap-1.5 pr-3">
                <Badge tone={library.scope === 'public' ? 'public' : 'private'}>
                  {library.scope === 'public' ? l.scopePublic : l.scopePrivate}
                </Badge>
                {library.revenueShare ? <Badge tone="outline">{l.revenueShare}</Badge> : null}
              </span>

              <span className="text-[12px] tracking-[-0.023em] text-steel">
                {library.chunks.toLocaleString()}
              </span>

              <StatusLabel tone={library.status}>{library.statusLabel}</StatusLabel>

              <span className="text-[12px] tracking-[-0.023em] text-muted">{library.updated}</span>

              <ArrowRightIcon size={14} className="text-muted" />
            </Link>
          ))}

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
