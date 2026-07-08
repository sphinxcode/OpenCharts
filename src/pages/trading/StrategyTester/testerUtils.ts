/**
 * Small formatting/derivation helpers shared across the Strategy Tester tabs
 * (plan U9). Kept out of `mappers.ts` because these are pure presentation
 * concerns (duration strings, the profitability-gate check), not part of the
 * verified backend-result mapping contract.
 */
import type { RawTrade } from "../../../services/freqtrade/mappers.ts";

export interface ProfitabilityCheck {
  met: boolean;
  /** Profile B — the design's primary bar: >=51% win rate & >=3R. */
  profileBMet: boolean;
  /** Profile A — the looser fallback bar: >=31% win rate & >=6R. */
  profileAMet: boolean;
}

/**
 * R8's profitability gate: MET iff (winRate>=51 & avgRR>=3) OR
 * (winRate>=31 & avgRR>=6). Both comparisons are inclusive (`>=`) per the
 * plan's boundary test scenarios (51.0/3.0 -> MET, 50.9/2.9 -> NOT MET).
 * `avgRR` undefined (e.g. zero trades) is treated as 0 — never met.
 */
export function checkProfitability(winRatePct: number, avgRR: number | undefined): ProfitabilityCheck {
  const rr = avgRR ?? 0;
  const profileBMet = winRatePct >= 51 && rr >= 3;
  const profileAMet = winRatePct >= 31 && rr >= 6;
  return { met: profileBMet || profileAMet, profileBMet, profileAMet };
}

/** Freqtrade backtest `trade_duration` is in minutes (UNVERIFIED against a
 *  live payload — see U9 report). Mean over closed trades that report one. */
export function avgHoldMinutes(trades: RawTrade[]): number | undefined {
  const durations = trades
    .filter((t) => !t.is_open)
    .map((t) => t.trade_duration)
    .filter((d): d is number => typeof d === "number" && Number.isFinite(d));
  if (durations.length === 0) return undefined;
  return durations.reduce((sum, d) => sum + d, 0) / durations.length;
}

/** Minutes -> compact "Xd Yh" / "Xh Ym" / "Nm" string. */
export function formatDuration(minutes: number | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  const total = Math.round(minutes);
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** `YYYYMMDD-YYYYMMDD` (the backtest `timerange` param) -> a readable range. */
export function formatTimerange(timerange: string | null | undefined): string {
  if (!timerange) return "—";
  const [start, end] = timerange.split("-");
  const fmt = (s: string | undefined): string | null => {
    if (!s || s.length !== 8) return null;
    const y = s.slice(0, 4);
    const m = s.slice(4, 6);
    const d = s.slice(6, 8);
    const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" }).format(date);
  };
  const startFmt = fmt(start);
  const endFmt = fmt(end);
  if (!startFmt || !endFmt) return timerange;
  return `${startFmt} – ${endFmt}`;
}
