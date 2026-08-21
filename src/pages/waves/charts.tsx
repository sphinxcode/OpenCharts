/** SVG wave charts for the /waves dashboard.
 *
 * Both charts are computed straight from the feed at render time. Chart marks
 * use literal hex (they must not shift with theme tokens); page chrome around
 * them uses the app's semantic classes. Palette matches the terminal:
 * teal #14b8a6 accent, #d7dbe4 ink, #7a8291 muted, #ea3943 down, purple
 * #c084fc for Elliott labels (same as the terminal's `ell` color).
 */
import type { WaveFeed } from "./types.ts";

const GRID = "#191e29";
const MUTED = "#7a8291";
const INK = "#d7dbe4";
const TEAL = "#14b8a6";
const PURPLE = "#c084fc";
const RED = "#ea3943";
const GOLD = "#e3b341";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtUsd(v: number): string {
  if (v >= 1000) return `$${Math.round(v / 1000)}k`;
  if (v >= 1) return `$${Math.round(v)}`;
  return `$${v.toFixed(2)}`;
}

function pathFrom(pts: [number, number][]): string {
  return pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

/** Wave label bubble, offset above tops / below bottoms so it clears the line. */
function WaveLabel({ x, y, label, up }: { x: number; y: number; label: string; up: boolean }) {
  const yy = up ? y - 16 : y + 16;
  return (
    <g>
      <circle cx={x} cy={yy} r={10} fill="#0b0d12" stroke={PURPLE} strokeWidth={1.5} />
      <text x={x} y={yy + 3.5} fontSize={10.5} fontWeight={600} fill={PURPLE}
        textAnchor="middle">{label}</text>
    </g>
  );
}

/** The last ~2 years, linear scale: live legs, zones, invalidation. */
export function RecentChart({ feed }: { feed: WaveFeed }) {
  const W = 700, H = 380, RIGHT = 96, PAD_TOP = 12, PAD_BOT = 40;
  const series = feed.series_recent;
  const zones = feed.readings.filter((r) => r.zone);
  const prices = series.map(([, p]) => p)
    .concat(zones.flatMap((r) => r.zone))
    .concat(feed.readings.map((r) => r.invalidation ?? 0).filter(Boolean));
  const lo = Math.min(...prices) * 0.93;
  const hi = Math.max(...prices) * 1.04;
  const t0 = series[0][0], t1 = series[series.length - 1][0];
  const dayspan = (Date.parse(t1) - Date.parse(t0)) / 86400000;
  const X = (d: string) => ((Date.parse(d) - Date.parse(t0)) / 86400000 / dayspan) * W;
  const Y = (p: number) => PAD_TOP + (1 - (p - lo) / (hi - lo)) * (H - PAD_TOP - PAD_BOT);

  const pts: [number, number][] = series.map(([d, p]) => [X(d), Y(p)]);
  const nowX = W, nowY = Y(feed.price_now);

  // y gridlines on round steps
  const step = (hi - lo) > 60000 ? 20000 : 10000;
  const gys: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v < hi; v += step) gys.push(v);
  // x ticks every ~4 months
  const xt: string[] = [];
  for (let t = Date.parse(t0); t <= Date.parse(t1); t += 86400000) {
    const d = new Date(t);
    if (d.getUTCDate() === 1 && d.getUTCMonth() % 4 === 1) xt.push(d.toISOString().slice(0, 10));
  }

  // zone bands sit in the projection margin, teal for the leading reading
  const leading = zones[0];
  const alt = zones.find((r) => r !== leading && r.degree === leading?.degree);
  const inval = leading?.invalidation ?? null;

  // wave labels inside the window: root waves + live legs
  const waveMarks = feed.waves.filter((w) => w.date >= t0)
    .map((w) => ({ ...w, up: !["II", "IV", "0"].includes(w.label) }));
  const legMarks = feed.live_legs.map((l, i) => ({
    label: l.label, date: l.to.date, price: l.to.price,
    up: i % 2 === 1, // A ends a down-leg, B a bounce top, alternating
  }));

  const bandX = W * 0.79;
  return (
    <svg viewBox={`0 0 ${W + RIGHT + 14} ${H + 22}`} className="block w-full">
      {gys.map((v) => (
        <g key={v}>
          <line x1={0} y1={Y(v)} x2={W} y2={Y(v)} stroke={GRID} strokeWidth={1} />
          <text x={W + 8} y={Y(v) + 4} fontSize={11} fill={MUTED}
            className="font-mono">{fmtUsd(v)}</text>
        </g>
      ))}
      {xt.map((d) => (
        <text key={d} x={X(d)} y={H + 14} fontSize={11} fill={MUTED} textAnchor="middle"
          className="font-mono">
          {MONTHS[new Date(d).getUTCMonth()]} {String(new Date(d).getUTCFullYear()).slice(2)}
        </text>
      ))}

      {leading && (
        <g>
          <rect x={bandX} y={Y(leading.zone[1])} width={W + RIGHT - bandX}
            height={Y(leading.zone[0]) - Y(leading.zone[1])}
            fill="rgba(20,184,166,.13)" stroke="rgba(20,184,166,.55)"
            strokeWidth={1} strokeDasharray="4 3" />
          <text x={bandX + 8} y={Y(leading.zone[1]) + 16} fontSize={11} fontWeight={600}
            fill={TEAL}>
            zone {leading.running} · {fmtUsd(leading.zone[0])}–{fmtUsd(leading.zone[1])}
          </text>
        </g>
      )}
      {alt && (
        <g>
          <rect x={bandX} y={Y(alt.zone[1])} width={W + RIGHT - bandX}
            height={Y(alt.zone[0]) - Y(alt.zone[1])}
            fill="rgba(227,179,65,.09)" stroke="rgba(227,179,65,.45)"
            strokeWidth={1} strokeDasharray="4 3" />
          <text x={bandX + 8} y={Y(alt.zone[1]) + 16} fontSize={11} fontWeight={600}
            fill={GOLD}>
            alternate · {fmtUsd(alt.zone[0])}–{fmtUsd(alt.zone[1])}
          </text>
        </g>
      )}
      {inval != null && (
        <g>
          <line x1={0} y1={Y(inval)} x2={W + RIGHT} y2={Y(inval)} stroke={RED}
            strokeWidth={1} strokeDasharray="6 4" />
          <text x={4} y={Y(inval) - 6} fontSize={11} fill={RED} className="font-mono">
            count invalid above {fmtUsd(inval)}
          </text>
        </g>
      )}

      <path d={pathFrom(pts)} fill="none" stroke={INK} strokeWidth={2}
        strokeLinejoin="round" strokeLinecap="round" />

      {waveMarks.map((w) => (
        <WaveLabel key={w.label} x={X(w.date)} y={Y(w.price)} label={w.label} up={w.up} />
      ))}
      {legMarks.map((l) => (
        <WaveLabel key={l.label} x={X(l.date)} y={Y(l.price)} label={l.label} up={l.up} />
      ))}

      <circle cx={nowX} cy={nowY} r={4} fill={TEAL} stroke="#0b0d12" strokeWidth={2} />
    </svg>
  );
}

