/**
 * Freqtrade response → app-shape mappers, plus the backtest transport calls
 * (plan U8 / KTD1 / KTD6).
 */
import { request } from "../api/request.ts";
import type { Candle } from "../schemas.ts";
import type { PairHistoryResponse } from "./client.ts";

// ── Candles + indicator columns (R6, U10) ───────────────────────────────────

const DATE_KEYS = new Set(["date", "time", "open_time", "timestamp"]);

/** Freqtrade's pandas→JSON date export is epoch **milliseconds**; tolerate a
 *  seconds-already number or an ISO string too rather than assume one shape
 *  we haven't seen a live sample of. Returns epoch **seconds** — the app's
 *  `Candle.time` unit (see `services/demo/candles.ts`). */
function toEpochSeconds(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
}

export interface MappedIndicatorPoint {
  time: number;
  value: number;
}

export interface MappedCandles {
  candles: Candle[];
  /** One entry per non-OHLCV `populate_indicators` column (verified set:
   *  rsi, vol_avg, bb_lower, bb_mid, bb_upper), keyed by exact column name.
   *  A column absent from `columns[]` is simply absent here — never a crash
   *  (U8 test scenario: "missing columns[] entry → mapper tolerates"). */
  indicators: Record<string, MappedIndicatorPoint[]>;
}

/**
 * Zips `PairHistory`'s positional `data: number[][]` rows against
 * `columns: string[]` (verified contract) into the app's `Candle` shape plus
 * a parallel map of indicator columns. Column order/casing is not assumed —
 * columns are located by name (case-insensitive). Rows missing a required
 * OHLC value, or the whole response missing a date/OHLC column, degrade to
 * an empty (not thrown) result — the adapter's offline/degraded-state
 * requirement extends to malformed responses, not just network failure.
 */
export function mapPairCandles(raw: PairHistoryResponse | null | undefined): MappedCandles {
  const columns = raw?.columns ?? [];
  const rows = raw?.data ?? [];
  const lower = columns.map((c) => c.toLowerCase());

  const dateIdx = lower.findIndex((c) => DATE_KEYS.has(c));
  const openIdx = lower.indexOf("open");
  const highIdx = lower.indexOf("high");
  const lowIdx = lower.indexOf("low");
  const closeIdx = lower.indexOf("close");
  const volumeIdx = lower.indexOf("volume");

  const indicators: Record<string, MappedIndicatorPoint[]> = {};
  if (dateIdx < 0 || openIdx < 0 || highIdx < 0 || lowIdx < 0 || closeIdx < 0) {
    return { candles: [], indicators };
  }

  const coreIdx = new Set([dateIdx, openIdx, highIdx, lowIdx, closeIdx, volumeIdx].filter((i) => i >= 0));
  const indicatorCols = columns
    .map((name, idx) => ({ name, idx }))
    .filter(({ idx }) => !coreIdx.has(idx));
  for (const { name } of indicatorCols) indicators[name] = [];

  const candles: Candle[] = [];
  for (const row of rows) {
    const time = toEpochSeconds(row[dateIdx]);
    if (time == null) continue;
    const open = Number(row[openIdx]);
    const high = Number(row[highIdx]);
    const low = Number(row[lowIdx]);
    const close = Number(row[closeIdx]);
    if ([open, high, low, close].some((v) => Number.isNaN(v))) continue;
    const volumeRaw = volumeIdx >= 0 ? Number(row[volumeIdx]) : 0;
    candles.push({ time, open, high, low, close, volume: Number.isNaN(volumeRaw) ? 0 : volumeRaw });

    for (const { name, idx } of indicatorCols) {
      const cell = row[idx];
      const num = typeof cell === "number" ? cell : cell == null ? NaN : Number(cell);
      if (!Number.isNaN(num)) indicators[name]!.push({ time, value: num });
    }
  }

  return { candles, indicators };
}

// ── Authoritative overlay reconciliation (R5, plan U10) ─────────────────────
// After a backtest, the server-computed `populate_indicators` columns from
// `/pair_candles` (via `mapPairCandles` above) are authoritative — they can
// diverge from the client-side TS preview (`lib/indicators.ts`) since the
// two implementations aren't guaranteed bit-identical. This is the "small
// helper" for that reconciliation: it locates the Bollinger columns (the one
// preview indicator with a clean 1:1 authoritative column mapping — `rsi`'s
// authoritative counterpart lives in the oscillator sub-pane, which isn't
// wired to this in U10; see the U10 report's TODO) inside a
// `mapPairCandles(...).indicators` map so a caller can draw them over the
// preview BOLL series.

