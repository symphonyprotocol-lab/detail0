'use client';

import { startTransition, useActionState, useId, useState } from 'react';
import { ConsoleDialog } from '@/components/admin/console-dialog';
import { ConsoleButton, Pill } from '@/components/admin/ui';
import { CircleCheckIcon, CircleXIcon, PlusIcon, SpinnerIcon } from '@/components/ui/icons';
import { Field, FIELD, type PlatformAction as Action } from './platform-library-shared';
import {
  namespaceFor,
  PLATFORM_SOURCE_TYPES,
  REFRESH_POLICIES,
  type PlatformSourceType,
} from '@/lib/domain/library';
import { useI18n } from '@/lib/i18n/client';
import { fill } from '@/lib/i18n/format';

/**
 * "Create platform library" -- design source frame `新建平台知识库`.
 *
 * The form is the create use case's input, field for field, and nothing else:
 * visibility, owner and lifecycle are not offered because they are not
 * decisions. A platform library is public by definition, has no owner
 * workspace by rule (architecture.md 5.4), and starts as a draft because
 * nothing has been fetched yet.
 */
export function CreatePlatformLibraryControl({ action }: { action: Action }) {
  const { t } = useI18n();
  const p = t.admin.platformLibraries;
  const [open, setOpen] = useState(false);
  /*
   * Bumped on close so the body is a fresh component next time it opens:
   * `useActionState` has no reset, and the previous attempt's refusal -- or its
   * success panel -- would otherwise still be on screen over an untouched form.
   */
  const [attempt, setAttempt] = useState(0);

  return (
    <>
      <ConsoleButton variant="primary" className="h-10 w-full" onClick={() => setOpen(true)}>
        <PlusIcon size={15} />
        {p.create}
      </ConsoleButton>

      {open ? (
        <CreateDialog
          key={attempt}
          action={action}
          onClose={() => {
            setOpen(false);
            setAttempt((value) => value + 1);
          }}
        />
      ) : null}
    </>
  );
}

function CreateDialog({ action, onClose }: { action: Action; onClose: () => void }) {
  const { t } = useI18n();
  const p = t.admin.platformLibraries;
  const f = p.form;
  const [state, submit, pending] = useActionState(action, null);
  const formId = useId();
  const done = state?.ok === true;

  /*
   * The source type is the only field the rest of the form depends on: it
   * decides which Library ID namespace is legal and what a location may look
   * like. Held in state so the hint under the id field tells the operator the
   * rule *before* the server refuses them for breaking it.
   */
  const [sourceType, setSourceType] = useState<PlatformSourceType>('website');

  return (
    <ConsoleDialog
      onClose={onClose}
      busy={pending}
      width="form"
      closeLabel={f.close}
      title={done ? f.doneTitle : f.title}
      description={done ? undefined : f.description}
      footer={(dismissBlocked) =>
        done ? (
          <ConsoleButton onClick={onClose}>{f.close}</ConsoleButton>
        ) : (
          <>
            {/* Follows the dialog's own guard rather than `pending`, so a
                request that never settles cannot leave this disabled forever. */}
            <ConsoleButton onClick={onClose} disabled={dismissBlocked}>
              {f.cancel}
            </ConsoleButton>
            <ConsoleButton variant="primary" type="submit" form={formId} disabled={pending}>
              {pending ? (
                <>
                  <SpinnerIcon size={14} className="motion-safe:animate-spin" />
                  {f.pending}
                </>
              ) : (
                f.submit
              )}
            </ConsoleButton>
          </>
        )
      }
    >
      {done ? (
        <p className="flex items-start gap-2 text-[12px] leading-[1.6] tracking-[-0.023em] text-pubink">
          <CircleCheckIcon size={15} className="mt-px shrink-0" />
          {fill(f.doneBody, { publicId: state?.publicId ?? '' })}
        </p>
      ) : (
        /*
         * Submitted through `onSubmit` rather than `action={submit}`, and the
         * difference matters here more than anywhere else in the console.
         * React resets an uncontrolled form after a function action settles,
         * so on a refusal this eight-field form would come back blank -- an
         * operator who mistyped one character would retype everything -- and
         * the reset would also put the source-type `<select>` back to its
         * first option while the React state behind the namespace hint stayed
         * where it was, leaving the control and its hint contradicting each
         * other. The other console dialogs escape both because every field
         * they hold is prefilled, so a reset restores a value rather than
         * clearing one.
         */
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            startTransition(() => submit(data));
          }}
          className="flex flex-col gap-3"
        >
          {state?.error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-[8px] bg-errsoft p-2.5 text-[11px] leading-[1.5] text-err"
            >
              <CircleXIcon size={15} className="mt-px shrink-0" />
              {p.errors[state.error]}
            </p>
          ) : null}

          <div className="flex items-center gap-2.5 rounded-[8px] border-2 border-line bg-subtle px-2.5 py-2.5">
            <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="text-[11px] font-semibold tracking-[-0.023em] text-steel">
                {f.noticeTitle}
              </span>
              <span className="text-[11px] leading-[1.5] tracking-[-0.023em] text-muted">
                {f.noticeBody}
              </span>
            </span>
            <Pill tone="brand">{f.publicPill}</Pill>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={f.fieldTitle}>
              <input
                name="title"
                required
                maxLength={120}
                data-dialog-autofocus
                placeholder={f.placeholderTitle}
                className={FIELD}
              />
            </Field>
            <Field label={f.fieldPublicId} hint={fill(f.hintPublicId, { namespace: namespaceFor(sourceType) })}>
              <input
                name="publicId"
                required
                maxLength={200}
                placeholder={f.placeholderPublicId}
                className={FIELD}
              />
            </Field>

            <Field label={f.fieldSource}>
              <select
                name="sourceType"
                value={sourceType}
                onChange={(event) => setSourceType(event.target.value as PlatformSourceType)}
                className={FIELD}
              >
                {PLATFORM_SOURCE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {p.sourceTypes[type]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={f.fieldLocation} hint={f.hintLocation}>
              <input
                name="location"
                required
                maxLength={500}
                placeholder={f.placeholderLocation}
                className={FIELD}
              />
            </Field>

            <Field label={f.fieldTag}>
              <input
                name="domainTag"
                maxLength={40}
                placeholder={f.placeholderTag}
                className={FIELD}
              />
            </Field>
            <Field label={f.fieldLanguage}>
              <input
                name="language"
                maxLength={40}
                placeholder={f.placeholderLanguage}
                className={FIELD}
              />
            </Field>
          </div>

          <Field label={f.fieldDescription}>
            <textarea
              name="description"
              maxLength={400}
              rows={3}
              placeholder={f.placeholderDescription}
              className={`${FIELD} h-auto py-2 leading-[1.55]`}
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={f.fieldRefresh}>
              <select name="refreshPolicy" defaultValue="daily" className={FIELD}>
                {REFRESH_POLICIES.map((policy) => (
                  <option key={policy} value={policy}>
                    {p.refreshPolicies[policy]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={f.reason}>
              <input
                name="reason"
                required
                maxLength={200}
                placeholder={f.reasonPlaceholder}
                className={FIELD}
              />
            </Field>
          </div>

          <p className="text-[11px] leading-[1.55] tracking-[-0.023em] text-muted">{f.note}</p>
        </form>
      )}
    </ConsoleDialog>
  );
}
