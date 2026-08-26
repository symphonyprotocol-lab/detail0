import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { messagesFor } from '@/lib/i18n/dictionary';
import { HTML_LANG } from '@/lib/i18n/locale';
import { currentLocale } from '@/lib/i18n/server';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

/**
 * Title and description follow the visitor's language, so a shared link and a
 * search result read the same way the page does.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = messagesFor(await currentLocale());
  return {
    title: { default: t.meta.siteName, template: t.meta.titleTemplate },
    description: t.meta.description,
  };
}

/**
 * The root layout sets typography and the document language -- deliberately no
 * background or text colour.
 *
 * Two different colour regimes live in this app and each must own its own:
 * - the product surfaces (public site, dashboard, admin) commit to the single
 *   light look of the design source, and paint it in their own layouts
 * - the docs site follows the reader's theme, painted by Fumadocs
 *
 * Forcing a colour here breaks the second one: anything that inherits from body
 * renders near-black on Fumadocs' dark background.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await currentLocale();
  return (
    <html
      lang={HTML_LANG[locale]}
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrains.variable}`}
    >
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
