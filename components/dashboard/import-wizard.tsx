'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { PANEL } from '@/components/dashboard/ui';
import {
  ArrowRightIcon,
  BracesIcon,
  FileCodeIcon,
  GitBranchIcon,
  GlobeIcon,
  HashIcon,
} from '@/components/ui/icons';
import type { CreateLibraryResult } from '@/app/dashboard/libraries/new/actions';
import { useI18n } from '@/lib/i18n/client';
import { fill } from '@/lib/i18n/format';

/**
 * Import wizard -- design source frame `ISF8H`, live end to end. Four steps:
 * pick the connector-backed source, describe the library, choose visibility,
 * confirm. Submission writes the rows and queues the build (create.ts); the
 * request never waits for ingestion (architecture.md 3.1), so success shows
 * the queued state rather than pretending the index exists.
 */

const SOURCES = ['github', 'website', 'llms_txt', 'openapi', 'notion'] as const;
type SourceId = (typeof SOURCES)[number];

const SOURCE_ICONS: Record<SourceId, (props: { size?: number }) => React.ReactElement> = {
  github: GitBranchIcon,
  website: GlobeIcon,
  llms_txt: HashIcon,
  openapi: BracesIcon,
  notion: FileCodeIcon,
};

/** Only github derives its id from the source; everything else needs a slug. */
const NEEDS_SLUG: Record<SourceId, string | null> = {
  github: null,
  website: 'websites',
  llms_txt: 'websites',
  openapi: 'docs',
  notion: 'notion',
};

const FIELD =
  'h-9 w-full rounded-[7px] border-2 border-line bg-card px-2.5 text-[12px] tracking-[-0.023em] text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold tracking-[-0.023em] text-steel">{label}</span>
      {children}
      {hint ? <span className="text-[10px] tracking-[-0.023em] text-muted">{hint}</span> : null}
    </label>
  );
}

