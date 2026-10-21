import { useState } from 'react';

/** Single-series column chart with a hover tooltip per bar. */
export function BarChart({ data, valueKey, labelKey, format = (v) => v, height = 140, label }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...data.map((d) => d[valueKey] || 0));
  return (
    <figure className="bar-chart" aria-label={label}>
      <div className="bar-chart-plot" style={{ height }} dir="ltr" onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => {
          const v = d[valueKey] || 0;
          return (
            <div
              key={d[labelKey]}
              className={`bar-col ${hover === i ? 'hover' : ''}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              tabIndex={0}
              aria-label={`${d[labelKey]}: ${format(v)}`}
            >
              <i style={{ height: `${(v / max) * 100}%` }} />
            </div>
          );
        })}
        {hover !== null ? (
          <div className="chart-tip" style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}>
            <b>{format(data[hover][valueKey] || 0)}</b>
            <span>{data[hover][labelKey]}</span>
          </div>
        ) : null}
      </div>
      <div className="bar-chart-axis" dir="ltr">
        <span>{data[0]?.[labelKey]}</span>
        <span>{data[data.length - 1]?.[labelKey]}</span>
      </div>
    </figure>
  );
}

export function StatTile({ label, value, hint, tone }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <b>{value}</b>
      <span>{label}</span>
      {hint ? <small className="muted">{hint}</small> : null}
    </div>
  );
}

export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'دلوقتي';
  if (s < 3600) return `من ${Math.floor(s / 60)} د`;
  if (s < 86400) return `من ${Math.floor(s / 3600)} س`;
  return new Date(iso).toLocaleDateString('ar-EG');
}

export const RIGHTS_LABEL = { original: 'أصلي', licensed: 'مرخّص', pending: 'قيد المراجعة' };
export const STATUS_LABEL = { pending: 'في الانتظار', processing: 'بيتجهز', ready: 'جاهز', failed: 'فشل' };
