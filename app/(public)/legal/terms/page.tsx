import type { Metadata } from 'next';
import { LegalDocument } from '@/components/site/legal-document';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { legal } = await getMessages();
  return { title: legal.terms.metaTitle, description: legal.terms.metaDescription };
}

/** Anchor ids, in the order the dictionary lists the articles. */
const SECTION_IDS = [
  'service',
  'aup',
  'content',
  'billing',
  'refunds',
  'liability',
  'changes',
] as const;

export default async function TermsPage() {
  const { legal: g } = await getMessages();
  const d = g.terms;

  return (
    <LegalDocument
      eyebrow="TERMS OF SERVICE"
      title={d.title}
      ledeLead={d.ledeLead}
      ledeTail={d.ledeTail}
      contents={g.contents}
      /* An article the ids have not caught up with falls back to its number. */
      sections={d.sections.map((section, i) => ({
        ...section,
        id: SECTION_IDS[i] ?? String(i + 1),
      }))}
      back={g.title}
      also={{ lead: d.alsoLead, label: g.documents.privacy.name, href: '/legal/privacy' }}
      footnote={g.footnote}
    />
  );
}
