'use client';

import { useState, type FormEvent } from 'react';

import { useI18n } from '@/lib/i18n/client';
import type { Dictionary } from '@/lib/i18n/dictionary';
import type { PlaygroundTranscript } from '@/lib/application/playground';
import { fill } from '@/lib/i18n/format';

/**
 * Playground transcript.
 *
 * requirement.md 5.1 makes this the only entry point allowed to generate prose,
 * and puts eight hard rules on it. The live path runs through POST
 * /api/playground: the server routes the question to a library (the web
 * entry's auto-routing of architecture.md 9.6), retrieves through the shared
 * function, and generates with citation binding. What renders here follows
 * the same rules the backend enforces:
 *
 * - rule 2: zero retrieved chunks renders the no-context card -- the model
 *   was never called, and nothing here pretends otherwise.
 * - rule 5: every factual sentence carries footnotes that resolve to the
 *   retrieved chunks; a degraded answer shows the chunks and no prose.
 *
 * The seeded exchange at the top is illustrative copy, kept as a worked
 * example of what an answer looks like.
 */

const TOOL_CALLS = [
  {
    name: 'resolve-library-id',
    params: [
      ['libraryName', '"next.js"'],
      ['query', '"App Router server authentication"'],
    ],
  },
  {
    name: 'query-docs',
    params: [
      ['libraryId', '"/vercel/next.js"'],
      ['query', '"App Router server authentication"'],
    ],
  },
] as const;

const SAMPLE_CODE = `import { verifySession } from '@/lib/session'

export async function getUser() {
  const session = await verifySession()
  if (!session) return null

  return db.user.findUnique({
    where: { id: session.userId }
  })
}`;

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[78%] rounded-[16px] rounded-br-[4px] bg-[#079b78] px-4 py-3 text-[13px] leading-[1.6] text-white">
        {text}
      </p>
    </div>
  );
}

