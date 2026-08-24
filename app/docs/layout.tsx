import type { ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '@/lib/source';

/** RootProvider is mounted here, not at the app root -- see app/layout.tsx. */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootProvider>
      <DocsLayout
        tree={source.pageTree}
        nav={{ title: 'recall0 docs' }}
        githubUrl="https://github.com/symphonyprotocol-lab/recall0"
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
