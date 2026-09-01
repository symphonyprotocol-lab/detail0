'use client';

import { useState } from 'react';
import { Badge, PANEL } from '@/components/dashboard/ui';
import {
  BadgeCheckIcon,
  BanIcon,
  BracesIcon,
  CircleCheckIcon,
  DatabaseIcon,
  FileTextIcon,
  GitBranchIcon,
  GlobeIcon,
  ListChecksIcon,
  LockIcon,
  ShieldCheckIcon,
  SlidersIcon,
  SparklesIcon,
  UploadIcon,
} from '@/components/ui/icons';
import {
  dashboardCopy,
  POLICY_ALLOWED,
  POLICY_BLOCKED,
  POLICY_REACHABLE,
} from '@/lib/dashboard/demo-data';
import { useI18n } from '@/lib/i18n/client';
import { fill } from '@/lib/i18n/format';

const SOURCE_ICONS: Record<string, (props: { size?: number }) => React.ReactElement> = {
  repos: GitBranchIcon,
  sites: GlobeIcon,
  schema: BracesIcon,
  notion: FileTextIcon,
  uploads: UploadIcon,
  private: LockIcon,
};

/**
 * One icon per threshold row, so the list does not read as seven identical
 * shields. Keyed by the filter's id rather than its label -- the label moves
 * with the language, the id does not.
 */
