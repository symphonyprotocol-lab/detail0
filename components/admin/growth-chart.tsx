import { adminCopy, GROWTH_SCALE_MAX, type GrowthPoint } from '@/lib/admin/demo-data';
import { fill } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';

/** Plot box in SVG units; the shape scales to whatever width the card gets. */
const WIDTH = 640;
const HEIGHT = 170;

function coordinates(points: GrowthPoint[], read: (point: GrowthPoint) => number): string {
  const step = WIDTH / (points.length - 1);
  return points
    .map((point, index) => {
      const x = index * step;
      const y = HEIGHT - (read(point) / GROWTH_SCALE_MAX) * HEIGHT;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/**
 * Sign-up and paid-conversion areas -- design source `oxEhj`, `用户增长`.
 *
 * Two filled polylines rather than a chart library: the design plots a fixed
 * ceiling over a fixed number of days, so each point is a direct function of
 * its value, exactly like the dashboard's usage bars.
 */
export async function GrowthChart() {
  const t = await getMessages();
  const o = t.admin.overview;
  const { growth } = adminCopy(t);

  const series = [
    { id: 'users', points: coordinates(growth, (p) => p.users), stroke: '#00ad8d', fill: '#00ad8d' },
    { id: 'paid', points: coordinates(growth, (p) => p.paid), stroke: '#85d8ca', fill: '#85d8ca' },
  ];

  return (
    <div className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${o.growthTitle} · ${o.growthSubtitle}`}
        className="h-[170px] w-full"
      >
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1={0}
            x2={WIDTH}
            y1={HEIGHT * fraction}
            y2={HEIGHT * fraction}
            stroke="var(--color-line)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {series.map((line) => (
          <g key={line.id}>
            <polygon
              points={`0,${HEIGHT} ${line.points} ${WIDTH},${HEIGHT}`}
              fill={line.fill}
              fillOpacity={0.14}
            />
            <polyline
              points={line.points}
              fill="none"
              stroke={line.stroke}
              strokeWidth={2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}
      </svg>

      <ul className="flex justify-between">
        {growth.map((point, index) => (
          <li
            key={point.label ?? index}
            title={fill(o.pointTitle, {
              day: point.label ?? '',
              users: point.users,
              paid: point.paid,
            })}
            className="text-[11px] tracking-[-0.023em] whitespace-nowrap text-muted"
            aria-hidden={point.label ? undefined : true}
          >
            {point.label ?? ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
