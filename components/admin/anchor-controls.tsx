'use client';

import { useActionState, useState } from 'react';
import { ConsoleDialog } from '@/components/admin/console-dialog';
import { ConsoleButton } from '@/components/admin/ui';
import { ReasonField, submitOn } from '@/components/admin/platform-library-shared';
import { CircleXIcon, SpinnerIcon } from '@/components/ui/icons';
import { useI18n } from '@/lib/i18n/client';
import type { AnchorAdminActionResult } from '@/app/admin/(console)/anchors/actions';

type Action = (
  state: AnchorAdminActionResult | null,
  form: FormData,
) => Promise<AnchorAdminActionResult>;

/**
 * Releasing a failed batch, as a confirmation with a required reason.
 *
 * Not a one-click button, for the reason every other console mutation has a
 * dialog: requirement.md 5.3 records the operator, the target, the reason and
 * the outcome, and there is nothing to record if nobody was asked.
 */
function Refusal({ state }: { state: AnchorAdminActionResult | null }) {
  const { t } = useI18n();
  if (!state || state.ok || !state.error) return null;
  return (
    <p className="flex items-center gap-1.5 text-[11.5px] text-err">
      <CircleXIcon size={13} />
      {t.admin.anchors.controls.errors[state.error]}
    </p>
  );
}

export function AnchorReleaseControl({ action, batchId }: { action: Action; batchId: string }) {
  const { t } = useI18n();
  const c = t.admin.anchors.controls;
  const [open, setOpen] = useState(false);
  const [state, dispatch, pending] = useActionState(action, null);

  if (state?.ok && open) setOpen(false);

  return (
    <>
      <ConsoleButton type="button" onClick={() => setOpen(true)}>
        {c.release}
      </ConsoleButton>
      {open ? (
        <ConsoleDialog
          onClose={() => setOpen(false)}
          title={c.releaseTitle}
          description={c.releaseBody}
          closeLabel={c.cancel}
          busy={pending}
        >
          <form onSubmit={submitOn(dispatch)} className="flex flex-col gap-3">
            <input type="hidden" name="batchId" value={batchId} />
            <ReasonField label={c.reason} placeholder={c.reasonPlaceholder} ariaLabel={c.reason} />
            <Refusal state={state} />
            <ConsoleButton type="submit" variant="primary" disabled={pending}>
              {pending ? <SpinnerIcon size={14} /> : null}
              {c.release}
            </ConsoleButton>
          </form>
        </ConsoleDialog>
      ) : null}
    </>
  );
}
