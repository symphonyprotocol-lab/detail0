'use client';

import { put as putBlob } from '@vercel/blob/client';
import { useCallback, useRef, useState } from 'react';
import { FileTextIcon, SpinnerIcon, UploadIcon, XIcon } from '@/components/ui/icons';
import type { PrepareUploadResult } from '@/app/dashboard/libraries/new/actions';
import type { UploadTicket } from '@/lib/infrastructure/objects/store';
import { UPLOAD_LIMITS } from '@/lib/domain/library';
import { useI18n } from '@/lib/i18n/client';
import { fill } from '@/lib/i18n/format';

/**
 * Picking PDFs and getting them into the store, shared by the import wizard
 * and the library files page.
 *
 * The browser redeems the ticket the prepare action hands back -- a presigned
 * PUT for an S3 bucket, a scoped client token for Vercel Blob -- so a file
 * never goes through a server action; what the form finally posts is the
 * manifest of ids, names and sizes, which the use case confirms against the
 * store before a row changes.
 */

export interface Upload {
  id: string;
  name: string;
  size: number;
  status: 'uploading' | 'done' | 'failed';
}

export type PrepareUploads = (
  files: { name: string; size: number }[],
  batchId?: string,
) => Promise<PrepareUploadResult>;

export type UploadError = PrepareUploadResult['error'] | 'transfer';

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

export function formatBytes(size: number): string {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

/**
 * The upload state behind one batch. `room` is how many more files may be
 * added -- the wizard's whole allowance, or what a library has left.
 */
export function usePdfUploads(prepare: PrepareUploads, room: number = UPLOAD_LIMITS.maxFiles) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [error, setError] = useState<UploadError | null>(null);

  const uploaded = uploads.filter((upload) => upload.status === 'done');
  const settled = uploads.every((upload) => upload.status !== 'uploading');

  async function pick(list: FileList | null) {
    const files = Array.from(list ?? []).filter(
      (file) => /\.pdf$/i.test(file.name) || file.type === 'application/pdf',
    );
    if (files.length === 0) return;
    setError(null);
    if (uploads.length + files.length > room) {
      setError('invalid');
      return;
    }
    if (files.some((file) => file.size > UPLOAD_LIMITS.maxFileBytes)) {
      setError('too_large');
      return;
    }

    const prepared = await prepare(
      files.map((file) => ({ name: file.name, size: file.size })),
      batchId ?? undefined,
    );
    if (!prepared.ok || !prepared.files || !prepared.batchId) {
      setError(prepared.error ?? 'unavailable');
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
        if (!ok) setError('transfer');
      }),
    );
  }

  const remove = useCallback((id: string) => {
    setUploads((current) => current.filter((entry) => entry.id !== id));
  }, []);

  /* Stable, so a caller may put it in an effect's dependencies. */
  const reset = useCallback(() => {
    setUploads([]);
    setBatchId(null);
    setError(null);
  }, []);

  /** What the form posts: only the files that landed. Empty until one has. */
  const manifest =
    batchId && uploaded.length > 0
      ? JSON.stringify({
          batchId,
          files: uploaded.map(({ id, name, size }) => ({ id, name, size })),
        })
      : '';

  return { uploads, uploaded, settled, error, manifest, pick, remove, reset };
}

/**
 * The picker and the list of files on their way. Not a `<label>`: a click
 * anywhere in a label -- the remove button included -- activates the file
 * input nested in it and opens the picker.
 */
export function PdfUploadField({
  state,
  label,
  hint,
  room = UPLOAD_LIMITS.maxFiles,
}: {
  state: ReturnType<typeof usePdfUploads>;
  label: string;
  hint: string;
  room?: number;
}) {
  const { t } = useI18n();
  const w = t.dashboard.newLibrary.wizard;
  const picker = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold tracking-[-0.023em] text-steel">{label}</span>
      <input
        ref={picker}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(event) => {
          const files = event.target.files;
          if (picker.current) picker.current.value = '';
          void state.pick(files);
        }}
      />
      <div className="flex flex-col gap-1.5 rounded-[7px] border-2 border-dashed border-line bg-card p-2.5">
        {state.uploads.map((upload) => (
          <div
            key={upload.id}
            className="flex items-center gap-2 rounded-[6px] bg-subtle px-2.5 py-1.5 text-[12px] tracking-[-0.023em]"
          >
            {upload.status === 'uploading' ? <SpinnerIcon size={14} /> : <FileTextIcon size={14} />}
            <span className="min-w-0 flex-1 truncate text-ink">{upload.name}</span>
            <span className="shrink-0 text-muted">
              {upload.status === 'failed' ? w.fileFailed : formatBytes(upload.size)}
            </span>
            <button
              type="button"
              aria-label={w.fileRemove}
              disabled={upload.status === 'uploading'}
              onClick={() => state.remove(upload.id)}
              className="shrink-0 text-muted hover:text-ink disabled:opacity-40"
            >
              <XIcon size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => picker.current?.click()}
          disabled={state.uploads.length >= room}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[6px] text-[12px] text-steel transition-colors hover:bg-subtle disabled:opacity-40"
        >
          <UploadIcon size={14} />
          {state.uploads.length === 0 ? w.filesPick : w.filesPickMore}
        </button>
      </div>
      {state.error ? (
        <span className="text-[11px] tracking-[-0.023em] text-rose">
          {state.error === 'too_large'
            ? fill(w.errorFileTooLarge, { size: formatBytes(UPLOAD_LIMITS.maxFileBytes) })
            : state.error === 'invalid'
              ? fill(w.errorFileCount, { max: String(UPLOAD_LIMITS.maxFiles) })
              : state.error === 'access_denied'
                ? w.errorUploadDenied
                : state.error === 'transfer'
                  ? w.errorUploadFailed
                  : w.errorUploadUnavailable}
        </span>
      ) : null}
      <span className="text-[10px] tracking-[-0.023em] text-muted">{hint}</span>
    </div>
  );
}
