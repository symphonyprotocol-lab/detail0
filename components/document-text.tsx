import { fill } from '@/lib/i18n/format';

/**
 * A document's indexed text, chunk by chunk, for a preview page. Plain
 * pre-wrapped text rather than rendered Markdown: what is shown is what the
 * retrieval API returns, and rendering would hide the boundaries a citation
 * points at.
 */
export function DocumentText({
  chunks,
  chunkLabel,
}: {
  chunks: { ordinal: number; tokens: number; body: string; heading: string | null }[];
  chunkLabel: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {chunks.map((chunk) => (
        <article
          key={chunk.ordinal}
          className="rounded-[10px] border-2 border-line bg-card px-[19px] py-4"
        >
          <p className="mb-2 flex flex-wrap items-center gap-2 text-[11px] tracking-[-0.023em] text-muted">
            <span className="font-semibold">{fill(chunkLabel, { ordinal: chunk.ordinal + 1 })}</span>
            {chunk.heading ? <span>· {chunk.heading}</span> : null}
            <span>· {chunk.tokens} tokens</span>
          </p>
          <pre className="font-sans text-[12.5px] leading-[1.7] tracking-[-0.023em] whitespace-pre-wrap break-words text-ink">
            {chunk.body}
          </pre>
        </article>
      ))}
    </div>
  );
}
