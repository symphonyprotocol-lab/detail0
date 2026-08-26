'use client';

import { useState } from 'react';
import { CopyButton } from '@/components/dashboard/copy-button';
import { dashboardCopy } from '@/lib/dashboard/demo-data';
import { useI18n } from '@/lib/i18n/client';

/** REST quickstart with request/response samples -- design source frame `lRoBh`. */
export function ApiQuickstart() {
  const { t } = useI18n();
  const o = t.dashboard.overview;
  const tabs = dashboardCopy(t).quickstartTabs;
  const [activeId, setActiveId] = useState(tabs[0].id);
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  return (
    <>
      <div className="mt-[19px] flex" role="tablist" aria-label={o.quickstartTabsLabel}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active.id}
            onClick={() => setActiveId(tab.id)}
            className={`h-8 border-2 border-line px-2.5 text-[11px] tracking-[-0.023em] transition-colors ${
              index === 0 ? 'rounded-l-md' : '-ml-0.5 rounded-r-md'
            } ${tab.id === active.id ? 'z-10 border-ink bg-ink text-white' : 'bg-card text-ink hover:bg-subtle'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="relative mt-3 w-full rounded-lg bg-[#f1f5f4]">
        <CopyButton
          value={active.request}
          label={o.quickstartRequestLabel}
          className="absolute top-2 right-2 text-muted hover:bg-mutedbg"
        />
        <pre className="overflow-x-auto p-4 pr-12 font-mono text-[12px] leading-[1.6] tracking-[-0.023em] text-[#278f5c]">
          {active.request}
        </pre>
      </div>

      <p className="mt-4 text-[12px] tracking-[-0.023em] text-steel">{o.quickstartResponse}</p>
      <pre className="mt-[7px] w-full overflow-x-auto rounded-lg bg-[#f5f7f6] p-4 font-mono text-[12px] leading-[1.6] tracking-[-0.023em] text-[#635c31]">
        {active.response}
      </pre>
    </>
  );
}
