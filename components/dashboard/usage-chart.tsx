import { dashboardCopy, USAGE_SCALE_MAX } from '@/lib/dashboard/demo-data';
import { fill } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';

/** Plot body height in px; the y axis runs 0..USAGE_SCALE_MAX over this span. */
const PLOT_HEIGHT = 216;
const TICKS = [120, 80, 40, 0];

/**
 * Stacked call-volume bars -- design source frame `C06o6`.
 *
 * Plain layout rather than a chart library: the design draws fixed ticks and a
 * fixed ceiling, so height is a direct function of the value.
 */
export async function UsageChart() {
  const t = await getMessages();
  const o = t.dashboard.overview;
  const usageDays = dashboardCopy(t).usageDays;

  return (
    <div>
      <div className="flex">
        <div className="relative w-8 shrink-0" style={{ height: PLOT_HEIGHT }} aria-hidden>
          {TICKS.map((tick, index) => (
            <span
              key={tick}
              className="absolute right-[7px] -translate-y-1/2 text-[10px] leading-none tracking-[-0.023em] text-muted"
              style={{ top: (index * PLOT_HEIGHT) / (TICKS.length - 1) }}
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
            {TICKS.slice(0, -1).map((tick, index) => (
              <span
                key={tick}
                aria-hidden
                className="absolute inset-x-0 border-t-2 border-line"
                style={{ top: (index * PLOT_HEIGHT) / (TICKS.length - 1) }}
              />
            ))}

            <ul className="absolute inset-0 flex items-end justify-between gap-[7px] px-2.5">
              {usageDays.map((day) => {
                const scale = PLOT_HEIGHT / USAGE_SCALE_MAX;
                return (
                  <li
                    key={day.label}
                    className="flex min-w-0 flex-1 flex-col justify-end"
                    title={fill(o.barTitle, {
                      day: day.label,
                      retrieval: day.retrieval,
                      docs: day.docs,
                    })}
                  >
                    <span
                      className="mx-auto flex w-[23px] max-w-full flex-col justify-end overflow-hidden rounded-t bg-bar"
                      style={{ height: (day.retrieval + day.docs) * scale }}
                    >
                      <span
                        className="block bg-barstrong"
                        style={{ height: day.retrieval * scale }}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <ul className="flex justify-between gap-[7px] px-2.5 pt-[7px]">
            {usageDays.map((day) => (
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
        {[
          { label: o.seriesRetrieval, dot: 'bg-barstrong' },
          { label: o.seriesDocs, dot: 'bg-bar' },
        ].map((series) => (
          <li key={series.label} className="flex items-center gap-1.5">
            <span aria-hidden className={`size-1.5 rounded-full ${series.dot}`} />
            {series.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
