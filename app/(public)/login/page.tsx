import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@/components/ui/primitives';

export const metadata: Metadata = {
  title: '登录',
  description: '使用 GitHub 或 Google 账户登录 Recall0。',
};

const PROVIDERS = [
  { id: 'github', name: '使用 GitHub 登录', hint: '继续使用你的 GitHub 账户', mark: 'GH' },
  { id: 'google', name: '使用 Google 登录', hint: '继续使用你的 Google 账户', mark: 'G' },
];

const PERKS = ['同步对话记录', '管理 API 密钥', '访问私有知识库'];

export default function LoginPage() {
  return (
    <section className="site-wash">
      <div className="mx-auto flex w-full max-w-[420px] flex-col items-center px-5 py-20">
        <h1 className="text-[26px] font-semibold tracking-[-0.04em] text-ink">欢迎回来</h1>
        <p className="mt-2 text-[13px] text-muted">选择一个账户，继续访问 Recall0。</p>

        <Card className="mt-8 w-full p-6">
          <div className="flex flex-col gap-3">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="flex items-center gap-3 rounded-lg border-2 border-line bg-card px-4 py-3 text-left transition-colors hover:bg-subtle"
              >
                <span
                  aria-hidden
                  className="flex size-8 shrink-0 items-center justify-center rounded-md bg-mutedbg text-[12px] font-bold text-muted"
                >
                  {p.mark}
                </span>
                <span className="flex flex-col">
                  <span className="text-[13.5px] font-semibold text-ink">{p.name}</span>
                  <span className="text-[11.5px] text-muted">{p.hint}</span>
                </span>
              </button>
            ))}
          </div>

          <p className="mt-5 text-[11.5px] leading-[1.7] text-faint">
            Recall0 不会读取你的账户密码，仅使用第三方账户完成安全身份验证。首次登录时会自动创建
            Recall0 账户。
          </p>
        </Card>

        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11.5px] text-muted">
          {PERKS.map((p) => (
            <li key={p} className="flex items-center gap-2">
              <span aria-hidden className="size-1.5 rounded-full bg-brand" />
              {p}
            </li>
          ))}
        </ul>

        <p className="mt-6 text-center text-[11.5px] text-faint">
          登录即表示你同意 Recall0 的
          <Link href="/legal" className="mx-1 text-brandink hover:underline">
            服务条款和隐私政策
          </Link>
          。
        </p>
      </div>
    </section>
  );
}
