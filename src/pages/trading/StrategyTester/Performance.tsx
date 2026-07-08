/**
 * Strategy Tester → Performance tab (plan U9, design §4): 4-col grid of 12
 * stat cells.
 */
import type { MappedBacktestResults } from "../../../services/freqtrade/mappers.ts";
import { cn, formatCurrency, formatNumber, pnlClass } from "../../../lib/utils.ts";
import { avgHoldMinutes, formatDuration } from "./testerUtils.ts";

export interface PerformanceProps {
  results: MappedBacktestResults;
}

export function Performance({ results }: PerformanceProps) {
  const cells: { label: string; value: string; cls?: string }[] = [
    { label: "Total trades", value: formatNumber(results.total, 0) },
    { label: "Winning trades", value: formatNumber(results.wins, 0), cls: "text-up" },
    { label: "Losing trades", value: formatNumber(results.losses, 0), cls: "text-down" },
    { label: "Win rate", value: `${formatNumber(results.winRate, 1)}%` },
    { label: "Gross profit", value: formatCurrency(results.grossW), cls: "text-up" },
    { label: "Gross loss", value: formatCurrency(results.grossL), cls: "text-down" },
    { label: "Profit factor", value: results.pf ? formatNumber(results.pf, 2) : "—" },
    {
      label: "Expectancy (R)",
      value: results.expR != null ? `${formatNumber(results.expR, 2)}R` : "—",
      cls: results.expR != null ? pnlClass(results.expR) : undefined,
    },
    {
      label: "Avg win:risk",
      value: results.avgRR != null ? `${formatNumber(results.avgRR, 2)}R` : "—",
    },
    { label: "Avg hold", value: formatDuration(avgHoldMinutes(results.trades)) },
    { label: "Net profit", value: formatCurrency(results.net), cls: pnlClass(results.net) },
    { label: "Net %", value: `${formatNumber(results.netPct * 100, 2)}%`, cls: pnlClass(results.netPct) },
  ];

  return (
    <div className="grid h-full grid-cols-2 content-start gap-px overflow-y-auto bg-border p-px sm:grid-cols-3 md:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label} className="flex flex-col gap-1 bg-panel px-3 py-2.5">
          <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
            {c.label}
          </span>
          <span className={cn("font-mono text-sm font-semibold", c.cls)}>{c.value}</span>
        </div>
      ))}
    </div>
  );
}
