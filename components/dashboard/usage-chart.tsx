import { fill } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';

/** Plot body height in px; the y axis runs 0..max over this span. */
const PLOT_HEIGHT = 216;

export interface UsageChartDay {
  label: string;
  calls: number;
}

/**
 * Call-volume bars -- design source frame `C06o6`, fed from the rebuilt
 * usage summary (architecture.md 11.1). One series now: the ledger records
 * calls, and a second stacked band returns when a second metered operation
 * exists to draw. The ceiling adapts to the data instead of asserting one.
 */
export async function UsageChart({ days }: { days: UsageChartDay[] }) {
  const t = await getMessages();
  const o = t.dashboard.overview;

  const peak = Math.max(1, ...days.map((day) => day.calls));
  /* A round ceiling a little above the peak, so the top bar never touches. */
  const magnitude = 10 ** Math.max(1, String(peak).length - 1);
  const max = Math.ceil((peak * 1.15) / magnitude) * magnitude;
  const ticks = [max, Math.round((max * 2) / 3), Math.round(max / 3), 0];

  return (
    <div>
      <div className="flex">
        <div className="relative w-8 shrink-0" style={{ height: PLOT_HEIGHT }} aria-hidden>
          {ticks.map((tick, index) => (
            <span
              key={`${tick}-${index}`}
              className="absolute right-[7px] -translate-y-1/2 text-[10px] leading-none tracking-[-0.023em] text-muted"
              style={{ top: (index * PLOT_HEIGHT) / (ticks.length - 1) }}
            >
              {tick}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div
            className="relative border-b-2 border-l-2 border-line"
            style={{ height: PLOT_HEIGHT }}
          >
            {ticks.slice(0, -1).map((tick, index) => (
              <span
                key={`${tick}-${index}`}
                aria-hidden
                className="absolute inset-x-0 border-t-2 border-line"
                style={{ top: (index * PLOT_HEIGHT) / (ticks.length - 1) }}
              />
            ))}

            <ul className="absolute inset-0 flex items-end justify-between gap-[7px] px-2.5">
              {days.map((day) => (
                <li
                  key={day.label}
                  className="flex min-w-0 flex-1 flex-col justify-end"
                  title={fill(o.barTitle, { day: day.label, calls: day.calls })}
                >
                  <span
                    className="mx-auto block w-[23px] max-w-full rounded-t bg-barstrong"
                    style={{ height: (day.calls / max) * PLOT_HEIGHT }}
                  />
                </li>
              ))}
            </ul>
          </div>

          <ul className="flex justify-between gap-[7px] px-2.5 pt-[7px]">
            {days.map((day) => (
              <li
                key={day.label}
                className="min-w-0 flex-1 text-center text-[10px] tracking-[-0.023em] whitespace-nowrap text-muted"
              >
                {day.label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <ul className="mt-3 flex justify-center gap-3.5 text-[11px] tracking-[-0.023em] text-muted">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-1.5 rounded-full bg-barstrong" />
          {o.seriesRetrieval}
        </li>
      </ul>
    </div>
  );
}
