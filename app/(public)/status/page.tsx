import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, Chip, SectionHeading } from '@/components/ui/primitives';
import { CircleCheckIcon, ClockIcon, ShieldCheckIcon } from '@/components/ui/icons';
import { fill } from '@/lib/i18n/format';
import type { Dictionary } from '@/lib/i18n/dictionary';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { status } = await getMessages();
  return { title: status.metaTitle, description: status.metaDescription };
}

/**
 * Placeholder status data for the public status page.
 *
 * Real availability has to come from the platform's own monitoring, which does
 * not exist yet (architecture.md 21). Every component listed here maps to a
 * surface that is actually in scope; swap this module for a metrics query once
 * monitoring is wired. Names and prose live in the dictionaries -- only the
 * measurements are here.
 */
const CHECKED_AT = '2026-08-25 09:40 (UTC+8)';

const WINDOW_DAYS = 90;

type Health = 'ok' | 'degraded';

/** `dips` holds the days-ago offsets that were not fully healthy. */
interface ComponentFacts {
  id: keyof Dictionary['status']['components'];
  health: Health;
  uptime: string;
  dips: number[];
}

const COMPONENT_FACTS: ComponentFacts[] = [
  { id: 'retrieval', health: 'ok', uptime: '99.98%', dips: [41] },
  { id: 'mcp', health: 'ok', uptime: '99.96%', dips: [27, 41] },
  { id: 'indexing', health: 'degraded', uptime: '99.81%', dips: [0, 1, 14, 53, 54, 55] },
  { id: 'console', health: 'ok', uptime: '100.00%', dips: [] },
  { id: 'claims', health: 'ok', uptime: '99.95%', dips: [33] },
  { id: 'anchoring', health: 'ok', uptime: '99.90%', dips: [7, 62, 63] },
  { id: 'metering', health: 'ok', uptime: '99.99%', dips: [] },
];

interface IncidentFacts {
  id: keyof Dictionary['status']['incidents'];
  date: string;
  scope: keyof Dictionary['status']['components'];
  resolved: boolean;
}

const INCIDENT_FACTS: IncidentFacts[] = [
  { id: 'backlog', date: '2026-08-24', scope: 'indexing', resolved: false },
  { id: 'handshake', date: '2026-08-11', scope: 'mcp', resolved: true },
  { id: 'anchorDelay', date: '2026-07-14', scope: 'anchoring', resolved: true },
  { id: 'latency', date: '2026-06-23', scope: 'retrieval', resolved: true },
];