function ToolCall({ name, params }: { name: string; params: readonly (readonly [string, string])[] }) {
  return (
    <div className="rounded-[9px] border border-line/70 bg-[#f8f9f8] p-2.5">
      <div className="flex items-center justify-between gap-3">
        <code className="font-mono text-[11.5px] font-semibold text-ink">{name}</code>
        <span aria-hidden className="text-[10px] text-faint">
          ▾
        </span>
      </div>
      <dl className="mt-1.5 flex flex-col gap-1">
        {params.map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="font-mono text-[11px] text-faint">{k}:</dt>
            <dd className="font-mono text-[11px] break-all text-muted">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SeedAnswer({ t }: { t: Dictionary['playground'] }) {
  return (
    <>
      <div className="flex justify-start">
        <p className="max-w-[78%] rounded-[13px] rounded-bl-[4px] bg-[#f2f4f3] px-3.5 py-2.5 text-[13px] leading-[1.6] text-ink">
          {t.thinking}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {TOOL_CALLS.map((t) => (
          <ToolCall key={t.name} name={t.name} params={t.params} />
        ))}
      </div>

      <p className="text-[11.5px] leading-[1.7] text-faint">
        {t.groundingNote}
      </p>

      <article className="rounded-[12px] rounded-bl-[4px] bg-[#f2f4f3] p-3.5">
        <h3 className="text-[14px] font-semibold tracking-[-0.02em] text-ink">
          {t.answerTitle}
        </h3>
        <p className="mt-2 text-[12.5px] leading-[1.75] text-muted">
          {t.answerBody}
          <sup className="ml-0.5 rounded bg-[#087c6a]/12 px-1 text-[9px] font-semibold text-[#087c6a]">
            1
          </sup>
        </p>

        <p className="mt-3.5 text-[12.5px] font-semibold text-ink">{t.exampleLabel}</p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-[#242a2f] p-3.5">
          <code className="font-mono text-[11px] leading-[1.75] text-[#dbe4e4]">{SAMPLE_CODE}</code>
        </pre>

        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3">
          <p className="flex items-center gap-1.5 text-[10.5px] text-[#087c6a]">
            <span className="rounded bg-[#087c6a]/12 px-1 font-semibold">1</span>
            <span className="font-semibold text-ink">Next.js</span>
            {t.citationSource}
          </p>
          <p className="flex items-center gap-2 text-[10.5px] text-muted">
            <span className="rounded-full bg-goodsoft px-2 py-0.5 font-semibold text-good">
              {t.anchored}
            </span>
            {t.citationVersion}
            <span className="font-mono">0x7f3c…a91b</span>
          </p>
        </div>
      </article>
    </>
  );
}

function WarnCard({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-[12px] rounded-bl-[4px] border border-warnsoft bg-warnsoft/50 p-3.5">
      <p className="text-[12.5px] font-semibold text-warn">{title}</p>
      <p className="mt-1.5 text-[12px] leading-[1.75] text-muted">{body}</p>
    </article>
  );
}

/** Footnote numbers, in order of first citation; uncited sources come after. */
function sourceNumbers(transcript: PlaygroundTranscript): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const citation of transcript.citations) {
    if (!numbers.has(citation.chunkId)) numbers.set(citation.chunkId, numbers.size + 1);
  }
  for (const source of transcript.sources) {
    if (!numbers.has(source.chunkId)) numbers.set(source.chunkId, numbers.size + 1);
  }
  return numbers;
}

function SourceList({
  transcript,
  numbers,
  t,
}: {
  transcript: PlaygroundTranscript;
  numbers: Map<string, number>;
  t: Dictionary['playground'];
}) {
  const ordered = [...transcript.sources].sort(
    (a, b) => (numbers.get(a.chunkId) ?? 99) - (numbers.get(b.chunkId) ?? 99),
  );
  return (
    <div className="mt-3.5 flex flex-col gap-1.5 border-t border-line/60 pt-3">
      <p className="text-[10.5px] font-semibold tracking-[0.02em] text-faint uppercase">
        {t.sourcesLabel}
      </p>
      {ordered.map((source) => (
        <p key={source.chunkId} className="flex items-baseline gap-1.5 text-[10.5px] text-muted">
          <span className="rounded bg-[#087c6a]/12 px-1 font-semibold text-[#087c6a]">
            {numbers.get(source.chunkId)}
          </span>
          <a
            href={source.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="font-semibold text-ink underline-offset-2 hover:underline"
          >
            {source.documentTitle}
          </a>
          {source.section ? <span>· {source.section}</span> : null}
        </p>
      ))}
    </div>
  );
}

function LiveAnswer({ transcript, t }: { transcript: PlaygroundTranscript; t: Dictionary['playground'] }) {
  const numbers = sourceNumbers(transcript);

  /* Sentences regroup with their footnote marks: one claim, all its refs. */
  const claims: { claim: string; refs: number[] }[] = [];
  for (const citation of transcript.citations) {
    const last = claims[claims.length - 1];
    const ref = numbers.get(citation.chunkId);
    if (last && last.claim === citation.claim) {
      if (ref) last.refs.push(ref);
    } else {
      claims.push({ claim: citation.claim, refs: ref ? [ref] : [] });
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <ToolCall
          name="resolve-library-id"
          params={[['query', JSON.stringify(transcript.question)]]}
        />
        {transcript.libraryId ? (
          <ToolCall
            name="query-docs"
            params={[
              ['libraryId', JSON.stringify(transcript.libraryId)],
              ['query', JSON.stringify(transcript.question)],
            ]}
          />
        ) : null}
      </div>

      {transcript.libraryTitle ? (
        <p className="text-[11.5px] leading-[1.7] text-faint">
          {fill(t.routedNote, {
            title: transcript.libraryTitle,
            version: transcript.version ?? '',
          })}
        </p>
      ) : null}

      {transcript.kind === 'no_library' ? (
        <WarnCard title={t.noLibraryTitle} body={t.noLibraryBody} />
      ) : null}
      {transcript.kind === 'no_context' ? (
        <WarnCard title={t.noContextTitle} body={t.noContextBody} />
      ) : null}

      {transcript.kind === 'degraded' ? (
        <article className="rounded-[12px] rounded-bl-[4px] bg-[#f2f4f3] p-3.5">
          <p className="text-[12.5px] font-semibold text-ink">{t.degradedTitle}</p>
          <p className="mt-1.5 text-[12px] leading-[1.75] text-muted">{t.degradedBody}</p>
          <SourceList transcript={transcript} numbers={numbers} t={t} />
        </article>
      ) : null}

      {transcript.kind === 'answer' ? (
        <article className="rounded-[12px] rounded-bl-[4px] bg-[#f2f4f3] p-3.5">
          <p className="text-[12.5px] leading-[1.75] text-muted">
            {claims.map((entry, index) => (
              <span key={`${entry.claim}-${index}`}>
                {entry.claim}
                {entry.refs.map((ref) => (
                  <sup
                    key={ref}
                    className="ml-0.5 rounded bg-[#087c6a]/12 px-1 text-[9px] font-semibold text-[#087c6a]"
                  >
                    {ref}
                  </sup>
                ))}{' '}
              </span>
            ))}
          </p>
          <SourceList transcript={transcript} numbers={numbers} t={t} />
        </article>
      ) : null}
    </>
  );
}

type Exchange =
  | { question: string; state: 'loading' }
  | { question: string; state: 'error'; message: string }
  | { question: string; state: 'done'; transcript: PlaygroundTranscript };

export function Playground() {
  const { t: messages } = useI18n();
  const t = messages.playground;
  const [question, setQuestion] = useState('');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    setQuestion('');
    setBusy(true);
    setExchanges((prev) => [...prev, { question: q, state: 'loading' }]);

    let next: Exchange;
    try {
      const response = await fetch('/api/playground', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      if (response.status === 429) {
        next = { question: q, state: 'error', message: t.rateLimited };
      } else if (!response.ok) {
        next = { question: q, state: 'error', message: t.askError };
      } else {
        next = { question: q, state: 'done', transcript: (await response.json()) as PlaygroundTranscript };
      }
    } catch {
      next = { question: q, state: 'error', message: t.askError };
    }
    setExchanges((prev) => [...prev.slice(0, -1), next]);
    setBusy(false);
  }

  return (
    <div className="mx-auto w-full">
      <div className="overflow-hidden rounded-[14px] border-2 border-line bg-card">
        <div className="flex flex-col gap-3.5 p-4">
          <UserBubble text={t.seedQuestion} />
          <SeedAnswer t={t} />

          {exchanges.map((exchange, index) => (
            <div key={`${exchange.question}-${index}`} className="flex flex-col gap-3.5">
              <UserBubble text={exchange.question} />
              {exchange.state === 'loading' ? (
                <div className="flex justify-start">
                  <p className="max-w-[78%] rounded-[13px] rounded-bl-[4px] bg-[#f2f4f3] px-3.5 py-2.5 text-[13px] leading-[1.6] text-muted">
                    {t.resolving}
                  </p>
                </div>
              ) : null}
              {exchange.state === 'error' ? (
                <WarnCard title={t.askErrorTitle} body={exchange.message} />
              ) : null}
              {exchange.state === 'done' ? <LiveAnswer transcript={exchange.transcript} t={t} /> : null}
            </div>
          ))}
        </div>

        <form onSubmit={onSubmit} className="flex items-center gap-2 border-t-2 border-line p-3.5">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t.inputPlaceholder}
            aria-label={t.inputPlaceholder}
            className="h-[42px] min-w-0 flex-1 rounded-[9px] border-2 border-line bg-[#fdfefe] px-3.5 text-[13px] text-ink outline-none placeholder:text-muted/70 focus:border-brand"
          />
          <button
            type="submit"
            disabled={busy}
            className="h-[42px] shrink-0 rounded-[9px] bg-brand px-5 text-[13px] font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-60"
          >
            {t.send}
          </button>
        </form>
      </div>

      <p className="mt-3.5 text-center text-[11.5px] leading-[1.7] text-faint">
        {t.footnoteLine1}
        <br />
        {t.footnoteLine2}
      </p>
    </div>
  );
}
