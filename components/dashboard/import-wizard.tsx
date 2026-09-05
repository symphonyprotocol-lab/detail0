'use client';

import Link from 'next/link';
import { put as putBlob } from '@vercel/blob/client';
import { useActionState, useRef, useState } from 'react';
import { PANEL } from '@/components/dashboard/ui';
import {
  ArrowRightIcon,
  BracesIcon,
  FileCodeIcon,
  FileTextIcon,
  GitBranchIcon,
  GlobeIcon,
  HashIcon,
  SpinnerIcon,
  UploadIcon,
  XIcon,
} from '@/components/ui/icons';
import type {
  CreateLibraryResult,
  PrepareUploadResult,
} from '@/app/dashboard/libraries/new/actions';
import type { UploadTicket } from '@/lib/infrastructure/objects/store';
import { slugFromTitle, slugWithoutPrefix, UPLOAD_LIMITS } from '@/lib/domain/library';
import { useI18n } from '@/lib/i18n/client';
import { fill } from '@/lib/i18n/format';

/**
 * Import wizard -- design source frame `ISF8H`, live end to end. Four steps:
 * pick the connector-backed source, describe the library, choose visibility,
 * confirm. Submission writes the rows and queues the build (create.ts); the
 * request never waits for ingestion (architecture.md 3.1), so success shows
 * the queued state rather than pretending the index exists.
 */

const SOURCES = ['github', 'website', 'llms_txt', 'openapi', 'notion', 'pdf'] as const;
type SourceId = (typeof SOURCES)[number];

const SOURCE_ICONS: Record<SourceId, (props: { size?: number }) => React.ReactElement> = {
  github: GitBranchIcon,
  website: GlobeIcon,
  llms_txt: HashIcon,
  openapi: BracesIcon,
  notion: FileCodeIcon,
  pdf: UploadIcon,
};

/** Only github derives its id from the source; everything else needs a slug. */
const NEEDS_SLUG: Record<SourceId, string | null> = {
  github: null,
  website: 'websites',
  llms_txt: 'websites',
  openapi: 'docs',
  notion: 'notion',
  pdf: 'docs',
};

/**
 * One picked PDF on its way to the store. The browser redeems the ticket the
 * prepare action hands back -- a presigned PUT for an S3 bucket, a scoped
 * client token for Vercel Blob -- so the file never goes through a server
 * action; what the form finally posts is the manifest of ids, names and
 * sizes, which the create use case confirms against the store.
 */
interface Upload {
  id: string;
  name: string;
  size: number;
  status: 'uploading' | 'done' | 'failed';
}

async function redeem(ticket: UploadTicket, file: File): Promise<boolean> {
  try {
    if (ticket.kind === 'put') {
      const response = await fetch(ticket.url, {
        method: 'PUT',
        body: file,
        headers: { 'content-type': 'application/pdf' },
      });
      return response.ok;
    }
    await putBlob(ticket.pathname, file, {
      access: 'private',
      token: ticket.token,
      contentType: 'application/pdf',
    });
    return true;
  } catch {
    return false;
  }
}

