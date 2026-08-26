import { ConsoleButton, ConsolePageHeader, Panel } from '@/components/admin/ui';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { getMessages } from '@/lib/i18n/server';

/**
 * What an unknown user id renders.
 *
 * Inside the console shell rather than the site-wide 404: the operator is
 * signed in and where they meant to be, and the only thing wrong is the id in
 * the link -- so the answer keeps the navigation and offers the way back.
 */
export default async function UserNotFound() {
  const t = await getMessages();
  const d = t.admin.userDetail;

  return (
    <div className="flex flex-col gap-[18px]">
      <ConsolePageHeader
        eyebrow={d.eyebrow}
        title={d.notFoundTitle}
        description={d.notFoundBody}
        action={
          <ConsoleButton href="/admin/users">
            <ChevronLeftIcon size={14} />
            {d.back}
          </ConsoleButton>
        }
      />
      <Panel className="px-[19px] py-9">
        <p className="text-[13px] tracking-[-0.023em] text-muted">{d.notFoundHint}</p>
      </Panel>
    </div>
  );
}
