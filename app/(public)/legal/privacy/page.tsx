import type { Metadata } from 'next';
import { LegalDocument } from '@/components/site/legal-document';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { legal } = await getMessages();
  return { title: legal.privacy.metaTitle, description: legal.privacy.metaDescription };
}

/** Anchor ids, in the order the dictionary lists the articles. */
const SECTION_IDS = [
  'collect',
  'use',
  'never',
  'sharing',
  'retention',
  'cookies',
  'rights',
  'security',
  'changes',
] as const;

export default async function PrivacyPage() {
  const { legal: g } = await getMessages();
  const d = g.privacy;

  return (
    <LegalDocument
      eyebrow="PRIVACY NOTICE"
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
      also={{ lead: d.alsoLead, label: g.documents.terms.name, href: '/legal/terms' }}
      footnote={g.footnote}
    />
  );
}
