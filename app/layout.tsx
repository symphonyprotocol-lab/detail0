import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'recall0', template: '%s · recall0' },
  description:
    '可信知识，为每一个 AI Agent 而生。搜索公开知识库，把带版本、来源与引用的最新上下文接入你的 Agent。',
};

/**
 * The root layout sets typography only -- deliberately no background or text
 * colour.
 *
 * Two different colour regimes live in this app and each must own its own:
 * - the product surfaces (public site, dashboard, admin) commit to the single
 *   light look of the design source, and paint it in their own layouts
 * - the docs site follows the reader's theme, painted by Fumadocs
 *
 * Forcing a colour here breaks the second one: anything that inherits from body
 * renders near-black on Fumadocs' dark background.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
