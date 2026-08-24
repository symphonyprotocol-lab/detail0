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
 * Fumadocs' RootProvider is intentionally NOT here: it paints the document in
 * the reader's theme, and the marketing site commits to the single light look
 * of the design source. The provider is mounted in app/docs/layout.tsx so the
 * docs site keeps its own theming without bleeding into the rest of the app.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="bg-surface font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