export interface AuthoritativeBollinger {
  upper: MappedIndicatorPoint[];
  mid: MappedIndicatorPoint[];
  lower: MappedIndicatorPoint[];
}

/**
 * Picks the authoritative Bollinger Band columns (`bb_upper`/`bb_mid`/
 * `bb_lower`, VERIFIED-API-CONTRACT.md `/pair_candles` `columns[]`) out of a
 * `mapPairCandles(...).indicators` map. Column names are matched
 * case-insensitively and tolerant of the `bb_middle` alias some strategies
 * use instead of `bb_mid`. Returns `null` when any of the three columns is
 * missing or empty (e.g. the active strategy doesn't compute Bollinger, or
 * `/pair_candles` came back malformed/not-yet-loaded) — never a partial or
 * misleading overlay.
 */
export function pickAuthoritativeBollinger(
  indicators: Record<string, MappedIndicatorPoint[]>,
): AuthoritativeBollinger | null {
  const byLower = new Map(Object.entries(indicators).map(([k, v]) => [k.toLowerCase(), v]));
  const upper = byLower.get("bb_upper");
  const mid = byLower.get("bb_mid") ?? byLower.get("bb_middle");
  const lower = byLower.get("bb_lower");
  if (!upper?.length || !mid?.length || !lower?.length) return null;
  return { upper, mid, lower };
}

// ── Backtest transport (R6) ──────────────────────────────────────────────

export interface BacktestStartParams {
  strategy: string;
  timeframe: string;
  /** `YYYYMMDD-YYYYMMDD` */
  timerange: string;
  /** Verified: REQUIRED — omitting it 422s. Defaulted to `false` below if
   *  the caller doesn't pass one, but callers should pass it explicitly. */
  enable_protections?: boolean;
  dry_run_wallet?: number;
  stake_amount?: number | "unlimited";
  max_open_trades?: number;
  pairs?: string[];
}

export interface BacktestStatus {
  status: string;
  running: boolean;
  step?: string;
  /** 0..1 */
  progress: number;
  trade_count?: number;
  backtest_result?: RawBacktestResult;
  status_msg?: string;
}

/** `POST /backtest`. Verified: body REQUIRES `enable_protections`, or the
 *  server 422s (`{"detail":[{"type":"missing","loc":["body","enable_protections"]}]}`). */
export function startBacktest(params: BacktestStartParams) {
  return request<BacktestStatus>("/backtest", {
    method: "POST",
    body: JSON.stringify({ enable_protections: false, ...params }),
  });
}

/** `GET /backtest` — poll until `running:false && backtest_result` present. */
export function pollBacktest() {
  return request<BacktestStatus>("/backtest");
}

/** `GET /backtest/abort`. */
export function abortBacktest() {
  return request<BacktestStatus>("/backtest/abort");
}

// ── BacktestResult → UI `results` shape (KTD6/KTD7) ─────────────────────

export interface RawTrade {
  pair?: string;
  profit_abs?: number;
  profit_ratio?: number;
  /** Epoch ms, per Freqtrade's usual backtest JSON — see UNVERIFIED note. */
  open_timestamp?: number;
  close_timestamp?: number;
  open_date?: string;
  close_date?: string;
  is_open?: boolean;
  exit_reason?: string;
  /** VERIFIED (2026-07-08 live run) trade fields — see VERIFIED-API-CONTRACT.md
   *  "Backtest result shape". `initial_stop_loss_ratio` is the fixed-R stop
   *  distance (a negative fraction, e.g. -0.02) the exact avgRR/expR formulas
   *  below divide into `profit_ratio`. */
  is_short?: boolean;
  open_rate?: number;
  close_rate?: number;
  initial_stop_loss_ratio?: number;
  stop_loss_ratio?: number;
  enter_tag?: string;
  amount?: number;
  /** Trade duration — Freqtrade's usual backtest export unit is minutes. */
  trade_duration?: number;
  [key: string]: unknown;
}