/** The whole count since inception, log scale. */
export function FullHistoryChart({ feed }: { feed: WaveFeed }) {
  const W = 950, H = 400, RIGHT = 70, PAD_TOP = 26, PAD_BOT = 36;
  const series = feed.series_full;
  const prices = series.map(([, p]) => p);
  const lo = Math.min(...prices), hi = Math.max(...prices) * 1.4;
  const lgLo = Math.log10(Math.max(lo, 1e-6)), lgHi = Math.log10(hi);
  const t0 = series[0][0], t1 = series[series.length - 1][0];
  const span = Date.parse(t1) - Date.parse(t0);
  const X = (d: string) => ((Date.parse(d) - Date.parse(t0)) / span) * W;
  const Y = (p: number) =>
    PAD_TOP + (1 - (Math.log10(Math.max(p, 1e-6)) - lgLo) / (lgHi - lgLo)) * (H - PAD_TOP - PAD_BOT);

  const pts: [number, number][] = series.map(([d, p]) => [X(d), Y(p)]);
  const decades = [0.1, 1, 10, 100, 1000, 10000, 100000].filter((v) => v > lo && v < hi);
  const years: string[] = [];
  for (let y = new Date(t0).getUTCFullYear() + 1; y <= new Date(t1).getUTCFullYear(); y += 2) {
    years.push(`${y}-01-01`);
  }
  const marks = feed.waves.filter((w) => w.label !== "0")
    .map((w) => ({ ...w, up: !["II", "IV"].includes(w.label) }));

  return (
    <svg viewBox={`0 0 ${W + RIGHT} ${H + 18}`} className="block w-full">
      {decades.map((v) => (
        <g key={v}>
          <line x1={0} y1={Y(v)} x2={W} y2={Y(v)} stroke={GRID} strokeWidth={1} />
          <text x={W + 8} y={Y(v) + 4} fontSize={11} fill={MUTED}
            className="font-mono">{fmtUsd(v)}</text>
        </g>
      ))}
      {years.map((d) => (
        <text key={d} x={X(d)} y={H + 12} fontSize={11} fill={MUTED} textAnchor="middle"
          className="font-mono">{d.slice(0, 4)}</text>
      ))}
      <path d={pathFrom(pts)} fill="none" stroke={TEAL} strokeWidth={1.8}
        strokeLinejoin="round" strokeLinecap="round" />
      {marks.map((w) => (
        <WaveLabel key={w.label} x={X(w.date)} y={Y(w.price)} label={w.label} up={w.up} />
      ))}
    </svg>
  );
}
