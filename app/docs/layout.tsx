import type { ReactNode } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '@/lib/source';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{ title: 'recall0 docs' }}
      githubUrl="https://github.com/symphonyprotocol-lab/recall0"
    >
      {children}
    </DocsLayout>
  );
}
