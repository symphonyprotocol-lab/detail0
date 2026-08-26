'use client';

import { useActionState, useState, type ReactNode } from 'react';
import { ConsoleButton, Panel } from '@/components/admin/ui';
import { CopyButton } from '@/components/dashboard/copy-button';
import { CircleCheckIcon, CircleXIcon, PlusIcon, SpinnerIcon } from '@/components/ui/icons';
import type { AdminRoleId } from '@/lib/domain/admin';
import { useI18n } from '@/lib/i18n/client';
import { fill } from '@/lib/i18n/format';
import type { ActionResult } from '@/app/admin/(console)/administrators/actions';

/**
 * Invitation form -- the "add administrator" affordance of design frame `RubCg`.
 *
 * The console never sets someone else's password: an invitation creates the
 * account and hands back a one-time enrolment link, and the invitee chooses
 * their own credential and binds their own second factor. That is also what
 * makes MFA enforceable -- the account cannot reach `active` without one.
 *
 * The link is shown once because only its digest is stored; there is no way to
 * display it again, and saying so plainly is better than a copy affordance that
 * quietly stops working.
 */
export function InviteAdministrator(props: {
  action: (previous: ActionResult | null, form: FormData) => Promise<ActionResult>;
  inviteTtlDays: number;
  roles: { id: AdminRoleId; label: string }[];
}) {
  const { t } = useI18n();
  const a = t.admin.administrators;
  const [open, setOpen] = useState(false);
  /*
   * Closing bumps the key so the panel is a new component next time it opens.
   * `useActionState` has no reset, so without this the previous invitation's
   * one-time link is what renders on reopen -- and a second invitation becomes
   * impossible without reloading the page.
   */
  const [attempt, setAttempt] = useState(0);

  if (!open) {
    return (
      <ConsoleButton variant="primary" onClick={() => setOpen(true)}>
        <PlusIcon size={14} />
        {a.invite}
      </ConsoleButton>
    );
  }

  return (
    <InvitePanel
      key={attempt}
      {...props}
      onClose={() => {
        setOpen(false);
        setAttempt((value) => value + 1);
      }}
    />
  );
}

function InvitePanel({
  action,
  inviteTtlDays,
  roles,
  onClose,
}: {
  action: (previous: ActionResult | null, form: FormData) => Promise<ActionResult>;
  inviteTtlDays: number;
  roles: { id: AdminRoleId; label: string }[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const a = t.admin.administrators;
  const [state, submit, pending] = useActionState(action, null);

  if (state?.ok && state.enrolmentPath) {
    const link = `${window.location.origin}${state.enrolmentPath}`;
    return (
      <Panel className="w-full p-[19px]">
        <p className="flex items-start gap-2 text-[12px] leading-[1.6] tracking-[-0.023em] text-pubink">
          <CircleCheckIcon size={15} className="mt-px shrink-0" />
          {fill(a.inviteDone, { days: inviteTtlDays })}
        </p>
        <div className="mt-3 flex items-center gap-2 rounded-[8px] border-2 border-line bg-subtle px-3 py-2">
          <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-steel">{link}</code>
          <CopyButton value={link} label={a.inviteCopy} />
        </div>
        <div className="mt-3.5 flex gap-2">
          <ConsoleButton onClick={onClose}>{a.close}</ConsoleButton>
        </div>
      </Panel>
    );
  }

  return (
    <Panel className="w-full p-[19px]">
      <form action={submit} className="flex flex-col gap-3.5">
        <div>
          <h3 className="text-[14px] tracking-[-0.025em] text-ink">{a.inviteTitle}</h3>
          <p className="mt-1 text-[11px] leading-[1.5] tracking-[-0.023em] text-muted">
            {a.inviteDescription}
          </p>
        </div>

        {state?.error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-[8px] bg-errsoft p-2.5 text-[11px] leading-[1.5] text-err"
          >
            <CircleXIcon size={15} className="mt-px shrink-0" />
            {a.errors[state.error]}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={a.inviteEmail}>
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="off"
              className={FIELD}
            />
          </Field>
          <Field label={a.inviteUsername}>
            <input name="username" type="text" required maxLength={80} className={FIELD} />
          </Field>
          <Field label={a.inviteRole}>
            <select name="role" defaultValue="support" className={FIELD}>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex gap-2">
          <ConsoleButton variant="primary" type="submit">
            {pending ? (
              <>
                <SpinnerIcon size={14} className="motion-safe:animate-spin" />
                {a.invitePending}
              </>
            ) : (
              a.inviteSubmit
            )}
          </ConsoleButton>
          <ConsoleButton onClick={onClose}>{a.inviteCancel}</ConsoleButton>
        </div>
      </form>
    </Panel>
  );
}

const FIELD =
  'h-[37px] w-full rounded-[7px] border-2 border-line bg-card px-3 text-[12px] tracking-[-0.023em] text-ink focus:border-brand focus:outline-none';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold tracking-[-0.023em] text-steel">{label}</span>
      {children}
    </label>
  );
}
