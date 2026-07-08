/**
 * Walk-forward validation tab (Trading Lab). Runs an in-sample + out-of-sample
 * backtest and surfaces a "reality gap" verdict — the feature that stops an
 * overfit backtest from lying to you. See services/freqtrade/walkforward.ts.
 */
import { useState } from "react";
import type { MappedBacktestResults } from "../../../services/freqtrade/mappers.ts";
import {
  runWalkForward,
  realityGap,
  type RealityGap,
  type WalkForwardResult,
  type Verdict,
} from "../../../services/freqtrade/walkforward.ts";
import { checkProfitability } from "./testerUtils.ts";
import { cn } from "../../../lib/utils.ts";

export interface WalkForwardProps {
  strategyName: string | null;
  timeframe: string;
}

function pct(n: number | undefined, digits = 1): string {
  return n == null || !Number.isFinite(n) ? "—" : `${(n * 100).toFixed(digits)}%`;
}

function ResultColumn({ title, subtitle, r }: { title: string; subtitle: string; r: MappedBacktestResults }) {
  const gate = checkProfitability(r.winRate, r.avgRR);
  const cells: { label: string; value: string; cls?: string }[] = [
    { label: "Net %", value: pct(r.netPct), cls: r.netPct >= 0 ? "text-up" : "text-down" },
    { label: "Win rate", value: `${r.winRate.toFixed(1)}%` },
    { label: "Avg win:risk", value: r.avgRR == null ? "—" : `${r.avgRR.toFixed(2)}R` },
    { label: "Profit factor", value: Number.isFinite(r.pf) ? r.pf.toFixed(2) : "—" },
    { label: "Max drawdown", value: pct(Math.abs(r.maxdd)), cls: "text-down" },
    { label: "Trades", value: String(r.total) },
  ];
  return (
    <div className="flex-1 rounded border border-border">
      <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5">
        <div>
          <div className="text-xs font-semibold">{title}</div>
          <div className="font-mono text-[10px] text-muted-foreground">{subtitle}</div>
        </div>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-bold",
            gate.met ? "bg-up/15 text-up" : "bg-down/15 text-down",
          )}
        >
          {gate.met ? "MET" : "NOT MET"}
        </span>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-border">
        {cells.map((c) => (
          <div key={c.label} className="flex flex-col gap-0.5 px-2.5 py-1.5">
            <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{c.label}</span>
            <span className={cn("font-mono text-sm font-semibold", c.cls)}>{c.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const VERDICT_STYLE: Record<Verdict, { label: string; cls: string; ring: string }> = {
  robust: { label: "ROBUST", cls: "text-up", ring: "border-up/40 bg-up/10" },
  caution: { label: "CAUTION", cls: "text-warning", ring: "border-warning/40 bg-warning/10" },
  overfit: { label: "LIKELY OVERFIT", cls: "text-down", ring: "border-down/40 bg-down/10" },
};

export function WalkForward({ strategyName, timeframe }: WalkForwardProps) {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [phase, setPhase] = useState<{ p: "in-sample" | "out-of-sample"; pct: number } | null>(null);
  const [result, setResult] = useState<WalkForwardResult | null>(null);
  const [gap, setGap] = useState<RealityGap | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!strategyName || status === "running") return;
    setStatus("running");
    setError(null);
    setResult(null);
    setGap(null);
    setPhase({ p: "in-sample", pct: 0 });
    try {
      const res = await runWalkForward({ strategy: strategyName, timeframe }, (p, pctVal) =>
        setPhase({ p, pct: pctVal }),
      );
      setResult(res);
      setGap(realityGap(res.inSample, res.outOfSample));
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  const v = gap ? VERDICT_STYLE[gap.verdict] : null;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={status === "running" || !strategyName}
          className={cn(
            "rounded bg-accent px-3 py-1.5 text-xs font-bold text-accent-foreground transition-opacity",
            (status === "running" || !strategyName) && "opacity-60",
          )}
        >
          {status === "running"
            ? `Running ${phase?.p ?? ""} ${phase?.pct ?? 0}%…`
            : status === "done"
              ? "Re-run walk-forward"
              : "Run walk-forward"}
        </button>
        <span className="text-[11px] text-muted-foreground">
          Splits {timeframe} history 70/30 into train vs validate — checks whether the edge survives out-of-sample.
        </span>
      </div>

      {status === "idle" && (
        <div className="flex flex-1 items-center justify-center text-[11px] text-muted-foreground">
          Run a walk-forward test to check for overfitting.
        </div>
      )}
      {status === "error" && <div className="text-xs text-down">Walk-forward failed: {error}</div>}

      {result && gap && v && (
        <>
          {/* Reality-gap hero */}
          <div className={cn("rounded border px-3 py-2.5", v.ring)}>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Reality gap
              </span>
              <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-extrabold", v.cls)}>{v.label}</span>
            </div>
            <p className="text-xs leading-relaxed text-foreground">{gap.headline}</p>
            <div className="mt-1.5 flex gap-4 font-mono text-[10px] text-muted-foreground">
              <span>win-rate retained: {pct(gap.winRateRatio, 0)}</span>
              <span>profit-factor retained: {pct(gap.pfRatio, 0)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 md:flex-row">
            <ResultColumn title="In-sample (train)" subtitle={result.isRange} r={result.inSample} />
            <ResultColumn title="Out-of-sample (validate)" subtitle={result.oosRange} r={result.outOfSample} />
          </div>

          <p className="text-[10px] leading-relaxed text-muted-foreground">
            The verdict measures <span className="text-foreground">consistency</span> (overfit detection), not
            profitability — a strategy can be consistent yet still fail the profitability bar. A backtest that only
            looks good in-sample is the #1 way traders fool themselves; pattern tools that repaint (Elliott, harmonic)
            are especially prone to it.
          </p>
        </>
      )}
    </div>
  );
}