/**
 * Exact per-trade R multiple (KTD7, VERIFIED-API-CONTRACT.md "Exact avgRR"):
 * `profit_ratio / abs(initial_stop_loss_ratio)`. Since the sample strategy's
 * stoploss is a fixed 1R, this is exact — not the `expectancy_ratio` proxy.
 * `undefined` when either field is missing/zero (older backend, or a trade
 * that predates the fixed-R stop) so callers can fall back gracefully.
 */
export function perTradeR(t: RawTrade): number | undefined {
  const stopRatio = t.initial_stop_loss_ratio;
  const profitRatio = t.profit_ratio;
  if (typeof stopRatio !== "number" || stopRatio === 0 || !Number.isFinite(stopRatio)) return undefined;
  if (typeof profitRatio !== "number" || !Number.isFinite(profitRatio)) return undefined;
  return profitRatio / Math.abs(stopRatio);
}

function mean(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export interface RawResultsPerPair {
  key?: string;
  trades?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  profit_total_abs?: number;
  profit_total?: number;
  [key: string]: unknown;
}

export interface RawStrategyResult {
  trades?: RawTrade[];
  /** Last entry is conventionally the "TOTAL" aggregate row (FreqUI convention). */
  results_per_pair?: RawResultsPerPair[];
  profit_total_abs?: number;
  profit_total?: number;
  profit_factor?: number;
  max_drawdown?: number;
  max_drawdown_account?: number;
  sharpe?: number;
  total_trades?: number;
  /** KTD7 MVP fallback proxy for real per-trade R — used only when no closed
   *  winning trade carries a usable `initial_stop_loss_ratio` (U9 now prefers
   *  the exact per-trade R computed via `perTradeR` inside `mapBacktestResult`). */
  expectancy_ratio?: number;
  /** VERIFIED top-level fields (VERIFIED-API-CONTRACT.md). Properties tab
   *  "Initial capital" + the equity-chart dashed baseline (U9). */
  starting_balance?: number;
  final_balance?: number;
  [key: string]: unknown;
}

export interface RawBacktestResult {
  strategy: Record<string, RawStrategyResult>;
  [key: string]: unknown;
}

export interface EquityPoint {
  time: number;
  value: number;
}

export interface MappedBacktestResults {
  net: number;
  netPct: number;
  /** 0-100. Zero-trades-safe (KTD6/U9: no divide-by-zero). */
  winRate: number;
  pf: number;
  maxdd: number;
  sharpe: number;
  total: number;
  wins: number;
  losses: number;
  draws: number;
  /** Cumulative `profit_abs`, sorted by `close_timestamp`, seeded 0 at the
   *  first `open_timestamp` — FreqUI's `CumProfitChart.vue` derivation
   *  (KTD6; the backend has no equity-curve endpoint). Absolute equity for
   *  display is `startingBalance + point.value` (see `EquityChart.tsx`). */
  eqPts: EquityPoint[];
  /** Sum of `trades[].profit_abs` by sign (KTD6). `grossL` is negative. */
  grossW: number;
  grossL: number;
  /** True when the exact per-trade R (via `initial_stop_loss_ratio`) wasn't
   *  computable for any closed winning trade and `avgRR` fell back to the
   *  `expectancy_ratio` proxy (KTD7 MVP fallback). U9 renders this "approx"
   *  and never treats it as a silent real R multiple. */
  avgRRApprox: boolean;
  /** Mean per-trade R (`perTradeR`) over winning closed trades (VERIFIED
   *  formula, supersedes the KTD7 approximation) — falls back to
   *  `expectancy_ratio` only when no winner has a usable stop ratio. */
  avgRR: number | undefined;
  /** Mean per-trade R over ALL closed trades (winners + losers) — the
   *  Performance tab's "Expectancy (R)" stat. `undefined` when no closed
   *  trade has a usable `initial_stop_loss_ratio` (added for U9; not part of
   *  U8's original field set). */
  expR: number | undefined;
  /** `starting_balance` from the raw result, defaulted to 0 (added for U9 —
   *  Properties "Initial capital" + the equity-chart dashed baseline; not
   *  part of U8's original field set since nothing consumed it yet). */
  startingBalance: number;
  /** `final_balance` if the backend returned it, else `startingBalance + net`. */
  finalEq: number;
  trades: RawTrade[];
}

/** Epoch ms for a trade's open/close instant. Tries the `_timestamp` int
 *  field first (assumed ms, per Freqtrade's usual export), falls back to the
 *  ISO `_date` string. UNVERIFIED against a live `backtest_result` payload —
 *  see U8 report. */
function tradeTimestampMs(t: RawTrade, key: "open" | "close"): number {
  const ts = key === "open" ? t.open_timestamp : t.close_timestamp;
  if (typeof ts === "number" && Number.isFinite(ts)) return ts > 1e12 ? ts : ts * 1000;
  const dateStr = key === "open" ? t.open_date : t.close_date;
  const parsed = typeof dateStr === "string" ? Date.parse(dateStr) : NaN;
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

/** Maps `BacktestResult.strategy[name]` → the Strategy Tester's `results`
 *  shape (KTD6). Tolerant of missing/empty `trades`/`results_per_pair` —
 *  returns all-zero metrics rather than throwing (U9 test scenario: zero
 *  trades → no divide-by-zero, empty states). */
export function mapBacktestResult(
  raw: RawBacktestResult | null | undefined,
  strategyName: string,
): MappedBacktestResults {
  const s: RawStrategyResult = raw?.strategy?.[strategyName] ?? {};
  const trades = s.trades ?? [];
  const closedTrades = trades.filter((t) => !t.is_open);

  const sortedByClose = [...closedTrades].sort(
    (a, b) => tradeTimestampMs(a, "close") - tradeTimestampMs(b, "close"),
  );
  const firstOpenMs = closedTrades.length
    ? Math.min(...closedTrades.map((t) => tradeTimestampMs(t, "open")))
    : Date.now();

  let cum = 0;
  let grossW = 0;
  let grossL = 0;
  const eqPts: EquityPoint[] = [{ time: Math.floor(firstOpenMs / 1000), value: 0 }];
  for (const t of sortedByClose) {
    const p = t.profit_abs ?? 0;
    cum += p;
    eqPts.push({ time: Math.floor(tradeTimestampMs(t, "close") / 1000), value: cum });
    if (p >= 0) grossW += p;
    else grossL += p;
  }

  const totalsRow = s.results_per_pair?.[s.results_per_pair.length - 1];
  const wins = totalsRow?.wins ?? closedTrades.filter((t) => (t.profit_abs ?? 0) > 0).length;
  const losses = totalsRow?.losses ?? closedTrades.filter((t) => (t.profit_abs ?? 0) < 0).length;
  const draws = totalsRow?.draws ?? closedTrades.filter((t) => (t.profit_abs ?? 0) === 0).length;
  const total = s.total_trades ?? closedTrades.length;
  const winRate = total > 0 ? (wins / total) * 100 : 0;

  // Exact avgRR (VERIFIED-API-CONTRACT.md "Exact avgRR", supersedes KTD7's
  // expectancy_ratio approximation): mean per-trade R over winning closed
  // trades. Falls back to expectancy_ratio only when no winner has a usable
  // `initial_stop_loss_ratio` (e.g. pre-fixed-R-stop backend data).
  const winningTrades = closedTrades.filter((t) => (t.profit_abs ?? 0) > 0);
  const exactAvgRR = mean(
    winningTrades.map(perTradeR).filter((r): r is number => r !== undefined),
  );
  const avgRR = exactAvgRR ?? s.expectancy_ratio;
  const avgRRApprox = exactAvgRR === undefined;

  // Expectancy in R (Performance tab) — mean per-trade R over ALL closed
  // trades (winners + losers), not just winners.
  const expR = mean(closedTrades.map(perTradeR).filter((r): r is number => r !== undefined));

  const net = s.profit_total_abs ?? 0;
  const startingBalance = s.starting_balance ?? 0;
  const finalEq = s.final_balance ?? startingBalance + net;

  return {
    net,
    netPct: s.profit_total ?? 0,
    winRate,
    pf: s.profit_factor ?? 0,
    maxdd: s.max_drawdown_account ?? s.max_drawdown ?? 0,
    sharpe: s.sharpe ?? 0,
    total,
    wins,
    losses,
    draws,
    eqPts,
    grossW,
    grossL,
    avgRRApprox,
    avgRR,
    expR,
    startingBalance,
    finalEq,
    trades,
  };
}
