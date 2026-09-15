'use client';

import Link from 'next/link';
import { useActionState, useId, useState } from 'react';
import { ConsoleDialog } from '@/components/admin/console-dialog';
import { submitOn } from '@/components/admin/platform-library-shared';
import { PANEL, StatusLabel, type StatusTone } from '@/components/dashboard/ui';
import { CircleCheckIcon, CircleXIcon, SpinnerIcon } from '@/components/ui/icons';
import type { ClaimFailureReason } from '@/contracts/errors';
import { isReleasableOwnership } from '@/lib/domain/claim';
import { useI18n } from '@/lib/i18n/client';
import { fill } from '@/lib/i18n/format';
import type { ReleaseOwnershipActionResult } from '@/app/dashboard/libraries/actions';

export type ReleaseOwnershipAction = (
  previous: ReleaseOwnershipActionResult | null,
  form: FormData,
) => Promise<ReleaseOwnershipActionResult>;

/**
 * One public library's ownership, as the workspace sees it. The five kinds are
 * `OwnershipView`'s, carried across the server boundary with the dates already
 * formatted -- the panel renders, it does not derive.
 */
export interface LibraryOwnershipRow {
  id: string;
  publicId: string;
  title: string;
  kind: 'claimed' | 'owned' | 'pending' | 'failed' | 'unclaimed';
  /** Formatted date of the verified claim, when there was one. */
  claimedAt: string | null;
  /** Whole days left on an open challenge. */
  remainingDays: number | null;
  failureReason: ClaimFailureReason | null;
  claimId: string | null;
  /** Pending on a library another workspace owns: an administrator decides it. */
  disputed: boolean;
}

/**
 * Ownership of the workspace's public libraries -- requirement.md 5.2.
 *
 * A separate panel rather than a column on the library table, because the four
 * states this reports are not a property of the row next to `chunks`: three of
 * them carry something to do (finish a challenge, read a failure code, start a
 * claim) and a cell has no room for it.
 *
 * Only public libraries appear. A private library is nobody's to claim --
 * 7.3.1 puts claims on the public catalogue -- and listing them would offer a
 * claim entry that leads nowhere.
 *
 * `releaseAction` is passed only for a member who may release (owners and
 * admins, requirement.md 3.3). The use case re-checks the role: the prop
 * decides what is drawn, not what is allowed.
 *
 * Release is offered on a `claimed` row only. `owned` is a library this
 * workspace created, where being the owner is not something a claim conferred
 * and so not something releasing can undo -- 7.3.5 is about a claimed library
 * going back to the unowned pool. `releaseOwnership` refuses the rest
 * regardless; this keeps the screen from offering it.
 */
