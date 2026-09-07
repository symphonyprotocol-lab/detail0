import { chartCeiling, labelledIndices, type DailyPoint } from '@/lib/domain/overview';
import { fill } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';

/** Plot box in SVG units; the shape scales to whatever width the card gets. */
const WIDTH = 640;
const HEIGHT = 170;

/** Horizontal position of a point, as a fraction of the plot width. */
function fraction(index: number, count: number): number {
  return count > 1 ? index / (count - 1) : 0.5;
}

function coordinates(points: DailyPoint[], ceiling: number, read: (point: DailyPoint) => number): string {
  return points
    .map((point, index) => {
      const x = fraction(index, points.length) * WIDTH;
      const y = HEIGHT - (read(point) / ceiling) * HEIGHT;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** `M/D` of a UTC day, the way the design labels the axis. */
function dayLabel(day: Date): string {
  return `${day.getUTCMonth() + 1}/${day.getUTCDate()}`;
}

/**
 * Sign-up and paid areas -- design source `oxEhj`, `用户增长`.
 *
 * Two filled polylines rather than a chart library: one point per day of the
 * window, drawn against a ceiling rounded up from the tallest day, so a
 * platform with nine sign-ups a day is not plotted flat along the floor of a
 * scale built for three hundred.
 *
 * Axis labels are placed at the same fraction of the width as the point they
 * name, so a tick sits under its day however long the window is; every day
 * has a hover target inside the plot that reads its figures.
 */
export async function GrowthChart({
  points,
  showPaid = true,
}: {
  points: DailyPoint[];
  /** Whether the paid series is drawn; off when the viewer may not see billing. */
  showPaid?: boolean;
}) {
  const t = await getMessages();
  const o = t.admin.overview;

  const ceiling = chartCeiling(
    Math.max(0, ...points.map((point) => Math.max(point.users, showPaid ? point.paid : 0))),
  );
  const labelled = new Set(labelledIndices(points.length));

  const series = [
    { id: 'users', points: coordinates(points, ceiling, (p) => p.users), colour: '#00ad8d' },
    ...(showPaid
      ? [{ id: 'paid', points: coordinates(points, ceiling, (p) => p.paid), colour: '#85d8ca' }]
      : []),
  ];

  const pointTitle = (point: DailyPoint) =>
    fill(o.pointTitle, {
      day: dayLabel(point.day),
      users: point.users,
      paid: showPaid ? point.paid : '—',
    });

  /* Each day's hover target: a column as wide as the gap between points. */
  const column = points.length > 1 ? WIDTH / (points.length - 1) : WIDTH;

  return (
    <div className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${o.growthTitle} · ${o.growthSubtitle}`}
        className="h-[170px] w-full"
      >
        {[0.25, 0.5, 0.75].map((fractionOfHeight) => (
          <line
            key={fractionOfHeight}
            x1={0}
            x2={WIDTH}
            y1={HEIGHT * fractionOfHeight}
            y2={HEIGHT * fractionOfHeight}
            stroke="var(--color-line)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {series.map((line) => (
          <g key={line.id}>
            <polygon
              points={`0,${HEIGHT} ${line.points} ${WIDTH},${HEIGHT}`}
              fill={line.colour}
              fillOpacity={0.14}
            />
            <polyline
              points={line.points}
              fill="none"
              stroke={line.colour}
              strokeWidth={2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}
        {points.map((point, index) => (
          <rect
            key={point.day.toISOString()}
            x={fraction(index, points.length) * WIDTH - column / 2}
            y={0}
            width={column}
            height={HEIGHT}
            fill="transparent"
          >
            <title>{pointTitle(point)}</title>
          </rect>
        ))}
      </svg>

      <div className="relative h-4">
        {points.map((point, index) =>
          labelled.has(index) ? (
            <span
              key={point.day.toISOString()}
              title={pointTitle(point)}
              className="absolute top-0 text-[11px] tracking-[-0.023em] whitespace-nowrap text-muted"
              style={{
                left: `${fraction(index, points.length) * 100}%`,
                transform:
                  index === 0
                    ? 'none'
                    : index === points.length - 1
                      ? 'translateX(-100%)'
                      : 'translateX(-50%)',
              }}
            >
              {dayLabel(point.day)}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}
