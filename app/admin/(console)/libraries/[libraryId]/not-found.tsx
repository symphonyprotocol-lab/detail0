import { ConsoleButton, ConsolePageHeader, Panel } from '@/components/admin/ui';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { getMessages } from '@/lib/i18n/server';

/** An unknown user-library id, inside the console shell. The likelier cause is named. */
export default async function UserLibraryNotFound() {
  const t = await getMessages();
  const d = t.admin.libraries.detail;

  return (
    <div className="flex flex-col gap-[18px]">
      <ConsolePageHeader
        eyebrow={d.eyebrow}
        title={d.title}
        description={d.notFound}
        action={
          <ConsoleButton href="/admin/libraries">
            <ChevronLeftIcon size={14} />
            {d.notFoundBack}
          </ConsoleButton>
        }
      />
      <Panel className="px-[19px] py-9">
        <p className="text-[13px] leading-[1.6] tracking-[-0.023em] text-muted">{d.notFoundNote}</p>
      </Panel>
    </div>
  );
}
