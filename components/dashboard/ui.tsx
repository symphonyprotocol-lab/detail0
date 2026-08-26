import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowUpRightIcon } from '@/components/ui/icons';

/** Card chrome shared by every panel in the dashboard design frames. */
export const PANEL = 'rounded-xl border-2 border-line bg-card shadow-[0_4px_10px_rgba(45,45,83,0.06)]';

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`${PANEL} ${className}`}>{children}</section>;
}

/** Eyebrow + title + description, the page header every dashboard screen opens with. */
export function PageHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  /** Workspace name on the workspace screens, a section label under developer settings. */
  eyebrow: string;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-5">
      <div className="flex flex-col gap-[4.5px]">
        <p className="text-[11px] font-bold tracking-[0.05em] text-brand">{eyebrow}</p>
        <h1 className="text-[25px] leading-[1.5] font-[650] tracking-[-0.045em] text-ink">{title}</h1>
        <p className="text-[13px] leading-[1.5] tracking-[-0.023em] text-muted">{description}</p>
      </div>
      {action}
    </header>
  );
}

export function PanelHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-5">
      <div className="flex flex-col gap-[5px]">
        <h2 className="text-[16px] leading-[1.5] tracking-[-0.025em] text-ink">{title}</h2>
        {description ? (
          <p className="text-[13px] leading-[1.5] tracking-[-0.023em] text-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/** The 35px brand action the design puts in page and panel headers. */
export function ActionButton({
  href,
  children,
  variant = 'primary',
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'outline';
}) {
  const style =
    variant === 'primary'
      ? 'bg-brand text-white hover:bg-brand/90'
      : 'border-2 border-line bg-card text-ink hover:bg-subtle';
  return (
    <Link
      href={href}
      className={`inline-flex h-[35px] shrink-0 items-center gap-1.5 rounded-[7px] px-[13px] text-[12px] font-medium tracking-[-0.023em] transition-colors ${style}`}
    >
      {children}
    </Link>
  );
}

/** Small text link with a trailing arrow, used to close out cards and banners. */
export function ArrowLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-1.5 text-[11px] tracking-[-0.023em] text-brandink transition-colors hover:text-brand"
    >
      {children}
      <ArrowUpRightIcon size={13} />
    </Link>
  );
}

export function StatTile({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: string;
  label: string;
}) {
  return (
    <article className={`${PANEL} flex items-center gap-2.5 rounded-[9px] p-[15px]`}>
      <span className="text-brand">{icon}</span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[17px] leading-[1.4] font-semibold tracking-[-0.025em] text-ink">
          {value}
        </span>
        <span className="text-[11px] tracking-[-0.023em] text-muted">{label}</span>
      </span>
    </article>
  );
}

/**
 * Banner row: icon tile, headline, body and an optional link.
 *
 * `brand` is the tinted variant the design uses for rules the user must know
 * about; `plain` is the card-coloured one for supporting notes.
 */
export function Notice({
  icon,
  title,
  body,
  action,
  tone = 'plain',
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
  tone?: 'brand' | 'plain';
}) {
  return (
    <section
      className={`flex flex-wrap items-center gap-4 rounded-[10px] border-2 px-[19px] py-4 ${
        tone === 'brand' ? 'border-publine bg-[#ebf5f5]' : 'border-line bg-card'
      }`}
    >
      <IconTile tone="card">{icon}</IconTile>
      <div className="flex min-w-[220px] flex-1 flex-col gap-1">
        <p className="text-[13px] leading-[1.4] font-bold tracking-[-0.023em] text-ink">{title}</p>
        <p className="text-[11px] leading-[1.5] tracking-[-0.023em] text-muted">{body}</p>
      </div>
      {action}
    </section>
  );
}

/** 36px rounded icon tile that opens the design's tip and banner cards. */
export function IconTile({ children, tone = 'brand' }: { children: ReactNode; tone?: 'brand' | 'card' }) {
  return (
    <span
      className={`flex size-9 shrink-0 items-center justify-center rounded-[9px] text-brand ${
        tone === 'brand' ? 'bg-brandsoft' : 'bg-card shadow-[0_4px_10px_rgba(45,45,83,0.06)]'
      }`}
    >
      {children}
    </span>
  );
}

/** Header row inside a bordered list panel: title, sub-line and a trailing slot. */
export function ListHeader({
  title,
  description,
  aside,
}: {
  title: string;
  description: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-[18px]">
      <div className="flex flex-col gap-1">
        <p className="text-[14px] leading-[1.5] tracking-[-0.025em] text-ink">{title}</p>
        <p className="text-[12px] leading-[1.4] tracking-[-0.023em] text-muted">{description}</p>
      </div>
      {aside}
    </div>
  );
}

type BadgeTone = 'public' | 'private' | 'outline' | 'neutral' | 'brand';

const BADGE_TONE: Record<BadgeTone, string> = {
  public: 'bg-pubsoft text-pubink',
  private: 'bg-privsoft text-privink',
  outline: 'border border-publine bg-card text-pubink',
  neutral: 'bg-mutedbg text-steel',
  brand: 'bg-brandsoft text-brandink',
};

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: BadgeTone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-[7px] py-1 text-[11px] font-semibold whitespace-nowrap ${BADGE_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

export type StatusTone = 'live' | 'pending' | 'blocked' | 'exempt';

const STATUS_DOT: Record<StatusTone, string> = {
  live: 'bg-brand',
  pending: 'bg-amber',
  blocked: 'bg-rose',
  exempt: 'bg-priv',
};

/** Coloured dot + label, the review-state marker used across the dashboard tables. */
export function StatusLabel({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] tracking-[-0.023em] whitespace-nowrap text-steel">
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[tone]}`} />
      {children}
    </span>
  );
}

/**
 * Search box. Pass `value`/`onChange` to filter a client list; left
 * uncontrolled it is presentational until the search endpoint exists
 * (architecture.md 21).
 */
export function SearchField({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string;
  value?: string;
  onChange?: (next: string) => void;
}) {
  return (
    <label className="flex h-[37px] min-w-0 flex-1 items-center gap-2 rounded-[7px] border-2 border-line bg-[#fbfefe] px-3">
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        width={15}
        height={15}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 text-muted"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="search"
        placeholder={placeholder}
        {...(onChange ? { value: value ?? '', onChange: (e) => onChange(e.target.value) } : {})}
        className="min-w-0 flex-1 bg-transparent text-[13px] tracking-[-0.023em] text-ink placeholder:text-ink/50 focus:outline-none"
      />
    </label>
  );
}

/** Progress bar used by quota and queue readouts. */
export function Meter({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`h-[5px] overflow-hidden rounded-full bg-mutedbg ${className}`}>
      <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
