import type { Metadata } from 'next';
import { Playground } from '@/components/site/playground';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { playground } = await getMessages();
  return { title: playground.metaTitle, description: playground.metaDescription };
}

export default async function PlaygroundPage() {
  const { playground } = await getMessages();

  return (
    <section>
      <div className="mx-auto w-full max-w-[1080px] px-5 pt-14 pb-20">
        <h1 className="text-center text-[26px] leading-[1.35] font-semibold tracking-[-0.04em] text-ink sm:text-[30px]">
          {playground.titleLine1}
          <br />
          {playground.titleLine2}
        </h1>
        <div className="mt-9">
          <Playground />
        </div>
      </div>
    </section>
  );
}
