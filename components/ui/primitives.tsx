import Link from 'next/link';
import type { ReactNode } from 'react';

type Tone = 'brand' | 'good' | 'warn' | 'neutral';

const CHIP_TONE: Record<Tone, string> = {
  brand: 'bg-brandsoft text-brandink',
  good: 'bg-goodsoft text-good',
  warn: 'bg-warnsoft text-warn',
  neutral: 'bg-mutedbg text-muted',
};

export function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex h-[22px] items-center rounded-full px-2.5 text-[11px] font-semibold whitespace-nowrap ${CHIP_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

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
  /** `sm` is the 36px section action, `md` the 40px call-to-action. */
  size?: 'sm' | 'md';
  className?: string;
}) {
  const base = `inline-flex items-center justify-center gap-2 rounded-full text-[14px] font-medium tracking-[-0.029em] transition-colors ${
    size === 'md' ? 'h-10 px-[18px]' : 'h-9 px-4'
  }`;
  const style =
    variant === 'primary'
      ? 'bg-brand text-white hover:bg-brand/90'
      : 'border-2 border-line bg-card text-ink hover:bg-subtle';
  return (
    <Link href={href} className={`${base} ${style} ${className}`}>
      {children}
    </Link>
  );
}

/** Eyebrow + heading, the section header pattern used throughout the design. */
export function SectionHeading({
  eyebrow,
  title,
  action,
  as: Heading = 'h2',
  size = 'md',
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
  /** Use h1 when the section is the top of a page that has no hero. */
  as?: 'h1' | 'h2';
  size?: 'md' | 'lg';
}) {
  const titleSize = size === 'lg' ? 'text-[30px]' : 'text-[25px]';
  return (
    <div className="flex flex-wrap items-center justify-between gap-6">
      <div className="flex gap-3.5">
        <span aria-hidden className="w-[3px] shrink-0 rounded bg-brand" />
        <div className="flex flex-col gap-[5px]">
          <p className="text-[10px] font-[750] tracking-[0.1em] text-brand">{eyebrow}</p>
          <Heading
            className={`${titleSize} leading-[1.3] font-[650] tracking-[-0.04em] text-ink`}
          >
            {title}
          </Heading>
        </div>
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border-2 border-line bg-card ${className}`}>{children}</div>
  );
}
