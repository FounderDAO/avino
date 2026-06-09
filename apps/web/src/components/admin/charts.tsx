/**
 * Лёгкие SVG-графики админки (порт apps/claudeDesign/scripts/admin-charts.jsx).
 * Цвета — через CSS-переменные токенов, размеры viewBox 1:1 с прототипом.
 */

interface LineAreaProps {
  data: number[];
  labels: string[];
  w?: number;
  h?: number;
}

/** Линейный график с заливкой области (объявления за год). */
export function LineArea({ data, labels, w = 560, h = 200 }: LineAreaProps) {
  const pad = { l: 8, r: 8, t: 12, b: 22 };
  const max = Math.max(...data) * 1.1;
  const min = Math.min(...data) * 0.85;
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const x = (i: number) => pad.l + (i / (data.length - 1)) * iw;
  const y = (v: number) => pad.t + ih - ((v - min) / (max - min)) * ih;
  const line = data
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ');
  const area = line + ` L${x(data.length - 1).toFixed(1)},${pad.t + ih} L${pad.l},${pad.t + ih} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto' }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--teal)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--teal)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={pad.l} x2={w - pad.r} y1={pad.t + ih * g} y2={pad.t + ih * g} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 4" />
      ))}
      <path d={area} fill="url(#ag)" />
      <path d={line} fill="none" stroke="var(--teal)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((v, i) =>
        i % 2 === 0 ? <circle key={i} cx={x(i)} cy={y(v)} r="3" fill="#fff" stroke="var(--teal)" strokeWidth="2" /> : null,
      )}
      {labels.map((m, i) =>
        i % 2 === 0 ? (
          <text key={i} x={x(i)} y={h - 6} fontSize="11" fill="var(--muted)" textAnchor="middle">{m}</text>
        ) : null,
      )}
    </svg>
  );
}

interface BarsProps {
  data: [string, number][];
  w?: number;
  h?: number;
}

/** Столбчатый график (объявления по районам). */
export function Bars({ data, w = 320, h = 220 }: BarsProps) {
  const max = Math.max(...data.map((d) => d[1])) * 1.1;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto' }}>
      {data.map((d, i) => {
        const bh = (d[1] / max) * (h - 42);
        const x = (i + 0.5) * (w / data.length);
        return (
          <g key={d[0]}>
            <rect x={x - 18} y={h - 26 - bh} width="36" height={bh} rx="5" fill={i === 0 ? 'var(--red)' : 'var(--teal)'} opacity={i === 0 ? 1 : 0.82} />
            <text x={x} y={h - 26 - bh - 5} fontSize="11" fontWeight="700" fill="var(--ink)" textAnchor="middle">{(d[1] / 1000).toFixed(1)}k</text>
            <text x={x} y={h - 9} fontSize="10.5" fill="var(--muted)" textAnchor="middle">{d[0]}</text>
          </g>
        );
      })}
    </svg>
  );
}

interface DonutProps {
  buy: number;
  rent: number;
  size?: number;
}

/** Кольцевая диаграмма (покупка / аренда). */
export function Donut({ buy, size = 180 }: DonutProps) {
  const r = 64;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;
  const buyLen = (buy / 100) * c;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--teal)" strokeWidth="22" />
      <circle
        cx={cx} cy={cy} r={r} fill="none" stroke="var(--red)" strokeWidth="22"
        strokeDasharray={`${buyLen} ${c - buyLen}`} strokeDashoffset={c / 4}
        transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="butt"
      />
      <text x={cx} y={cy - 4} fontSize="26" fontWeight="800" fill="var(--ink)" textAnchor="middle">{buy}%</text>
      <text x={cx} y={cy + 16} fontSize="12" fill="var(--muted)" textAnchor="middle">покупка</text>
    </svg>
  );
}
