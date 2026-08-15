import Link from "next/link";
import { Menu, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  ["产品", "/product"],
  ["解决方案", "/solutions"],
  ["市场", "/marketplace"],
  ["定价", "/pricing"],
  ["开发者", "/developers"],
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-label="Knowledge Market 首页">
        <Zap size={20} strokeWidth={1.8} />
        <span>Knowledge Market</span>
      </Link>
      <nav className="desktop-nav" aria-label="主导航">
        {navItems.map(([label, href]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="header-actions">
        <Button variant="ghost" size="sm" className="login-button">
          登录
        </Button>
        <Button size="sm" asChild>
          <Link href="/marketplace">开始使用</Link>
        </Button>
        <details className="mobile-menu">
          <summary aria-label="打开导航">
            <Menu size={20} />
          </summary>
          <nav aria-label="移动端导航">
            {navItems.map(([label, href]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}