const FILTER_ICONS: Record<string, (props: { size?: number; className?: string }) => React.ReactElement> = {
  reviewState: BadgeCheckIcon,
  trustScore: ShieldCheckIcon,
  stars: SparklesIcon,
  license: FileTextIcon,
  backlinks: GitBranchIcon,
  referringDomains: GlobeIcon,
  organicTraffic: BracesIcon,
};

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
        on ? 'justify-end bg-brand' : 'justify-start bg-mutedbg'
      }`}
    >
      <span className="size-4 rounded-full bg-card shadow-[0_1px_3px_rgba(10,35,38,0.18)]" />
    </button>
  );
}

/** Removable chip in the block / allow lists. */
function ListChip({
  value,
  removeLabel,
  onRemove,
}: {
  value: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#f1f5f4] py-1 pr-1.5 pl-2">
      <span className="text-[13px] tracking-[-0.023em] text-steel">{value}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="text-[13px] leading-none text-muted transition-colors hover:text-ink"
      >
        ×
      </button>
    </span>
  );
}

function ListEditor({
  icon,
  title,
  description,
  placeholder,
  addLabel,
  removeLabel,
  values,
  onRemove,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  placeholder: string;
  addLabel: string;
  removeLabel: (value: string) => string;
  values: string[];
  onRemove: (value: string) => void;
}) {
  return (
    <section className="flex flex-col gap-2 border-t-2 border-line px-6 pt-[19px]">
      <div className="flex flex-col gap-[5px]">
        <h3 className="flex items-center gap-[7px] text-[13px] tracking-[-0.023em] text-ink">
          <span className="text-brand">{icon}</span>
          {title}
        </h3>
        <p className="text-[11px] tracking-[-0.023em] text-muted">{description}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <label className="flex h-[38px] min-w-[220px] flex-1 items-center gap-[7px] rounded-[7px] border-2 border-line px-3">
          <ListChecksIcon size={13} className="text-muted" />
          <input
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent text-[11px] tracking-[-0.023em] text-ink placeholder:text-muted/50 focus:outline-none"
          />
        </label>
        <button
          type="button"
          className="h-[38px] rounded-[7px] border-2 border-brand bg-brand px-[11px] text-[11px] font-semibold text-white transition-colors hover:bg-brand/90"
        >
          {addLabel}
        </button>
        <button
          type="button"
          className="inline-flex h-[38px] items-center gap-1.5 rounded-[7px] border-2 border-line bg-card px-[13px] text-[11px] font-semibold text-steel transition-colors hover:bg-subtle"
        >
          <UploadIcon size={13} />
          CSV
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <ListChip
            key={value}
            value={value}
            removeLabel={removeLabel(value)}
            onRemove={() => onRemove(value)}
          />
        ))}
      </div>
    </section>
  );
}

/** Access-rule editor -- design source frames `yOmm8` and `Eznsd`. */
export function PolicyEditor() {
  const { locale, t } = useI18n();
  const p = t.dashboard.policies;
  const { sourceGroups, qualityFilterGroups } = dashboardCopy(t);
  const allSources = sourceGroups.flatMap((group) => group.items.map((item) => item.id));
  const removeLabel = (value: string) => fill(p.remove, { value });

  const [enabled, setEnabled] = useState<string[]>(allSources);
  const [mode, setMode] = useState<'quality' | 'manual'>('quality');
  const [blocked, setBlocked] = useState(POLICY_BLOCKED);
  const [allowed, setAllowed] = useState(POLICY_ALLOWED);
  const [dirty, setDirty] = useState(false);

  function toggleSource(id: string) {
    setEnabled((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
    setDirty(true);
  }

  function reset() {
    setEnabled(allSources);
    setMode('quality');
    setBlocked(POLICY_BLOCKED);
    setAllowed(POLICY_ALLOWED);
    setDirty(false);
  }

  return (
    <>
      {/* Source access -- design source `yOmm8`. */}
      <section className={`${PANEL} overflow-hidden p-0.5`}>
        <div className="flex flex-wrap items-start justify-between gap-[18px] px-6 py-5">
          <div className="flex flex-col gap-[5px]">
            <h2 className="text-[15px] leading-[1.5] tracking-[-0.025em] text-ink">
              {p.sourcesTitle}
            </h2>
            <p className="text-[12px] tracking-[-0.023em] text-muted">{p.sourcesDescription}</p>
          </div>
          <Badge tone="brand">
            {fill(p.enabledBadge, { on: enabled.length, total: allSources.length })}
          </Badge>
        </div>

        <div className="px-6 pb-4">
          {sourceGroups.map((group) => (
            <div key={group.title}>
              <p className="pt-3 pb-[7px] text-[11px] font-bold tracking-[0.04em] text-muted">
                {group.title}
              </p>
              {group.items.map((item) => {
                const Icon = SOURCE_ICONS[item.id] ?? DatabaseIcon;
                return (
                  <div key={item.id} className="flex items-center gap-2.5 py-[15px]">
                    <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-[#f4f8f7] text-brand">
                      <Icon size={17} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-[13px] tracking-[-0.023em] text-ink">{item.name}</span>
                      <span className="text-[11px] tracking-[-0.023em] text-muted">{item.note}</span>
                    </span>
                    <Toggle
                      on={enabled.includes(item.id)}
                      onClick={() => toggleSource(item.id)}
                      label={item.name}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {/* Library filter -- design source `yOmm8`. */}
      <section className={`${PANEL} overflow-hidden p-0.5`}>
        <div className="flex flex-col gap-[5px] px-6 py-5">
          <h2 className="text-[15px] leading-[1.5] tracking-[-0.025em] text-ink">
            {p.filterTitle}
          </h2>
          <p className="text-[12px] tracking-[-0.023em] text-muted">{p.filterDescription}</p>
        </div>

        <div className="flex flex-wrap gap-[9px] px-6 pb-[18px]">
          {(
            [
              { id: 'quality', ...p.modeQuality, Icon: SlidersIcon },
              { id: 'manual', ...p.modeManual, Icon: ListChecksIcon },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                setMode(option.id);
                setDirty(true);
              }}
              aria-pressed={mode === option.id}
              className={`flex min-w-[240px] flex-1 items-center gap-[9px] rounded-[9px] border-2 p-[13px_15px] text-left transition-colors ${
                mode === option.id ? 'border-brand bg-[#f0f8f8]' : 'border-line bg-[#fbfdfd] hover:bg-subtle'
              }`}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-card text-brand">
                <option.Icon size={16} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[12px] font-bold tracking-[-0.023em] text-steel">
                  {option.title}
                </span>
                <span className="text-[10px] tracking-[-0.023em] text-muted">{option.note}</span>
              </span>
              {mode === option.id ? <CircleCheckIcon size={15} className="text-brand" /> : null}
            </button>
          ))}
        </div>

        {mode === 'quality' ? (
          <div className="flex flex-col gap-[9px] px-6">
            {qualityFilterGroups.map((group, groupIndex) => (
              <div key={group.title ?? groupIndex}>
                {group.title ? (
                  <h3 className="flex items-center gap-1.5 pt-3 pb-[7px] text-[11px] font-bold tracking-[0.04em] text-muted">
                    <BadgeCheckIcon size={13} />
                    {group.title}
                  </h3>
                ) : null}
                <div className="overflow-hidden rounded-lg border-2 border-line p-0.5">
                  {group.items.map((filter, index) => (
                    <label
                      key={filter.label}
                      className={`flex h-12 items-center justify-between gap-[18px] pr-2.5 pl-[13px] ${
                        index > 0 ? 'border-t-2 border-line' : ''
                      }`}
                    >
                      <span className="flex items-center gap-2 text-[12px] font-semibold tracking-[-0.023em] text-steel">
                        {(() => {
                          const Icon = FILTER_ICONS[filter.id] ?? ShieldCheckIcon;
                          return <Icon size={14} className="text-muted" />;
                        })()}
                        {filter.label}
                      </span>
                      <select
                        defaultValue={filter.options[0]}
                        onChange={() => setDirty(true)}
                        className="h-[30px] w-[105px] rounded-md border-2 border-line bg-card px-1.5 text-[11px] tracking-[-0.023em] text-steel focus:outline-none"
                      >
                        {filter.options.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mx-6 rounded-lg border-2 border-dashed border-line px-4 py-8 text-center text-[12px] text-muted">
            {p.manualHint}
          </p>
        )}

        <div className="flex flex-col gap-[22px] pt-[22px] pb-6">
          <ListEditor
            icon={<BanIcon size={14} />}
            title={p.blockedTitle}
            description={p.blockedDescription}
            placeholder={p.listPlaceholder}
            addLabel={p.add}
            removeLabel={removeLabel}
            values={blocked}
            onRemove={(value) => {
              setBlocked((current) => current.filter((item) => item !== value));
              setDirty(true);
            }}
          />
          <ListEditor
            icon={<BadgeCheckIcon size={14} />}
            title={p.allowedTitle}
            description={p.allowedDescription}
            placeholder={p.listPlaceholder}
            addLabel={p.add}
            removeLabel={removeLabel}
            values={allowed}
            onRemove={(value) => {
              setAllowed((current) => current.filter((item) => item !== value));
              setDirty(true);
            }}
          />
        </div>

        <footer className="mx-4 mb-4 flex flex-wrap items-center gap-3 rounded-[10px] border-2 border-line bg-card/96 p-3.5 shadow-[0_4px_10px_rgba(45,45,83,0.12)]">
          <div className="flex min-w-[240px] flex-1 items-center justify-between gap-4 rounded-lg border-2 border-[#8ed5cf] bg-[#ecf6f6] px-[15px] py-0.5">
            <span className="text-[12px] tracking-[-0.023em] text-brandink">{p.reachable}</span>
            <span className="text-[18px] leading-[1.5] font-semibold tracking-[-0.025em] text-brandink">
              {new Intl.NumberFormat(locale).format(POLICY_REACHABLE)}
            </span>
          </div>
          <p className="text-[10px] tracking-[-0.023em] text-muted">
            {dirty ? p.dirty : p.clean}
          </p>
          <button
            type="button"
            onClick={reset}
            className="h-[34px] rounded-[7px] border-2 border-line bg-card px-[11px] text-[11px] text-steel transition-colors hover:bg-subtle"
          >
            {p.discard}
          </button>
          <button
            type="button"
            onClick={() => setDirty(false)}
            className="h-[34px] rounded-[7px] border-2 border-brand bg-brand px-[11px] text-[11px] text-white transition-colors hover:bg-brand/90"
          >
            {p.apply}
          </button>
        </footer>
      </section>
    </>
  );
}
