import { notFound } from 'next/navigation';
import { DocsPage, DocsBody, DocsTitle, DocsDescription } from 'fumadocs-ui/page';
import { getMDXComponents } from '@/components/mdx-components';
import { source } from '@/lib/source';
import { currentLocale } from '@/lib/i18n/server';

/**
 * One URL per page, two languages behind it.
 *
 * The slug identifies the page and the request's locale picks the translation,
 * so `/docs/anchoring` is the same address in Chinese and English -- and an
 * untranslated page falls back to Chinese rather than disappearing
 * (lib/i18n/docs.ts). That makes these pages request-rendered rather than
 * prerendered, which is what every other page in this app already does.
 */
export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const [{ slug }, locale] = await Promise.all([params, currentLocale()]);
  const page = source.getPage(slug, locale);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }) {
  const [{ slug }, locale] = await Promise.all([params, currentLocale()]);
  const page = source.getPage(slug, locale);
  if (!page) notFound();
  return { title: page.data.title, description: page.data.description };
}