export function ImportWizard({
  action,
}: {
  action: (previous: CreateLibraryResult | null, form: FormData) => Promise<CreateLibraryResult>;
}) {
  const { t } = useI18n();
  const n = t.dashboard.newLibrary;
  const w = n.wizard;
  const steps = [w.stepSource, w.stepDetails, w.stepVisibility, w.stepConfirm];

  const [step, setStep] = useState(0);
  const [source, setSource] = useState<SourceId | null>(null);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [state, formAction, pending] = useActionState(action, null);

  const namespace = source ? NEEDS_SLUG[source] : null;
  const detailsComplete =
    title.trim().length > 0 && location.trim().length > 0 && (namespace === null || slug.trim().length > 0);
  const canContinue = step === 0 ? source !== null : step === 1 ? detailsComplete : true;

  if (state?.ok) {
    return (
      <section className={`${PANEL} flex flex-col items-start gap-3 p-8`}>
        <p className="text-[17px] font-semibold tracking-[-0.03em] text-ink">{w.queuedTitle}</p>
        <p className="max-w-[60ch] text-[12.5px] leading-[1.7] tracking-[-0.023em] text-muted">
          {fill(w.queuedBody, { id: state.publicId ?? '' })}
        </p>
        <Link
          href="/dashboard/libraries"
          className="mt-2 inline-flex h-[35px] items-center gap-1.5 rounded-[7px] bg-brand px-3.5 text-[12px] font-medium text-white hover:bg-brand/90"
        >
          {w.queuedCta}
          <ArrowRightIcon size={14} />
        </Link>
      </section>
    );
  }

  return (
    <section className={`${PANEL} p-0.5`}>
      <nav className="flex flex-wrap gap-4 px-6 py-5" aria-label={n.stepsLabel}>
        {steps.map((label, index) => (
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

      <form action={formAction} className="border-t-2 border-line">
        {/* Every collected value rides hidden inputs so the final submit posts
            the whole wizard regardless of which step is visible. */}
        <input type="hidden" name="sourceType" value={source ?? ''} />
        <input type="hidden" name="title" value={title} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="location" value={location} />
        <input type="hidden" name="description" value={description} />
        <input type="hidden" name="language" value={language} />
        <input type="hidden" name="visibility" value={visibility} />

        <div className="px-6 py-6">
          <p className="text-[12px] tracking-[-0.023em] text-muted">
            {fill(n.stepCounter, { current: step + 1, total: steps.length })}
          </p>

          {step === 0 ? (
            <>
              <h2 className="mt-2.5 text-[19px] leading-[1.4] font-[650] tracking-[-0.03em] text-ink">
                {n.sourceQuestion}
              </h2>
              <p className="mt-1.5 text-[12px] tracking-[-0.023em] text-muted">{n.sourceHint}</p>
              <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                {SOURCES.map((id) => {
                  const Icon = SOURCE_ICONS[id];
                  const active = source === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSource(id)}
                      aria-pressed={active}
                      className={`flex flex-col gap-2 rounded-[10px] border-2 p-4 text-left transition-colors ${
                        active ? 'border-brand bg-[#f0f8f8]' : 'border-line bg-card hover:bg-subtle'
                      }`}
                    >
                      <span className="flex size-8 items-center justify-center rounded-lg bg-brandsoft text-brand">
                        <Icon size={18} />
                      </span>
                      <span className="text-[13px] tracking-[-0.023em] text-ink">
                        {w.sources[id].name}
                      </span>
                      <span className="text-[11px] tracking-[-0.023em] text-muted">
                        {w.sources[id].note}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}

          {step === 1 && source ? (
            <div className="mt-4 flex max-w-[520px] flex-col gap-4">
              <Field label={w.titleLabel}>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={120}
                  className={FIELD}
                />
              </Field>
              <Field label={w.locationLabel} hint={w.locations[source]}>
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  className={FIELD}
                />
              </Field>
              {namespace ? (
                <Field label={w.slugLabel} hint={fill(w.slugHint, { prefix: `/${namespace}/` })}>
                  <input
                    value={slug}
                    onChange={(event) => setSlug(event.target.value)}
                    className={FIELD}
                  />
                </Field>
              ) : (
                <p className="text-[11px] tracking-[-0.023em] text-muted">{w.githubIdNote}</p>
              )}
              <Field label={w.descriptionLabel}>
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={300}
                  className={FIELD}
                />
              </Field>
              <Field label={w.languageLabel} hint={w.languageHint}>
                <input
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  maxLength={40}
                  className={FIELD}
                />
              </Field>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {(['public', 'private'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setVisibility(option)}
                  aria-pressed={visibility === option}
                  className={`flex flex-col gap-2 rounded-[10px] border-2 p-4 text-left transition-colors ${
                    visibility === option
                      ? 'border-brand bg-[#f0f8f8]'
                      : 'border-line bg-card hover:bg-subtle'
                  }`}
                >
                  <span className="text-[13px] tracking-[-0.023em] text-ink">
                    {option === 'public' ? w.visibilityPublic : w.visibilityPrivate}
                  </span>
                  <span className="text-[11px] leading-[1.6] tracking-[-0.023em] text-muted">
                    {option === 'public' ? w.visibilityPublicNote : w.visibilityPrivateNote}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {step === 3 && source ? (
            <div className="mt-4 flex max-w-[520px] flex-col gap-1 rounded-[10px] border-2 border-line bg-subtle p-4">
              {[
                [w.stepSource, w.sources[source].name],
                [w.titleLabel, title],
                [w.locationLabel, location],
                ...(namespace ? [[w.slugLabel, `/${namespace}/${slug.trim().toLowerCase()}`]] : []),
                [
                  w.stepVisibility,
                  visibility === 'public' ? w.visibilityPublic : w.visibilityPrivate,
                ],
              ].map(([key, value]) => (
                <div key={key} className="flex items-center justify-between gap-4 py-1">
                  <span className="text-[12px] text-muted">{key}</span>
                  <span className="truncate text-right text-[12px] font-medium text-ink">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {state && !state.ok ? (
            <p className="mt-4 text-[12px] tracking-[-0.023em] text-rose">
              {state.error === 'limit'
                ? w.errorLimit
                : state.error === 'taken'
                  ? w.errorTaken
                  : state.error === 'invalid'
                    ? w.errorInvalid
                    : w.errorUnavailable}
            </p>
          ) : null}
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
          {step < steps.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep((current) => current + 1)}
              disabled={!canContinue}
              className="inline-flex h-[35px] items-center gap-1.5 rounded-[7px] bg-brand px-3.5 text-[12px] font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-40"
            >
              {n.continue}
              <ArrowRightIcon size={14} />
            </button>
          ) : (
            <button
              type="submit"
              disabled={pending || !detailsComplete || source === null}
              className="inline-flex h-[35px] items-center gap-1.5 rounded-[7px] bg-brand px-3.5 text-[12px] font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-40"
            >
              {w.submit}
              <ArrowRightIcon size={14} />
            </button>
          )}
        </footer>
      </form>
    </section>
  );
}