export function LibraryOwnership({
  rows,
  releaseAction,
}: {
  rows: LibraryOwnershipRow[];
  releaseAction?: ReleaseOwnershipAction;
}) {
  const { t } = useI18n();
  const o = t.dashboard.libraries.ownership;

  return (
    <section className={`${PANEL} overflow-hidden`}>
      <div className="flex flex-col gap-1 border-b border-line px-[18px] py-3.5">
        <h2 className="text-[14px] font-medium text-ink">{o.panelTitle}</h2>
        <p className="text-[11.5px] leading-[1.55] text-muted">
          {o.panelSubtitle}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="px-[18px] py-9 text-center text-[12.5px] text-muted">{o.panelEmpty}</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5 border-t border-line px-[18px] py-[15px] first:border-t-0"
            >
              <span className="flex min-w-[200px] flex-1 flex-col gap-1">
                <span className="truncate text-[13px] text-ink">
                  {row.title}
                </span>
                <span className="truncate font-mono text-[10.5px] text-muted">
                  {row.publicId}
                </span>
                <Detail row={row} />
              </span>

              <span className="flex shrink-0 flex-wrap items-center gap-2">
                <StateBadge row={row} />
                <Entry row={row} />
                {releaseAction && isReleasableOwnership(row.kind) ? (
                  <ReleaseControl action={releaseAction} target={row} />
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The same four-way marker the library table uses, so one page speaks once. */
const OWNERSHIP_TONE: Record<LibraryOwnershipRow['kind'], StatusTone> = {
  claimed: 'live',
  owned: 'live',
  pending: 'pending',
  failed: 'blocked',
  unclaimed: 'exempt',
};

function StateBadge({ row }: { row: LibraryOwnershipRow }) {
  const { t } = useI18n();
  const o = t.dashboard.libraries.ownership;
  const label =
    row.kind === 'claimed'
      ? o.claimed
      : row.kind === 'owned'
        ? o.owned
        : row.kind === 'pending'
          ? row.disputed
            ? o.disputed
            : o.pending
          : row.kind === 'failed'
            ? o.failed
            : o.unclaimed;
  return <StatusLabel tone={OWNERSHIP_TONE[row.kind]}>{label}</StatusLabel>;
}

/**
 * The line under the id: when a claim went through, how long an open one has
 * left, or why the last one failed and what to do about it.
 *
 * The failure carries the stable code beside its sentence. requirement.md
 * 7.3.8 makes the code the contract -- it is what a support conversation can
 * quote and what the API returns -- and the sentence is the actionable half.
 */
function Detail({ row }: { row: LibraryOwnershipRow }) {
  const { t } = useI18n();
  const o = t.dashboard.libraries.ownership;

  if (row.kind === 'claimed' && row.claimedAt) {
    return (
      <span className="text-[11px] text-muted">
        {fill(o.claimedOn, { when: row.claimedAt })}
      </span>
    );
  }
  if (row.kind === 'pending' && row.remainingDays !== null) {
    return (
      <span className="text-[11px] text-muted">
        {fill(o.pendingRemaining, { days: row.remainingDays })}
      </span>
    );
  }
  if (row.kind === 'failed' && row.failureReason) {
    const reason = t.claim.reasons[row.failureReason];
    return (
      <span className="flex flex-col gap-0.5">
        <span className="font-mono text-[10.5px] text-muted">
          {fill(t.claim.failureCode, { code: row.failureReason })}
        </span>
        <span className="max-w-[62ch] text-[11px] leading-[1.55] text-steel">
          {reason.label} — {reason.next}
        </span>
      </span>
    );
  }
  return null;
}

const LINK =
  'inline-flex h-8 shrink-0 items-center rounded-md border border-line bg-card px-3 text-[11.5px] font-medium text-ink transition-colors hover:bg-subtle';

/** Where the row goes next: into its open claim, or into a new one. */
function Entry({ row }: { row: LibraryOwnershipRow }) {
  const { t } = useI18n();
  const o = t.dashboard.libraries.ownership;

  if (row.kind === 'pending' && row.claimId) {
    return (
      <Link href={`/libraries/claim?claim=${encodeURIComponent(row.claimId)}`} className={LINK}>
        {o.view}
      </Link>
    );
  }
  if (row.kind === 'failed' || row.kind === 'unclaimed') {
    return (
      <Link href={`/libraries/claim?library=${encodeURIComponent(row.publicId)}`} className={LINK}>
        {row.kind === 'failed' ? o.retry : o.claim}
      </Link>
    );
  }
  return null;
}

/* ----------------------------------------------------------------- release */

const BUTTON =
  'inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-[12px] font-medium transition-colors disabled:opacity-60';

/**
 * Give the library up -- requirement.md 7.3.5.
 *
 * Confirmed by typing the Library ID, like deletion, and for the same reason:
 * releasing cannot be undone from this side. Once the library is unowned,
 * getting it back means proving control of the source again, and somebody
 * else may have claimed it first.
 */
function ReleaseControl({
  action,
  target,
}: {
  action: ReleaseOwnershipAction;
  target: LibraryOwnershipRow;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 shrink-0 items-center rounded-md border border-line bg-card px-3 text-[11.5px] font-medium text-muted transition-colors hover:bg-subtle hover:text-rose"
      >
        {t.dashboard.libraries.ownership.release}
      </button>

      {open ? (
        <ReleaseDialog
          key={attempt}
          action={action}
          target={target}
          onClose={() => {
            setOpen(false);
            setAttempt((value) => value + 1);
          }}
        />
      ) : null}
    </>
  );
}

function ReleaseDialog({
  action,
  target,
  onClose,
}: {
  action: ReleaseOwnershipAction;
  target: LibraryOwnershipRow;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const r = t.dashboard.libraries.ownership.releaseDialog;
  const [state, submit, pending] = useActionState(action, null);
  const [typed, setTyped] = useState('');
  const formId = useId();
  const done = state?.ok === true;
  const confirmed = typed.trim() === target.publicId;

  return (
    <ConsoleDialog
      onClose={onClose}
      busy={pending}
      closeLabel={r.close}
      title={r.title}
      description={done ? undefined : r.description}
      footer={(dismissBlocked) =>
        done ? (
          <button
            type="button"
            onClick={onClose}
            className={`${BUTTON} border border-line bg-card text-ink hover:bg-subtle`}
          >
            {r.close}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onClose}
              disabled={dismissBlocked}
              className={`${BUTTON} border border-line bg-card text-ink hover:bg-subtle`}
            >
              {r.cancel}
            </button>
            <button
              type="submit"
              form={formId}
              disabled={pending || !confirmed}
              className={`${BUTTON} bg-rose text-white hover:bg-rose/90`}
            >
              {pending ? (
                <>
                  <SpinnerIcon size={14} className="motion-safe:animate-spin" />
                  {r.pending}
                </>
              ) : (
                r.submit
              )}
            </button>
          </>
        )
      }
    >
      {done ? (
        <p className="flex items-start gap-2 text-[12px] leading-[1.6] text-pubink">
          <CircleCheckIcon size={15} className="mt-px shrink-0" />
          {fill(r.done, { publicId: state?.publicId ?? target.publicId })}
        </p>
      ) : (
        <form id={formId} onSubmit={submitOn(submit)} className="flex flex-col gap-3">
          <input type="hidden" name="libraryId" value={target.id} />

          {state?.error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md bg-errsoft p-2.5 text-[11px] leading-[1.5] text-err"
            >
              <CircleXIcon size={15} className="mt-px shrink-0" />
              {r.errors[state.error]}
            </p>
          ) : null}

          <div className="flex min-w-0 flex-col gap-[3px] rounded-md border border-line bg-subtle px-2.5 py-2.5">
            <span className="truncate text-[12px] font-medium text-ink">
              {target.title}
            </span>
            <span className="truncate text-[11px] text-muted">
              {target.publicId}
            </span>
          </div>

          <ul className="flex flex-col gap-1.5">
            {r.consequences.map((line) => (
              <li
                key={line}
                className="flex items-start gap-1.5 text-[11px] leading-[1.55] text-steel"
              >
                <span aria-hidden className="mt-px text-rose">
                  •
                </span>
                {line}
              </li>
            ))}
          </ul>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-steel">
              {r.confirmLabel}
            </span>
            <input
              name="confirm"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              data-dialog-autofocus
              autoComplete="off"
              spellCheck={false}
              placeholder={target.publicId}
              aria-label={r.confirmLabel}
              className="h-9 w-full rounded-md border border-line bg-card px-2.5 font-mono text-[12px] text-ink placeholder:text-faint focus:border-rose focus:outline-none"
            />
            <span className="text-[11px] leading-[1.45] text-faint">
              {fill(r.confirmHint, { publicId: target.publicId })}
            </span>
          </label>
        </form>
      )}
    </ConsoleDialog>
  );
}