export default async function StatusPage() {
  const { status: st } = await getMessages();

  const components = COMPONENT_FACTS.map((facts) => ({ ...facts, ...st.components[facts.id] }));
  const incidents = INCIDENT_FACTS.map((facts) => ({
    ...facts,
    ...st.incidents[facts.id],
    scopeName: st.components[facts.scope].name,
  }));
  const degraded = components.filter((c) => c.health !== 'ok');

  return (
    <>
      <section className="mx-auto w-full max-w-[918px] px-5 pt-11 pb-12">
        <SectionHeading eyebrow="STATUS" title={st.title} as="h1" size="lg" />
        <p className="mt-3 max-w-[70ch] text-[13px] leading-[1.7] text-muted">
          {fill(st.lede, { days: WINDOW_DAYS })}
        </p>

        <Card className="mt-7 flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className={degraded.length ? 'mt-0.5 text-warn' : 'mt-0.5 text-good'}>
              {degraded.length ? <ClockIcon size={18} /> : <CircleCheckIcon size={18} />}
            </span>
            <div>
              <p className="text-[15px] font-semibold tracking-[-0.03em] text-ink">
                {degraded.length
                  ? fill(st.degradedSummary, { count: degraded.length })
                  : st.allHealthy}
              </p>
              <p className="mt-1 text-[12.5px] leading-[1.7] text-muted">
                {degraded.length
                  ? fill(st.degradedNote, {
                      names: degraded.map((c) => c.name).join(st.nameSeparator),
                    })
                  : st.allHealthyNote}
              </p>
            </div>
          </div>
          <p className="shrink-0 text-[11px] text-faint sm:text-right">
            {st.lastChecked}
            <br className="hidden sm:block" /> {CHECKED_AT}
          </p>
        </Card>
      </section>

      <section className="mx-auto w-full max-w-[918px] border-t-2 border-line px-5 pt-12 pb-14">
        <SectionHeading eyebrow="COMPONENTS" title={st.componentsTitle} />
        <p className="mt-3 text-[13px] text-muted">{st.componentsNote}</p>

        <Card className="mt-6 overflow-hidden">
          {components.map((c, index) => (
            <div
              key={c.name}
              className={`flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between ${
                index === 0 ? '' : 'border-t-2 border-line'
              }`}
            >
              <div className="min-w-[240px]">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-[13.5px] font-semibold tracking-[-0.02em] text-ink">
                    {c.name}
                  </h3>
                  <Chip tone={c.health === 'ok' ? 'good' : 'warn'}>
                    {c.health === 'ok' ? st.healthOk : st.healthDegraded}
                  </Chip>
                </div>
                <p className="mt-1.5 text-[12px] leading-[1.7] text-muted">{c.detail}</p>
              </div>

              <div className="flex flex-col items-start gap-2 lg:items-end">
                <div aria-hidden className="flex items-end gap-[2px] overflow-hidden">
                  {Array.from({ length: WINDOW_DAYS }, (_, i) => {
                    const daysAgo = WINDOW_DAYS - 1 - i;
                    return (
                      <span
                        key={daysAgo}
                        className={`h-6 w-[3px] rounded-[1px] ${
                          c.dips.includes(daysAgo) ? 'bg-warn' : 'bg-good/70'
                        }`}
                      />
                    );
                  })}
                </div>
                <p className="text-[11px] text-faint">
                  {fill(st.uptimeLabel, { days: WINDOW_DAYS })}{' '}
                  <span className="font-semibold text-muted">{c.uptime}</span>
                </p>
              </div>
            </div>
          ))}
        </Card>

        <p className="mt-5 text-[12px] text-faint">{st.uptimeFootnote}</p>
      </section>

      <section className="mx-auto w-full max-w-[918px] border-t-2 border-line px-5 pt-12 pb-14">
        <SectionHeading eyebrow="INCIDENTS" title={st.incidentsTitle} />
        <p className="mt-3 text-[13px] text-muted">{st.incidentsNote}</p>

        <ol className="mt-7 flex flex-col">
          {incidents.map((incident) => (
            <li key={incident.date} className="border-t-2 border-line py-5">
              <div className="flex flex-wrap items-center gap-3">
                <time className="font-mono text-[11px] text-faint">{incident.date}</time>
                <h3 className="text-[13.5px] font-semibold tracking-[-0.02em] text-ink">
                  {incident.title}
                </h3>
                <Chip tone={incident.resolved ? 'good' : 'warn'}>
                  {incident.resolved ? st.incidentResolved : st.incidentOngoing}
                </Chip>
                <span className="text-[11px] text-faint">{incident.scopeName}</span>
              </div>
              <p className="mt-2 max-w-[80ch] text-[12.5px] leading-[1.75] text-muted">
                {incident.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto w-full max-w-[918px] border-t-2 border-line px-5 pt-12 pb-16">
        <SectionHeading eyebrow="REPORT" title={st.reportTitle} />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Card className="p-6">
            <p className="flex items-center gap-2 text-[13.5px] font-semibold tracking-[-0.02em] text-ink">
              <span className="text-brand">
                <ClockIcon size={16} />
              </span>
              {st.reportCardTitle}
            </p>
            <p className="mt-2.5 text-[12.5px] leading-[1.75] text-muted">{st.reportCardBody}</p>
            <Link
              href="/contact"
              className="mt-4 inline-block text-[12.5px] font-medium text-brandink hover:underline"
            >
              {st.reportCardLink}
            </Link>
          </Card>
          <Card className="p-6">
            <p className="flex items-center gap-2 text-[13.5px] font-semibold tracking-[-0.02em] text-ink">
              <span className="text-brand">
                <ShieldCheckIcon size={16} />
              </span>
              {st.anchorCardTitle}
            </p>
            <p className="mt-2.5 text-[12.5px] leading-[1.75] text-muted">{st.anchorCardBody}</p>
            <Link
              href="/docs/anchoring"
              className="mt-4 inline-block text-[12.5px] font-medium text-brandink hover:underline"
            >
              {st.anchorCardLink}
            </Link>
          </Card>
        </div>
      </section>
    </>
  );
}
