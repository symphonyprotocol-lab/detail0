'use client';

import type { ReactNode } from 'react';

/**
 * The console's configuration form vocabulary, shared by every screen that
 * saves numbers the application bounds (`llm-config-form`,
 * `retrieval-config-form`). One definition so the field the browser accepts
 * and the value the server accepts cannot drift between screens.
 */

export const FIELD =
  'h-9 w-full rounded-[7px] border-2 border-line bg-card px-2.5 text-[12px] tracking-[-0.023em] text-ink placeholder:text-faint focus:border-brand focus:outline-none';

/** The accepted span, shown beside the field rather than only after a refusal. */
export function range({ min, max }: { min: number; max?: number }): string {
  const from = min.toLocaleString('en-US');
  return max === undefined ? `≥ ${from}` : `${from} – ${max.toLocaleString('en-US')}`;
}

/**
 * A whole number, held to the same span the application enforces.
 *
 * The bounds come from the domain rather than being retyped here, so a
 * refusal -- which costs a round trip plus a re-typed audit reason -- is the
 * exception rather than the way an operator discovers the limit.
 */
export function Bounded({
  name,
  value,
  range: { min, max },
}: {
  name: string;
  value: number;
  /** `max` absent means the application enforces no ceiling either. */
  range: { min: number; max?: number };
}) {
  return (
    <input
      name={name}
      type="number"
      min={min}
      max={max}
      step={1}
      defaultValue={value}
      className={FIELD}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-2">
        <span className="text-[11px] font-semibold tracking-[-0.023em] text-steel">{label}</span>
        {hint ? <span className="font-mono text-[10.5px] text-faint">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
