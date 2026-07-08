/**
 * Strategy Tester → Overview tab (plan U9, design §4): 2-col metric grid +
 * equity area chart + the Profitability-target hero MET/NOT-MET badge with
 * Profile A/B cards.
 */
import { CheckCircle2, XCircle } from "lucide-react";
import type { MappedBacktestResults } from "../../../services/freqtrade/mappers.ts";
import { cn, formatCurrency, formatNumber, pnlClass } from "../../../lib/utils.ts";
import { checkProfitability } from "./testerUtils.ts";
import { EquityChart } from "./EquityChart.tsx";

export interface OverviewProps {
  results: MappedBacktestResults;
  isDark: boolean;
}

export function Overview({ results, isDark }: OverviewProps) {
  const rrLabel =
    results.avgRR != null
      ? `${formatNumber(results.avgRR, 2)}R${results.avgRRApprox ? " ~" : ""}`
      : "—";

  const metrics: { label: string; value: string; cls?: string }[] = [
    { label: "Net profit", value: formatCurrency(results.net), cls: pnlClass(results.net) },
    { label: "Win rate", value: `${formatNumber(results.winRate, 1)}%` },
    { label: "Avg win:risk", value: rrLabel },
    { label: "Profit factor", value: results.pf ? formatNumber(results.pf, 2) : "—" },
    { label: "Max drawdown", value: `${formatNumber(Math.abs(results.maxdd) * 100, 2)}%`, cls: "text-down" },
    { label: "Sharpe", value: formatNumber(results.sharpe, 2) },
  ];

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 md:flex-row md:overflow-hidden">
      {/* Left — 2-col metric grid (design: 340px, 1px border gridlines) */}
      <div className="grid w-full shrink-0 grid-cols-2 divide-x divide-y divide-border rounded border border-border md:w-[260px] md:self-start">
        {metrics.map((m) => (
          <div key={m.label} className="flex flex-col gap-1 px-2.5 py-2">
            <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
              {m.label}
            </span>
            <span className={cn("font-mono text-sm font-semibold", m.cls)}>{m.value}</span>
          </div>
        ))}
      </div>

      {/* Right — equity curve + profitability target */}
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Equity curve
        </span>
        <div className="h-[110px] min-h-[90px] shrink-0 md:h-auto md:flex-1">
          <EquityChart points={results.eqPts} startingBalance={results.startingBalance} isDark={isDark} />
        </div>
        <ProfitabilityTarget results={results} />
      </div>
    </div>
  );
}

function ProfitabilityTarget({ results }: { results: MappedBacktestResults }) {
  const { met, profileAMet, profileBMet } = checkProfitability(results.winRate, results.avgRR);

  return (
    <div className="flex shrink-0 flex-col gap-2 rounded border border-border p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Profitability target
        </span>
        <span
          className={cn(
            "rounded px-2.5 py-1 text-xs font-black tracking-wide",
            met ? "bg-up/15 text-up" : "bg-down/15 text-down",
          )}
        >
          {met ? "MET" : "NOT MET"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ProfileCard
          title="Profile B"
          subtitle="≥51% & ≥3R"
          met={profileBMet}
          winRate={results.winRate}
          avgRR={results.avgRR}
        />
        <ProfileCard
          title="Profile A"
          subtitle="≥31% & ≥6R"
          met={profileAMet}
          winRate={results.winRate}
          avgRR={results.avgRR}
        />
      </div>
      {results.avgRRApprox && results.avgRR != null && (
        <p className="text-[9px] leading-snug text-muted-foreground">
          Avg win:risk is approximate (expectancy-ratio fallback) — no closed winning trade carried a
          usable fixed-R stop yet. The badge above is provisional until every trade has one.
        </p>
      )}
    </div>
  );
}

function ProfileCard({
  title,
  subtitle,
  met,
  winRate,
  avgRR,
}: {
  title: string;
  subtitle: string;
  met: boolean;
  winRate: number;
  avgRR: number | undefined;
}) {
  const Icon = met ? CheckCircle2 : XCircle;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded border px-2.5 py-2",
        met ? "border-up/40 bg-up/5" : "border-border bg-secondary/40",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", met ? "text-up" : "text-muted-foreground")} />
      <div className="flex min-w-0 flex-col">
        <span className="text-[11px] font-semibold">
          {title} <span className="font-normal text-muted-foreground">· {subtitle}</span>
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          actual: {formatNumber(winRate, 1)}% · {avgRR != null ? `${formatNumber(avgRR, 2)}R` : "—"}
        </span>
      </div>
    </div>
  );
}
