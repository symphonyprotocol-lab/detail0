import Link from 'next/link';
import { ArrowUpRightIcon, BadgeCheckIcon, ShieldCheckIcon } from '@/components/ui/icons';
import type { CatalogEntry } from '@/lib/site/demo-data';

/**
 * Column track widths and paddings are taken from the design source table
 * (frame `m5xZ2r`): a flexible name column followed by five fixed ones.
 */
const COLS =
  'grid-cols-[minmax(0,1fr)_212px_80px_80px_93px_71px] gap-[18px] px-[15px]';

export function LibraryTable({
  entries,
  showAnchor = true,
}: {
  entries: CatalogEntry[];
  showAnchor?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-[9px] border-2 border-line bg-card p-0.5">
      <div className="overflow-x-auto">
        <div className="min-w-[884px]">
          <div
            className={`grid ${COLS} h-10 items-center border-b-2 border-line bg-subtle text-[10px] font-[650] tracking-[0.04em] text-muted`}
          >
            <span>名称</span>
            <span>LIBRARY ID</span>
            <span>TRUST</span>
            <span>CHUNKS</span>
            <span>更新</span>
            <span>{showAnchor ? '存证' : 'ACCESS'}</span>
          </div>
          {entries.map((entry, i) => (
            <Link
              key={entry.libraryId}
              href={`/libraries${entry.libraryId}`}
              className={`grid ${COLS} h-[66px] items-center text-[12px] tracking-[-0.015em] text-steel transition-colors hover:bg-subtle ${
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
                  {entry.anchored ? '已存证' : '待存证'}
                </span>
              ) : (
                <span className="flex items-center gap-[5px] font-semibold text-brand">
                  公开
                  <ArrowUpRightIcon size={14} />
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
