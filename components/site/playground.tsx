'use client';

import { useState, type FormEvent } from 'react';

import { useI18n } from '@/lib/i18n/client';
import type { Dictionary } from '@/lib/i18n/dictionary';

/**
 * Playground transcript.
 *
 * requirement.md 5.1 makes this the only entry point allowed to generate prose,
 * and puts eight hard rules on it. Two of them are visible in this component:
 *
 * - rule 2: with zero retrieved chunks the model is never called. Retrieval is
 *   not wired yet, so a submitted question renders the no-context state rather
 *   than a fabricated answer.
 * - rule 5: every factual statement carries a footnote resolving to a chunk,
 *   with source, version and anchor status shown alongside.
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

/** Rule 2 made visible: no retrieved chunks means the model is not called at all. */
function NoContextAnswer({ t }: { t: Dictionary['playground'] }) {
  return (
    <article className="rounded-[12px] rounded-bl-[4px] border border-warnsoft bg-warnsoft/50 p-3.5">
      <p className="text-[12.5px] font-semibold text-warn">{t.noContextTitle}</p>
      <p className="mt-1.5 text-[12px] leading-[1.75] text-muted">{t.noContextBody}</p>
    </article>
  );
}

export function Playground() {
  const { t: messages } = useI18n();
  const t = messages.playground;
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState<string[]>([]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setAsked((prev) => [...prev, q]);
    setQuestion('');
  }

  return (
    <div className="mx-auto w-full">
      <div className="overflow-hidden rounded-[14px] border-2 border-line bg-card">
        <div className="flex flex-col gap-3.5 p-4">
          <UserBubble text={t.seedQuestion} />
          <SeedAnswer t={t} />

          {asked.map((q, i) => (
            <div key={`${q}-${i}`} className="flex flex-col gap-3.5">
              <UserBubble text={q} />
              <NoContextAnswer t={t} />
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
            className="h-[42px] shrink-0 rounded-[9px] bg-brand px-5 text-[13px] font-medium text-white transition-colors hover:bg-brand/90"
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
