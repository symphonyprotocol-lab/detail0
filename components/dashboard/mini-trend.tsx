import type { ReactNode } from 'react';
import { PANEL } from '@/components/dashboard/ui';

/** Plot height in px; every bar is scaled against `max` over this span. */
const PLOT_HEIGHT = 84;
const LABEL_HEIGHT = 17;

export interface TrendBar {
  /** Only every other bar carries a label in the design. */
  label?: string;
  value: number;
}

/**
 * Twelve-bar trend card -- design source frames `i027cz` and `L4Z2w`.
 *
 * No axis: the design labels the total in the header instead, so the bars only
 * need to be proportional to each other.
 */
export function MiniTrend({
  title,
  subtitle,
  legend,
  bars,
  max,
  format,
}: {
  title: string;
  subtitle: string;
  legend: ReactNode;
  bars: TrendBar[];
  max: number;
  format: (value: number) => string;
}) {
  return (
    <section className={`${PANEL} flex flex-col gap-[15px] px-[23px] py-[21px]`}>
      <div className="flex flex-wrap items-start justify-between gap-3.5">
        <div className="flex flex-col gap-1">
          <h2 className="text-[14px] leading-[1.5] text-ink">{title}</h2>
          <p className="text-[11px] text-muted">{subtitle}</p>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-steel">
          <span aria-hidden className="size-[7px] shrink-0 rounded-full bg-brand" />
          {legend}
        </span>
      </div>

      <ul className="flex items-end gap-1 border-b border-line px-[5px] pb-0.5 sm:gap-[11px]">
        {bars.map((bar, index) => (
          <li
            key={bar.label ?? index}
            className="flex min-w-0 flex-1 flex-col items-center justify-end"
            style={{ height: PLOT_HEIGHT + LABEL_HEIGHT }}
            title={`${bar.label ?? ''} ${format(bar.value)}`}
          >
            <span
              className="w-full max-w-6 rounded-t bg-linear-to-b from-bar to-brand"
              style={{ height: (bar.value / max) * PLOT_HEIGHT }}
            />
            <span
              className="flex h-[17px] items-start pt-[5px] text-[10px] text-muted"
              aria-hidden={bar.label ? undefined : true}
            >
              {bar.label ?? ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
