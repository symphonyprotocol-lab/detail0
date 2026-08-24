import Link from 'next/link';

const LINKS = [
  { href: '/status', label: '服务状态' },
  { href: '/about', label: '关于' },
  { href: '/docs', label: '使用指南' },
  { href: '/contact', label: '联系我们' },
  { href: '/legal', label: '法律条款' },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-card">
      <div className="mx-auto flex w-full max-w-[918px] flex-col items-center justify-between gap-4 px-5 py-7 text-[12px] sm:flex-row">
        <p className="flex items-center gap-2 text-muted">
          <span className="text-ink">© 2026, recall0</span>
          <span aria-hidden className="text-line">·</span>
          <span>让可信知识进入每一次 AI 决策。</span>
        </p>
        <nav className="flex flex-wrap items-center justify-center gap-5">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-muted transition-colors hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