function formatBytes(size: number): string {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

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
  prepare,
}: {
  action: (previous: CreateLibraryResult | null, form: FormData) => Promise<CreateLibraryResult>;
  prepare: (
    files: { name: string; size: number }[],
    batchId?: string,
  ) => Promise<PrepareUploadResult>;
}) {
  const { t } = useI18n();
  const n = t.dashboard.newLibrary;
  const w = n.wizard;
  const steps = [w.stepSource, w.stepDetails, w.stepVisibility, w.stepConfirm];

  const [step, setStep] = useState(0);
  const [source, setSource] = useState<SourceId | null>(null);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  /* The id follows the title until the operator edits it by hand; from then
     on it is theirs, so retyping the title cannot undo their choice. */
  const [slugEdited, setSlugEdited] = useState(false);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<PrepareUploadResult['error'] | 'transfer' | null>(
    null,
  );
  const picker = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(action, null);

  const namespace = source ? NEEDS_SLUG[source] : null;
  const isUpload = source === 'pdf';
  const uploaded = uploads.filter((upload) => upload.status === 'done');
  const uploadsSettled = uploads.length > 0 && uploads.every((upload) => upload.status !== 'uploading');
  const sourceComplete = isUpload ? uploadsSettled && uploaded.length > 0 : location.trim().length > 0;
  const detailsComplete =
    title.trim().length > 0 && sourceComplete && (namespace === null || slug.trim().length > 0);

  async function pickFiles(list: FileList | null) {
    const files = Array.from(list ?? []).filter(
      (file) => /\.pdf$/i.test(file.name) || file.type === 'application/pdf',
    );
    if (picker.current) picker.current.value = '';
    if (files.length === 0) return;
    setUploadError(null);
    if (uploads.length + files.length > UPLOAD_LIMITS.maxFiles) {
      setUploadError('invalid');
      return;
    }
    if (files.some((file) => file.size > UPLOAD_LIMITS.maxFileBytes)) {
      setUploadError('too_large');
      return;
    }

    const prepared = await prepare(
      files.map((file) => ({ name: file.name, size: file.size })),
      batchId ?? undefined,
    );
    if (!prepared.ok || !prepared.files || !prepared.batchId) {
      setUploadError(prepared.error ?? 'unavailable');
      return;
    }
    setBatchId(prepared.batchId);
    const slots = prepared.files;
    setUploads((current) => [
      ...current,
      ...slots.map((slot) => ({ id: slot.id, name: slot.name, size: slot.size, status: 'uploading' as const })),
    ]);

    await Promise.all(
      slots.map(async (slot, index) => {
        const file = files[index];
        const ok = file ? await redeem(slot.ticket, file) : false;
        setUploads((current) =>
          current.map((upload) =>
            upload.id === slot.id ? { ...upload, status: ok ? 'done' : 'failed' } : upload,
          ),
        );
        if (!ok) setUploadError('transfer');
      }),
    );
  }

  const manifest =
    isUpload && batchId
      ? JSON.stringify({
          batchId,
          files: uploaded.map(({ id, name, size }) => ({ id, name, size })),
        })
      : '';
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
        <input type="hidden" name="uploads" value={manifest} />
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
                  onChange={(event) => {
                    setTitle(event.target.value);
                    if (!slugEdited) setSlug(slugFromTitle(event.target.value));
                  }}
                  maxLength={120}
                  className={FIELD}
                />
              </Field>
              {isUpload ? (
                /* Not a `Field`: that is a <label>, and a click anywhere in a
                   label -- the remove button included -- activates the file
                   input nested in it and opens the picker. */
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold tracking-[-0.023em] text-steel">
                    {w.filesLabel}
                  </span>
                  <input
                    ref={picker}
                    type="file"
                    accept="application/pdf,.pdf"
                    multiple
                    hidden
                    onChange={(event) => void pickFiles(event.target.files)}
                  />
                  <div className="flex flex-col gap-1.5 rounded-[7px] border-2 border-dashed border-line bg-card p-2.5">
                    {uploads.map((upload) => (
                      <div
                        key={upload.id}
                        className="flex items-center gap-2 rounded-[6px] bg-subtle px-2.5 py-1.5 text-[12px] tracking-[-0.023em]"
                      >
                        {upload.status === 'uploading' ? (
                          <SpinnerIcon size={14} />
                        ) : (
                          <FileTextIcon size={14} />
                        )}
                        <span className="min-w-0 flex-1 truncate text-ink">{upload.name}</span>
                        <span className="shrink-0 text-muted">
                          {upload.status === 'failed' ? w.fileFailed : formatBytes(upload.size)}
                        </span>
                        <button
                          type="button"
                          aria-label={w.fileRemove}
                          disabled={upload.status === 'uploading'}
                          onClick={() =>
                            setUploads((current) => current.filter((entry) => entry.id !== upload.id))
                          }
                          className="shrink-0 text-muted hover:text-ink disabled:opacity-40"
                        >
                          <XIcon size={14} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => picker.current?.click()}
                      disabled={uploads.length >= UPLOAD_LIMITS.maxFiles}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[6px] text-[12px] text-steel transition-colors hover:bg-subtle disabled:opacity-40"
                    >
                      <UploadIcon size={14} />
                      {uploads.length === 0 ? w.filesPick : w.filesPickMore}
                    </button>
                  </div>
                  {uploadError ? (
                    <span className="text-[11px] tracking-[-0.023em] text-rose">
                      {uploadError === 'too_large'
                        ? fill(w.errorFileTooLarge, { size: formatBytes(UPLOAD_LIMITS.maxFileBytes) })
                        : uploadError === 'invalid'
                          ? fill(w.errorFileCount, { max: String(UPLOAD_LIMITS.maxFiles) })
                          : uploadError === 'access_denied'
                            ? w.errorUploadDenied
                            : uploadError === 'transfer'
                              ? w.errorUploadFailed
                              : w.errorUploadUnavailable}
                    </span>
                  ) : null}
                  <span className="text-[10px] tracking-[-0.023em] text-muted">
                    {fill(w.filesHint, {
                      max: String(UPLOAD_LIMITS.maxFiles),
                      size: formatBytes(UPLOAD_LIMITS.maxFileBytes),
                    })}
                  </span>
                </div>
              ) : (
                <Field label={w.locationLabel} hint={w.locations[source]}>
                  <input
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    className={FIELD}
                  />
                </Field>
              )}
              {namespace ? (
                <Field label={w.slugLabel} hint={fill(w.slugHint, { prefix: `/${namespace}/` })}>
                  {/* The prefix sits inside the field so the id reads the way
                      the catalogue shows it, /websites/ethereum/whitepaper; the
                      operator types only the slug, nested with / if they like. */}
                  <span className="flex h-9 w-full items-center rounded-[7px] border-2 border-line bg-card pl-2.5 focus-within:border-brand">
                    <span className="shrink-0 select-none text-[12px] tracking-[-0.023em] text-muted">
                      /{namespace}/
                    </span>
                    <input
                      value={slug}
                      onChange={(event) => {
                        const next = slugWithoutPrefix(event.target.value, `/${namespace}/`);
                        setSlug(next);
                        setSlugEdited(next.trim().length > 0);
                      }}
                      maxLength={200 - namespace.length - 2}
                      placeholder={w.slugPlaceholder}
                      className="h-full min-w-0 flex-1 bg-transparent pr-2.5 text-[12px] tracking-[-0.023em] text-ink placeholder:text-muted/70 focus:outline-none"
                    />
                  </span>
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
                isUpload
                  ? [w.filesLabel, fill(w.filesCount, { n: String(uploaded.length) })]
                  : [w.locationLabel, location],
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
