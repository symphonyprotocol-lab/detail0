import Link from "next/link";
import { Code2, DatabaseZap, Globe2, MessagesSquare } from "lucide-react";

const groups = [
  ["产品", [["知识市场", "/marketplace"], ["智能检索", "/product"], ["API", "/developers"], ["定价", "/pricing"]]],
  ["公司", [["关于我们", "#"], ["博客", "#"], ["招聘", "#"], ["联系我们", "#"]]],
  ["资源", [["帮助中心", "#"], ["开发文档", "/developers"], ["指南", "#"], ["状态", "#"]]],
  ["法律", [["隐私政策", "#"], ["服务条款", "#"], ["安全", "#"], ["Cookie", "#"]]],
] as const;

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-main container-wide">
        <div className="footer-brand">
          <Link href="/" className="brand"><DatabaseZap size={20} />Knowledge Market</Link>
          <p>让可信知识进入每一次 AI 决策。</p>
        </div>
        <div className="footer-links">
          {groups.map(([title, links]) => (
            <div key={title}><strong>{title}</strong>{links.map(([label, href]) => <Link key={label} href={href}>{label}</Link>)}</div>
          ))}
        </div>
      </div>
      <div className="footer-bottom container-wide">
        <span>© 2026 Knowledge Market. 保留所有权利。</span>
        <div><Globe2 size={17} /><Code2 size={17} /><MessagesSquare size={17} /></div>
      </div>
    </footer>
  );
}
