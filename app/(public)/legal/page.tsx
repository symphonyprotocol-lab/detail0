import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Card, SectionHeading } from '@/components/ui/primitives';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { legal } = await getMessages();
  return { title: legal.metaTitle, description: legal.metaDescription };
}

const EFFECTIVE_AT = '2026-08-01';

/** Anchor ids, in the order the table of contents and the articles run. */
const SECTION_IDS = [
  'terms',
  'aup',
  'content',
  'privacy',
  'billing',
  'anchoring',
  'liability',
  'changes',
] as const;

function Article({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      id={id}
      className="scroll-mt-[78px] border-t-2 border-line px-5 pt-11 pb-3 last:pb-14"
    >
      <h2 className="text-[21px] leading-[1.3] font-[650] tracking-[-0.04em] text-ink">{title}</h2>
      <div className="mt-4 flex max-w-[80ch] flex-col gap-3.5 text-[13px] leading-[1.8] text-muted">
        {children}
      </div>
    </section>
  );
}

function Clause({ n, children }: { n: string; children: ReactNode }) {
  return (
    <p className="flex gap-3">
      <span className="shrink-0 font-mono text-[11.5px] leading-[1.95] text-faint">{n}</span>
      <span>{children}</span>
    </p>
  );
}

export default async function LegalPage() {
  const { legal: g } = await getMessages();
  const c = g.clauses;

  return (
    <div className="mx-auto w-full max-w-[918px]">
      <section className="px-5 pt-11 pb-12">
        <SectionHeading eyebrow="LEGAL" title={g.title} as="h1" size="lg" />
        <p className="mt-3 max-w-[70ch] text-[13px] leading-[1.7] text-muted">
          {g.ledeLead} <span className="font-medium text-ink">{EFFECTIVE_AT}</span>
          {g.ledeTail}
        </p>

        <Card className="mt-7 p-6">
          <p className="text-[11px] font-[750] tracking-[0.1em] text-brand">{g.contents}</p>
          <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {g.toc.map((s, i) => (
              <li key={SECTION_IDS[i]}>
                <a href={`#${SECTION_IDS[i]}`} className="group flex items-baseline gap-3">
                  <span className="font-mono text-[11px] text-faint">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span>
                    <span className="text-[13px] font-medium text-ink group-hover:text-brandink">
                      {s.title}
                    </span>
                    <span className="ml-2 text-[11.5px] text-faint">{s.hint}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <Article id="terms" title={g.articles.terms}>
        <Clause n="1.1">{c.c11}</Clause>
        <Clause n="1.2">{c.c12}</Clause>
        <Clause n="1.3">{c.c13}</Clause>
        <Clause n="1.4">{c.c14}</Clause>
        <Clause n="1.5">{c.c15}</Clause>
      </Article>

      <Article id="aup" title={g.articles.aup}>
        <Clause n="2.1">{c.c21}</Clause>
        <Clause n="2.2">{c.c22}</Clause>
        <Clause n="2.3">{c.c23}</Clause>
        <Clause n="2.4">{c.c24}</Clause>
      </Article>

      <Article id="content" title={g.articles.content}>
        <Clause n="3.1">{c.c31}</Clause>
        <Clause n="3.2">{c.c32}</Clause>
        <Clause n="3.3">
          {c.c33.lead}{' '}
          <code className="rounded bg-mutedbg px-1 py-0.5 font-mono text-[11.5px] text-steel">
            recall0.json
          </code>
          {c.c33.tail}
        </Clause>
        <Clause n="3.4">{c.c34}</Clause>
        <Clause n="3.5">{c.c35}</Clause>
      </Article>

      <Article id="privacy" title={g.articles.privacy}>
        <Clause n="4.1">{c.c41}</Clause>
        <Clause n="4.2">{c.c42}</Clause>
        <Clause n="4.3">{c.c43}</Clause>
        <Clause n="4.4">{c.c44}</Clause>
        <Clause n="4.5">{c.c45}</Clause>
        <Clause n="4.6">{c.c46}</Clause>
      </Article>

      <Article id="billing" title={g.articles.billing}>
        <Clause n="5.1">{c.c51}</Clause>
        <Clause n="5.2">{c.c52}</Clause>
        <Clause n="5.3">{c.c53}</Clause>
        <Clause n="5.4">{c.c54}</Clause>
        <Clause n="5.5">{c.c55}</Clause>
      </Article>

      <Article id="anchoring" title={g.articles.anchoring}>
        <Clause n="6.1">{c.c61}</Clause>
        <Clause n="6.2">
          {c.c62.lead}
          <span className="font-medium text-ink">{c.c62.emphasis}</span>
          {c.c62.tail}
        </Clause>
        <Clause n="6.3">{c.c63}</Clause>
      </Article>

      <Article id="liability" title={g.articles.liability}>
        <Clause n="7.1">{c.c71}</Clause>
        <Clause n="7.2">{c.c72}</Clause>
        <Clause n="7.3">{c.c73}</Clause>
        <Clause n="7.4">{c.c74}</Clause>
      </Article>

      <Article id="changes" title={g.articles.changes}>
        <Clause n="8.1">{c.c81}</Clause>
        <Clause n="8.2">
          {c.c82.lead}{' '}
          <a href="mailto:legal@recall0.com" className="font-medium text-brandink hover:underline">
            legal@recall0.com
          </a>
          {c.c82.mid}{' '}
          <a
            href="mailto:security@recall0.com"
            className="font-medium text-brandink hover:underline"
          >
            security@recall0.com
          </a>
          {c.c82.tail}
        </Clause>
      </Article>

      <section className="border-t-2 border-line px-5 pt-8 pb-16">
        <p className="text-[12px] leading-[1.8] text-faint">{g.footnote}</p>
      </section>
    </div>
  );
}
