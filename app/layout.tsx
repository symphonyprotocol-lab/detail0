import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { messagesFor } from '@/lib/i18n/dictionary';
import { HTML_LANG } from '@/lib/i18n/locale';
import { currentLocale } from '@/lib/i18n/server';
import { WebMcpProvider } from '@/components/site/webmcp-provider';
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
 * The product surfaces (public site, dashboard, admin) each commit to the
 * single light look of the design source and paint it in their own layouts, so
 * the colour a page renders in stays that layout's decision rather than one
 * inherited from here.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await currentLocale();
  return (
    <html
      lang={HTML_LANG[locale]}
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrains.variable}`}
    >
      <head>
        {/*
          The reader's theme choice, applied before the first paint.
          Without it the page renders on the system preference and then
          corrects itself once React hydrates, which is a full-page flash
          on every navigation for anyone who has picked the non-system
          side. It only ever writes an attribute the CSS already
          understands (see app/globals.css), and stays silent when nothing
          is stored, which is what leaves the default following the system.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('re0-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}",
          }}
        />
      </head>
      <body className="font-sans antialiased">
        {children}
        <script src="/vendor/webmcp/webmcp.js" async data-re0-webmcp="true" />
        <WebMcpProvider locale={locale} />
      </body>
    </html>
  );
}
