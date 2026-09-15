import Link from 'next/link';
import type { ReactNode } from 'react';

type Tone = 'brand' | 'good' | 'warn' | 'neutral';

const CHIP_TONE: Record<Tone, string> = {
  brand: 'bg-brandsoft text-brandink',
  good: 'bg-goodsoft text-good',
  warn: 'bg-warnsoft text-warn',
  neutral: 'bg-mutedbg text-muted',
};

/** Tag. The one shape in this system that stays fully round. */
export function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-caption font-medium whitespace-nowrap ${CHIP_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * Button.
 *
 * 8px, which is the system's radius for anything typed into or pressed -- the
 * 4px gap between it and the 12px card radius is deliberate, and there is
 * nothing in between. `primary` is the one chromatic control on a screen: the
 * whole colour budget is a single blue, so a second filled button in view is a
 * second signal, and there is only ever one thing the page is asking for.
 * `outline` is its restrained partner, a hairline the eye is meant to reach
 * second.
 *
 * Nothing lifts on hover, because this system has no elevation to lift into --
 * depth is a tint and a hairline, and the only shadow it owns is a focus ring.
 */
export function Button({
  href,
  children,
  variant = 'primary',
  size = 'sm',
  className = '',
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'outline';
  /** `sm` is the 40px section action, `md` the 48px call-to-action. */
  size?: 'sm' | 'md';
  className?: string;
}) {
  const base = `inline-flex items-center justify-center gap-2 rounded-md text-body font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:shadow-focus ${
    size === 'md' ? 'h-12 px-5' : 'h-10 px-4'
  }`;
  const style =
    variant === 'primary'
      ? 'bg-brand text-onbrand hover:bg-brand/90'
      : 'border border-line text-ink hover:bg-subtle';
  return (
    <Link href={href} className={`${base} ${style} ${className}`}>
      {children}
    </Link>
  );
}

/**
 * Section tag + heading.
 *
 * The tag is plain caption-size text in the same ink as the heading under it,
 * not a coloured pill: in this system hierarchy comes from size and tracking,
 * and the tracking opens as the size grows rather than tightening.
 */
export function SectionHeading({
  eyebrow,
  title,
  action,
  as: Heading = 'h2',
  size = 'md',
  align = 'start',
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
  /** Use h1 when the section is the top of a page that has no hero. */
  as?: 'h1' | 'h2';
  size?: 'md' | 'lg';
  /** Centred for a section that opens a zone, left for one with an action. */
  align?: 'start' | 'center';
}) {
  const titleSize = size === 'lg' ? 'text-[40px] leading-[1.25]' : 'text-heading-sm';
  return (
    <div
      className={`flex flex-wrap items-end justify-between gap-6 ${
        align === 'center' ? 'flex-col items-center justify-center text-center' : ''
      }`}
    >
      <div
        className={`flex flex-col gap-2 ${
          align === 'center' ? 'items-center' : 'min-w-[300px] max-w-[36ch] flex-1'
        }`}
      >
        <p className="eyebrow">{eyebrow}</p>
        <Heading className={`${titleSize} font-semibold tracking-[0.018em] text-ink`}>
          {title}
        </Heading>
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-line bg-card ${className}`}>{children}</div>;
}

/**
 * The showcase card: a paper surface floating on a tinted section.
 *
 * 12px, one hairline, no shadow. It carries its own `card` token so it stays
 * paper-white over a wash, which is the only contrast holding it off the
 * section behind it.
 */
export function ShowcaseCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`paper-card rounded-lg p-6 sm:p-8 ${className}`}>{children}</div>
  );
}

/** A statistic: the figure in the accent blue, its label in Slate beneath. */
export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-heading-sm font-semibold text-brandink">{value}</span>
      <span className="text-caption text-muted">{label}</span>
    </div>
  );
}
