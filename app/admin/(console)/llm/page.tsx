import type { Metadata } from 'next';
import { LlmConfigForm } from '@/components/admin/llm-config-form';
import {
  ConsolePageHeader,
  EmptyRow,
  Metric,
  Panel,
  PanelHead,
  Pill,
  TableScroller,
  TD,
  TH,
} from '@/components/admin/ui';
import { readLlmConfiguration, type LlmConfigRow } from '@/lib/application/administration';
import { requireAdminCapability } from '@/lib/http/admin';
import { fill } from '@/lib/i18n/format';
import { translations } from '@/lib/i18n/server';
import { updateLlmConfigAction } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await translations()).t.admin.llm.title };
}

/** Micro-USD to a dollars string; spend is small, so keep four decimals. */
function usdFromMicro(micro: number): string {
  return `$${(micro / 1_000_000).toFixed(4)}`;
}

/**
 * Playground model configuration and spend. architecture.md 9.5: the
 * playground is the only model caller, its provider is configuration (the
 * credential stays in the environment), and its tokens flow only into the
 * cost metric this page reports.
 */
export default async function AdminLlmPage() {
  await requireAdminCapability('plans');
  const [{ locale, t }, { current, history, stats }] = await Promise.all([
    translations(),
    readLlmConfiguration(),
  ]);
  const p = t.admin.llm;
  const number = new Intl.NumberFormat(locale);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  const prefill = current ?? {
    baseUrl: 'https://api.openai.com/v1',
    model: '',
    maxOutputTokens: 800,
    timeoutMs: 15_000,
    promptPriceMicro: 0,
    completionPriceMicro: 0,
    enabled: true,
  };

  return (
    <div className="flex flex-col gap-[22px]">
      <ConsolePageHeader eyebrow={t.admin.eyebrow} title={p.title} description={p.description} />

      <Panel>
        <PanelHead title={p.statsTitle} description={p.statsDescription} />
        <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-card">
            <Metric
              label={p.monthCost}
              value={usdFromMicro(stats.monthCostMicroUsd)}
              note={`${number.format(stats.monthCalls)} · ${p.monthCalls}`}
            />
          </div>
          <div className="bg-card">
            <Metric
              label={p.monthCalls}
              value={number.format(stats.monthCalls)}
              note={fill(p.tokensNote, {
                prompt: number.format(stats.monthPromptTokens),
                completion: number.format(stats.monthCompletionTokens),
              })}
            />
          </div>
          <div className="bg-card">
            <Metric
              label={p.totalCost}
              value={usdFromMicro(stats.totalCostMicroUsd)}
              note={p.totalCalls}
            />
          </div>
          <div className="bg-card">
            <Metric label={p.totalCalls} value={number.format(stats.totalCalls)} note={p.statsTitle} />
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHead title={p.configTitle} description={p.configDescription} />
        {current === null ? (
          <p className="px-[19px] pt-4 text-[12px] tracking-[-0.023em] text-muted">{p.none}</p>
        ) : null}
        <LlmConfigForm prefill={prefill} action={updateLlmConfigAction} />
      </Panel>

      <Panel>
        <PanelHead title={p.historyTitle} />
        <TableScroller>
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-line">
                {p.historyColumns.map((column) => (
                  <th key={column} className={TH}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <EmptyRow columns={p.historyColumns.length} message={p.none} />
              ) : (
                history.map((row: LlmConfigRow) => (
                  <tr key={row.id} className="border-b border-line last:border-b-0">
                    <td className={TD}>{date.format(row.createdAt)}</td>
                    <td className={TD}>{row.model}</td>
                    <td className={TD}>{row.baseUrl}</td>
                    <td className={TD}>
                      {number.format(row.maxOutputTokens)} tok / {number.format(row.timeoutMs)} ms
                    </td>
                    <td className={TD}>
                      {usdFromMicro(row.promptPriceMicro)}/M · {usdFromMicro(row.completionPriceMicro)}/M
                    </td>
                    <td className={TD}>
                      <Pill tone={row.enabled ? 'ok' : 'neutral'}>
                        {row.enabled ? p.stateEnabled : p.stateDisabled}
                      </Pill>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableScroller>
      </Panel>
    </div>
  );
}
