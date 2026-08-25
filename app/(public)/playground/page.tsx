import type { Metadata } from 'next';
import { Playground } from '@/components/site/playground';

export const metadata: Metadata = {
  title: '在线试用',
  description: '与 Recall0 MCP Server 对话，获取最新、可追溯的专业知识。',
};

export default function PlaygroundPage() {
  return (
    <section className="site-wash">
      <div className="mx-auto w-full max-w-[918px] px-5 pt-14 pb-20">
        <h1 className="text-center text-[26px] leading-[1.35] font-semibold tracking-[-0.04em] text-ink sm:text-[30px]">
          与 Recall0 MCP Server 对话
          <br />
          获取最新、可追溯的专业知识
        </h1>
        <div className="mt-9">
          <Playground />
        </div>
      </div>
    </section>
  );
}
