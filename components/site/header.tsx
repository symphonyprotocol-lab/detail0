import Link from 'next/link';

const NAV = [
  { href: '/docs', label: '文档' },
  { href: '/pricing', label: '定价' },
  { href: '/playground', label: '在线试用' },
];

export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span
        aria-hidden
        className="flex size-6 items-center justify-center rounded-md bg-brand text-[11px] font-bold tracking-[-0.04em] text-white"
      >
        r0
      </span>
      <span className="text-[15px] font-semibold tracking-[-0.03em] text-ink">Recall0</span>
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-surface/85 backdrop-blur">
      <div className="mx-auto flex h-[62px] w-full max-w-[918px] items-center justify-between px-5">
        <div className="flex items-center gap-8">
          <Wordmark />
          <nav className="hidden items-center gap-6 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[13px] text-muted transition-colors hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="hidden text-[13px] text-muted transition-colors hover:text-ink sm:block"
          >
            中文
          </button>
          <Link
            href="/login"
            className="inline-flex h-8 items-center rounded-full bg-brand px-4 text-[13px] font-medium text-white transition-colors hover:bg-brand/90"
          >
            登录
          </Link>
        </div>
      </div>
    </header>
  );
}
