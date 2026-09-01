import Link from 'next/link';
import { ArrowUpRightIcon, BadgeCheckIcon, ShieldCheckIcon } from '@/components/ui/icons';
import { getMessages } from '@/lib/i18n/server';

/** One catalogue row, mapped by the page from the live rows. */
export interface LibraryTableEntry {
  libraryId: string;
  title: string;
  domain: string;
  trustScore: number;
  chunks: string;
  updated: string;
  anchored: boolean;
}

/**
 * Column track widths and paddings are taken from the design source table
 * (frame `m5xZ2r`): a flexible name column followed by five fixed ones.
 */
const COLS =
  'grid-cols-[minmax(0,1fr)_212px_80px_80px_93px_71px] gap-[18px] px-[15px]';

export async function LibraryTable({
  entries,
  showAnchor = true,
}: {
  entries: LibraryTableEntry[];
  showAnchor?: boolean;
}) {
  const { table } = (await getMessages()).catalog;

  return (
    <div className="overflow-hidden rounded-[9px] border-2 border-line bg-card/60 p-0.5">
      <div className="overflow-x-auto">
        <div className="min-w-[884px]">
          <div
            className={`grid ${COLS} h-10 items-center border-b-2 border-line bg-subtle/60 text-[10px] font-[650] tracking-[0.04em] text-muted`}
          >
            <span>{table.name}</span>
            <span>{table.libraryId}</span>
            <span>{table.trust}</span>
            <span>{table.chunks}</span>
            <span>{table.updated}</span>
            <span>{showAnchor ? table.anchor : table.access}</span>
          </div>
          {entries.map((entry, i) => (
            <Link
              key={entry.libraryId}
              href={`/libraries${entry.libraryId}`}
              className={`grid ${COLS} h-[66px] items-center text-[12px] tracking-[-0.015em] text-steel transition-colors hover:bg-subtle/85 ${
                i === entries.length - 1 ? '' : 'border-b-2 border-line'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-[7px] border-2 border-[#a3d9d5] bg-brandsoft text-brand">
                  <ShieldCheckIcon size={17} />
                </span>
                <span className="flex min-w-0 flex-col gap-[3px]">
                  <span className="truncate font-[650] text-ink">{entry.title}</span>
                  <span className="truncate text-[10px] text-muted">{entry.domain}</span>
                </span>
              </span>
              <span className="truncate">{entry.libraryId}</span>
              <span className="flex items-center gap-[5px] font-[650] text-brandink">
                <BadgeCheckIcon size={15} />
                {entry.trustScore}
              </span>
              <span>{entry.chunks}</span>
              <span>{entry.updated}</span>
              {showAnchor ? (
                <span
                  className={`text-[11px] font-semibold tracking-[-0.018em] ${
                    entry.anchored ? 'text-good' : 'text-warn'
                  }`}
                >
                  {entry.anchored ? table.anchored : table.unanchored}
                </span>
              ) : (
                <span className="flex items-center gap-[5px] font-semibold text-brand">
                  {table.public}
                  <ArrowUpRightIcon size={14} />
                </span>
              )}
            </Link>
          ))}
          {entries.length === 0 ? (
            <p className="px-[15px] py-10 text-center text-[13px] text-muted">{table.empty}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
