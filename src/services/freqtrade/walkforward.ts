/**
 * Walk-forward / out-of-sample validation (Trading Lab).
 *
 * The single most important correctness feature for a signals lab: split the
 * backtest period into an **in-sample** (older, "train") window and an
 * **out-of-sample** (recent, "validate") window, backtest each, and measure
 * how much performance *degrades* out-of-sample. A strategy that looks great
 * in-sample but collapses out-of-sample is curve-fit — the backtest is lying.
 *
 * The verdict measures CONSISTENCY (overfit detection), which is separate from
 * PROFITABILITY (the ≥51%@3R / ≥31%@6R gate). A consistently-losing strategy is
 * "robust/consistent" AND "not met" — that's an honest, non-overfit result.
 */
import {
  startBacktest,
  pollBacktest,
  mapBacktestResult,
  type MappedBacktestResults,
} from "./mappers.ts";
import { checkProfitability } from "../../pages/trading/StrategyTester/testerUtils.ts";

// Per-timeframe walk-forward window (days). Enough candles to split 70/30
// meaningfully without an oversized, slow two-pass backtest on the small box.
const TF_LOOKBACK_DAYS: Record<string, number> = {
  "1m": 30,
  "5m": 90,
  "15m": 180,
  "30m": 365,
  "1h": 730,
  "4h": 1095,
  "1d": 1825,
  "1w": 2920,
};

function fmt(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

function parseYmd(s: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s.trim());
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}

/** Default walk-forward window for a timeframe, ending "now". */
export function defaultWalkforwardRange(timeframe: string): string {
  const days = TF_LOOKBACK_DAYS[timeframe] ?? 365;
  const end = new Date();
  return `${fmt(new Date(end.getTime() - days * 86_400_000))}-${fmt(end)}`;
}

/** Split a `YYYYMMDD-YYYYMMDD` range by DATE at `ratio` of the span. */
export function splitTimerange(
  full: string,
  ratio = 0.7,
): { inSample: string; outOfSample: string } | null {
  const [a, b] = full.split("-");
  const start = parseYmd(a);
  const end = parseYmd(b);
  if (!start || !end || end.getTime() <= start.getTime()) return null;
  const splitMs = start.getTime() + (end.getTime() - start.getTime()) * ratio;
  const split = fmt(new Date(splitMs));
  return { inSample: `${a}-${split}`, outOfSample: `${split}-${b}` };
}

async function runOne(
  strategy: string,
  timeframe: string,
  timerange: string,
  onPct: (pct: number) => void,
): Promise<MappedBacktestResults> {
  await startBacktest({ strategy, timeframe, timerange, enable_protections: false });
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const st = await pollBacktest();
    if (typeof st.progress === "number") onPct(Math.round(st.progress * 100));
    if (st.running === false && st.backtest_result) return mapBacktestResult(st.backtest_result, strategy);
    if (st.status === "error") throw new Error(st.status_msg || "Backtest error");
  }
  throw new Error("Walk-forward backtest timed out");
}

export interface WalkForwardResult {
  inSample: MappedBacktestResults;
  outOfSample: MappedBacktestResults;
  isRange: string;
  oosRange: string;
}

/** Runs the in-sample then out-of-sample backtest sequentially (Freqtrade runs
 *  one at a time). `onProgress(phase, pct)` drives the UI. */
export async function runWalkForward(
  params: { strategy: string; timeframe: string; fullTimerange?: string },
  onProgress?: (phase: "in-sample" | "out-of-sample", pct: number) => void,
): Promise<WalkForwardResult> {
  const full = params.fullTimerange || defaultWalkforwardRange(params.timeframe);
  const split = splitTimerange(full, 0.7);
  if (!split) throw new Error("Could not split the walk-forward range");
  onProgress?.("in-sample", 0);
  const inSample = await runOne(params.strategy, params.timeframe, split.inSample, (p) =>
    onProgress?.("in-sample", p),
  );
  onProgress?.("out-of-sample", 0);
  const outOfSample = await runOne(params.strategy, params.timeframe, split.outOfSample, (p) =>
    onProgress?.("out-of-sample", p),
  );
  return { inSample, outOfSample, isRange: split.inSample, oosRange: split.outOfSample };
}

// ── Reality gap ─────────────────────────────────────────────────────────────

export type Verdict = "robust" | "caution" | "overfit";

export interface RealityGap {
  winRateRatio: number;
  pfRatio: number;
  avgRRRatio: number;
  verdict: Verdict;
  isGateMet: boolean;
  oosGateMet: boolean;
  headline: string;
}

function ratio(oos: number, is: number): number {
  if (!Number.isFinite(is) || is === 0) return oos > 0 ? 1 : 0;
  const r = oos / is;
  return Number.isFinite(r) ? r : 0;
}

export function realityGap(is: MappedBacktestResults, oos: MappedBacktestResults): RealityGap {
  const isGateMet = checkProfitability(is.winRate, is.avgRR).met;
  const oosGateMet = checkProfitability(oos.winRate, oos.avgRR).met;
  const winRateRatio = ratio(oos.winRate, is.winRate);
  const pfRatio = ratio(oos.pf, is.pf);
  const avgRRRatio = ratio(oos.avgRR ?? 0, is.avgRR ?? 0);

  // Overfitting is measured by how much the win-rate + profit-factor RETAIN
  // out-of-sample. The gate-flip (passes in-sample, fails out-of-sample) is the
  // clearest overfit signal there is.
  const key = Math.min(winRateRatio, pfRatio);
  let verdict: Verdict;
  if (isGateMet && !oosGateMet) verdict = "overfit";
  else if (key >= 0.8) verdict = "robust";
  else if (key >= 0.5) verdict = "caution";
  else verdict = "overfit";

  const wrPct = Math.round(winRateRatio * 100);
  const gateNote = oosGateMet
    ? " and it still clears the profitability bar."
    : isGateMet
      ? " — and it drops below the profitability bar it passed in-sample."
      : " (neither window clears the profitability bar).";
  const headline =
    verdict === "robust"
      ? `Out-of-sample holds up — win rate is ${wrPct}% of in-sample${gateNote} The result looks consistent, not curve-fit.`
      : verdict === "caution"
        ? `Out-of-sample degrades to ${wrPct}% of in-sample${gateNote} Treat with caution — partly overfit.`
        : `Out-of-sample collapses to ${wrPct}% of in-sample${gateNote} This looks curve-fit — don't trust the in-sample backtest.`;

  return { winRateRatio, pfRatio, avgRRRatio, verdict, isGateMet, oosGateMet, headline };
}
