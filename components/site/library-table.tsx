import Link from 'next/link';
import { Chip } from '@/components/ui/primitives';
import type { CatalogEntry } from '@/lib/site/demo-data';

const COLS = 'grid-cols-[minmax(0,1fr)_170px_58px_66px_78px_74px]';

export function LibraryTable({
  entries,
  showAnchor = true,
}: {
  entries: CatalogEntry[];
  showAnchor?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border-2 border-line bg-card">
      <div className="overflow-x-auto">
        <div className="min-w-[820px]">
          <div
            className={`grid ${COLS} items-center gap-4 border-b-2 border-line bg-subtle px-4 py-3 text-[10px] font-semibold tracking-[0.04em] text-muted`}
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
              className={`grid ${COLS} items-center gap-4 px-4 py-3.5 transition-colors hover:bg-subtle ${
                i === entries.length - 1 ? '' : 'border-b-2 border-line'
              }`}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[13.5px] font-semibold tracking-[-0.02em] text-ink">
                  {entry.title}
                </span>
                <span className="truncate text-[11px] text-muted">{entry.domain}</span>
              </span>
              <span className="truncate font-mono text-[11px] text-muted">{entry.libraryId}</span>
              <span className="text-[13px] font-semibold text-ink">{entry.trustScore}</span>
              <span className="font-mono text-[12.5px] text-muted">{entry.chunks}</span>
              <span className="text-[12px] text-muted">{entry.updated}</span>
              <span>
                {showAnchor ? (
                  entry.anchored ? (
                    <Chip tone="good">已存证</Chip>
                  ) : (
                    <Chip tone="warn">待存证</Chip>
                  )
                ) : (
                  <Chip tone="brand">公开</Chip>
                )}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
