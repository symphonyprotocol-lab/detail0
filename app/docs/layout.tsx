import type { ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '@/lib/source';

/**
 * RootProvider is mounted here, not at the app root -- see app/layout.tsx.
 *
 * The docs site follows the reader's operating system: `system` is both the
 * default and a selectable option in the switcher, so a reader who never
 * touches the switcher tracks their OS appearance, and one who tried light or
 * dark once can hand control back to it.
 */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootProvider theme={{ defaultTheme: 'system', enableSystem: true }}>
      <DocsLayout
        tree={source.pageTree}
        nav={{ title: 'Detail0 docs' }}
        githubUrl="https://github.com/symphonyprotocol-lab/detail0"
        themeSwitch={{ mode: 'light-dark-system' }}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
