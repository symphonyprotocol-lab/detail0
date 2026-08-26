import type { Metadata } from 'next';
import { PolicyEditor } from '@/components/dashboard/policy-editor';
import { PageHeader } from '@/components/dashboard/ui';
import { ShieldCheckIcon } from '@/components/ui/icons';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).dashboard.policies.metaTitle };
}

export default async function DashboardPoliciesPage() {
  const p = (await getMessages()).dashboard.policies;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow={p.eyebrow}
        title={p.title}
        description={p.description}
        action={
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brandsoft px-3 text-[11px] tracking-[-0.023em] text-brandink">
            <ShieldCheckIcon size={14} />
            {p.guardBadge}
          </span>
        }
      />
      <PolicyEditor />
    </div>
  );
}
