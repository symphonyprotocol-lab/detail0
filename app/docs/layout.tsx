import type { ReactNode } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { DocsRootProvider } from '@/components/docs/root-provider';
import { source } from '@/lib/source';
import { translations } from '@/lib/i18n/server';

/**
 * The docs shell, in the reader's language.
 *
 * Both halves have to agree on the locale: the sidebar tree comes from the
 * per-language page tree the loader built, and the chrome around it (search,
 * table of contents, the language switcher itself) from this app's dictionary.
 * Resolving it once here is what keeps them from disagreeing.
 *
 * `i18n` asks Fumadocs to draw the language toggle in the sidebar; what that
 * toggle does when clicked is `DocsRootProvider`'s business.
 */
export default async function Layout({ children }: { children: ReactNode }) {
  const { locale, t } = await translations();

  return (
    <DocsRootProvider locale={locale} translations={t.docsChrome}>
      <DocsLayout
        tree={source.getPageTree(locale)}
        nav={{ title: `Re0 ${t.nav.docs}` }}
        i18n
        githubUrl="https://github.com/symphonyprotocol-lab/re0"
        themeSwitch={{ mode: 'light-dark-system' }}
      >
        {children}
      </DocsLayout>
    </DocsRootProvider>
  );
}
