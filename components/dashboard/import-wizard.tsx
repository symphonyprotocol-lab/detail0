'use client';

import { useState } from 'react';
import { PANEL } from '@/components/dashboard/ui';
import {
  ArrowRightIcon,
  BracesIcon,
  FileCodeIcon,
  FileTextIcon,
  GitBranchIcon,
  GlobeIcon,
  HashIcon,
} from '@/components/ui/icons';
import { dashboardCopy } from '@/lib/dashboard/demo-data';
import { useI18n } from '@/lib/i18n/client';
import { fill } from '@/lib/i18n/format';

const SOURCE_ICONS: Record<string, (props: { size?: number }) => React.ReactElement> = {
  github: GitBranchIcon,
  pdf: FileTextIcon,
  markdown: HashIcon,
  notion: FileCodeIcon,
  openapi: BracesIcon,
  website: GlobeIcon,
};

/**
 * Import wizard -- design source frame `ISF8H`.
 *
 * Only step 1 exists in the design; steps 2-4 are placeholders so the stepper
 * still means something, and fill in once those screens are drawn.
 */
export function ImportWizard() {
  const { t } = useI18n();
  const n = t.dashboard.newLibrary;
  const { importSteps, importSources } = dashboardCopy(t);
  const [step, setStep] = useState(0);
  const [source, setSource] = useState<string | null>(null);

  return (
    <section className={`${PANEL} p-0.5`}>
      <nav className="flex flex-wrap gap-4 px-6 py-5" aria-label={n.stepsLabel}>
        {importSteps.map((label, index) => (
          <span key={label} className="flex flex-1 items-center gap-2">
            <span
              aria-hidden
              className={`flex size-[22px] shrink-0 items-center justify-center rounded-full text-[11px] ${
                index === step
                  ? 'bg-brand text-white'
                  : index < step
                    ? 'bg-brandsoft text-brandink'
                    : 'bg-mutedbg text-muted'
              }`}
            >
              {index + 1}
            </span>
            <span
              aria-current={index === step ? 'step' : undefined}
              className={`text-[11px] tracking-[-0.023em] whitespace-nowrap ${
                index === step ? 'text-ink' : 'text-muted'
              }`}
            >
              {label}
            </span>
          </span>
        ))}
      </nav>

      <div className="border-t-2 border-line px-6 py-6">
        <p className="text-[12px] tracking-[-0.023em] text-muted">
          {fill(n.stepCounter, { current: step + 1, total: importSteps.length })}
        </p>

        {step === 0 ? (
          <>
            <h2 className="mt-2.5 text-[19px] leading-[1.4] font-[650] tracking-[-0.03em] text-ink">
              {n.sourceQuestion}
            </h2>
            <p className="mt-1.5 text-[12px] tracking-[-0.023em] text-muted">{n.sourceHint}</p>

            <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
              {importSources.map((option) => {
                const Icon = SOURCE_ICONS[option.id] ?? FileTextIcon;
                const active = source === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSource(option.id)}
                    aria-pressed={active}
                    className={`flex flex-col gap-2 rounded-[10px] border-2 p-4 text-left transition-colors ${
                      active ? 'border-brand bg-[#f0f8f8]' : 'border-line bg-card hover:bg-subtle'
                    }`}
                  >
                    <span className="flex size-8 items-center justify-center rounded-lg bg-brandsoft text-brand">
                      <Icon size={18} />
                    </span>
                    <span className="text-[13px] tracking-[-0.023em] text-ink">{option.name}</span>
                    <span className="text-[11px] tracking-[-0.023em] text-muted">{option.note}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <p className="mt-4 rounded-[10px] border-2 border-dashed border-line px-4 py-12 text-center text-[12px] text-muted">
            {fill(n.unbuilt, { step: importSteps[step] ?? '' })}
          </p>
        )}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t-2 border-line px-6 py-3.5">
        <button
          type="button"
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          disabled={step === 0}
          className="h-[35px] rounded-[7px] border-2 border-line bg-card px-3 text-[12px] text-steel transition-colors hover:bg-subtle disabled:opacity-40"
        >
          {n.back2}
        </button>
        <button
          type="button"
          onClick={() => setStep((current) => Math.min(importSteps.length - 1, current + 1))}
          disabled={source === null || step === importSteps.length - 1}
          className="inline-flex h-[35px] items-center gap-1.5 rounded-[7px] bg-brand px-3.5 text-[12px] font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-40"
        >
          {n.continue}
          <ArrowRightIcon size={14} />
        </button>
      </footer>
    </section>
  );
}
