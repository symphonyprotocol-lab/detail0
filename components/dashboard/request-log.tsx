'use client';

import { useMemo, useState } from 'react';
import { PANEL, SearchField } from '@/components/dashboard/ui';
import { CircleCheckIcon, CircleXIcon } from '@/components/ui/icons';
import { useI18n } from '@/lib/i18n/client';
import { fill } from '@/lib/i18n/format';

const GRID =
  'grid grid-cols-[118px_minmax(0,1fr)_90px_84px_58px_52px] items-center gap-3';

/** What one row of the live log renders. Mapped from the API by the page. */
export interface RequestLogView {
  id: string;
  time: string;
  operation: string;
  surface: string;
  library: string;
  key: string;
  status: number;
  latency: string;
}

/** Selected by index: the labels are translated, the positions are not. */
function Select({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <label className="flex w-24 flex-col gap-0.5">
      <span className="text-[9px] tracking-[-0.023em] text-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-[26px] rounded-md border-2 border-line bg-card px-1.5 text-[10px] tracking-[-0.023em] text-steel focus:outline-none"
      >
        {options.map((option, index) => (
          <option key={option} value={index}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Status pill: 2xx reads as brand green, everything else as an error. */
function StatusPill({ status }: { status: number }) {
  const ok = status < 400;
  return (
    <span
      className={`inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] whitespace-nowrap ${
        ok ? 'bg-pubsoft text-pubink' : 'bg-errsoft text-err'
      }`}
    >
      {ok ? <CircleCheckIcon size={12} /> : <CircleXIcon size={12} />}
      {status}
    </span>
  );
}

/**
 * Request log with its filter bar -- design source frame `i027cz`, fed by the
 * page from the real request_log (architecture.md 6.3). Search and the
 * status filter work client-side over the page the server returned; the
 * per-key filter waits until the log records which key served a request.
 */
export function RequestLog({ entries }: { entries: RequestLogView[] }) {
  const { t } = useI18n();
  const r = t.dashboard.requests;

  const statuses = r.statuses;
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState(0);

  const rows = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return entries.filter((entry) => {
      const matchesTerm =
        needle === '' ||
        [entry.id, entry.library, entry.operation].some((field) =>
          field.toLowerCase().includes(needle),
        );
      const matchesStatus = status === 0 || (status === 1 ? entry.status < 400 : entry.status >= 400);
      return matchesTerm && matchesStatus;
    });
  }, [term, status, entries]);

  return (
    <section className={`${PANEL} overflow-hidden p-0.5`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-line px-[18px] pt-3.5 pb-4">
        <div className="flex min-w-[240px] flex-1 items-center">
          <SearchField placeholder={r.searchPlaceholder} value={term} onChange={setTerm} />
        </div>
        <div className="flex gap-1.5">
          <Select label={r.filterStatus} options={statuses} value={status} onChange={setStatus} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[620px]">
          <div
            className={`${GRID} bg-subtle px-[18px] py-3 text-[11px] tracking-[-0.023em] text-muted`}
          >
            {r.columns.map((column) => (
              <span key={column}>{column}</span>
            ))}
          </div>

          {rows.map((entry) => (
            <div
              key={entry.id}
              className={`${GRID} border-t-2 border-line px-[18px] py-3.5 transition-colors hover:bg-subtle`}
            >
              <span className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold tracking-[-0.023em] text-steel">
                  {entry.time}
                </span>
                <span className="font-mono text-[10px] text-muted">{entry.id}</span>
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-[11px] tracking-[-0.023em] text-steel">
                  {entry.operation}
                </span>
                <span className="text-[10px] tracking-[-0.023em] text-muted">{entry.surface}</span>
              </span>
              <span className="truncate text-[12px] tracking-[-0.023em] text-steel">
                {entry.library}
              </span>
              <span className="truncate text-[12px] tracking-[-0.023em] text-steel">
                {entry.key}
              </span>
              <StatusPill status={entry.status} />
              <span className="text-[11px] tracking-[-0.023em] text-steel">{entry.latency}</span>
            </div>
          ))}

          {rows.length === 0 ? (
            <p className="border-t-2 border-line px-[18px] py-10 text-center text-[13px] text-muted">
              {r.empty}
            </p>
          ) : null}
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-line px-[18px] py-3">
        <p className="text-[11px] tracking-[-0.023em] text-muted">
          {fill(r.countLine, {
            shown: rows.length,
            total: entries.length.toLocaleString('en-US'),
          })}
        </p>
      </footer>
    </section>
  );
}
