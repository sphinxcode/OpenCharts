/**
 * Strategy Tester panel (plan U9, design §4): header (accent dot + title +
 * segmented Overview/Performance/List of trades/Properties tabs + active
 * strategy name + collapse) hosting the four result tabs, plus idle/running/
 * error empty states for when no backtest has completed yet.
 *
 * Mounted as a tab inside `BottomPanel.tsx` (see TradingPage.tsx's
 * `bottomTab` union) rather than replacing the bottom panel outright — see
 * the U9 report for the integration-choice rationale.
 */
import { ChevronDown, ChevronUp } from "lucide-react";
import type { MappedBacktestResults } from "../../../services/freqtrade/mappers.ts";
import { cn } from "../../../lib/utils.ts";
import { Overview } from "./Overview.tsx";
import { Performance } from "./Performance.tsx";
import { TradesList } from "./TradesList.tsx";
import { Properties } from "./Properties.tsx";
import { WalkForward } from "./WalkForward.tsx";
import { ReportControls } from "./ReportControls.tsx";

export type BacktestRunStatus = "idle" | "running" | "done" | "error";
export type TesterTab = "overview" | "walkforward" | "performance" | "trades" | "properties";

const TABS: { key: TesterTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "walkforward", label: "Walk-forward" },
  { key: "performance", label: "Performance" },
  { key: "trades", label: "List of trades" },
  { key: "properties", label: "Properties" },
];

export interface StrategyTesterPanelProps {
  results: MappedBacktestResults | null;
  status: BacktestRunStatus;
  /** 0-100 while `status === "running"`. */
  progress?: number;
  error?: string | null;
  strategyName: string | null;
  symbol: string;
  timeframe: string;
  timerange: string | null;
  isDark: boolean;
  tab: TesterTab;
  onTabChange: (tab: TesterTab) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function StrategyTesterPanel({
  results,
  status,
  progress,
  error,
  strategyName,
  symbol,
  timeframe,
  timerange,
  isDark,
  tab,
  onTabChange,
  collapsed = false,
  onToggleCollapse,
}: StrategyTesterPanelProps) {
  return (
    <div className="flex h-full flex-col bg-panel">
      {/* Header — design region 4: accent dot + title + segmented tabs +
          active strategy name + collapse. */}
      <div className="flex h-[38px] shrink-0 items-center gap-1 border-b border-border px-2">
        <span
          className="ml-1 h-2 w-2 shrink-0 rounded-full bg-accent"
          style={{ boxShadow: "0 0 8px hsl(var(--accent))" }}
        />
        <span className="mr-2 shrink-0 text-xs font-bold">Strategy Tester</span>

        {!collapsed && (
          <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => onTabChange(t.key)}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded px-2 py-1 text-[11px] font-medium transition-colors",
                  tab === t.key
                    ? "bg-panel2 text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
          {status === "running" && (
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              Running… {progress ?? 0}%
            </span>
          )}
          {status === "error" && <span className="text-[11px] text-down">Backtest failed</span>}
          <span className="font-mono text-[11px] text-accent">{strategyName ?? "—"}</span>
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title={collapsed ? "Expand" : "Collapse"}
              className="flex items-center px-1 text-muted-foreground hover:text-foreground"
            >
              {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="min-h-0 flex-1 overflow-hidden">
          {tab === "walkforward" ? (
            // Walk-forward runs its OWN in/out-of-sample backtests, so it's
            // available regardless of the main Run-backtest state.
            <WalkForward strategyName={strategyName} timeframe={timeframe} />
          ) : status === "error" ? (
            <ErrorState message={error} />
          ) : !results ? (
            status === "running" ? (
              <RunningState progress={progress} />
            ) : (
              <EmptyState />
            )
          ) : (
            <div className="flex h-full flex-col">
              <ReportControls
                results={results}
                meta={{ strategyName: strategyName ?? "strategy", symbol, timeframe, timerange }}
              />
              <div className="min-h-0 flex-1 overflow-hidden">
                {tab === "overview" && <Overview results={results} isDark={isDark} />}
                {tab === "performance" && <Performance results={results} />}
                {tab === "trades" && <TradesList trades={results.trades} />}
                {tab === "properties" && (
                  <Properties results={results} symbol={symbol} timeframe={timeframe} timerange={timerange} />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-muted-foreground">
      <span className="text-xs font-medium">No backtest results yet</span>
      <span className="text-[11px]">Click "▶ Run backtest" in the toolbar to test the active strategy.</span>
    </div>
  );
}

function RunningState({ progress }: { progress?: number }) {
  const pct = Math.max(0, Math.min(100, progress ?? 0));
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <span className="font-mono text-2xl font-bold tabular-nums text-accent">{pct}%</span>
      <div className="h-1 w-40 overflow-hidden rounded-full bg-secondary">
        <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px]">Running backtest…</span>
    </div>
  );
}

function ErrorState({ message }: { message?: string | null }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center">
      <span className="text-xs font-semibold text-down">Backtest failed</span>
      <span className="text-[11px] text-muted-foreground">{message || "Unknown error — check the Freqtrade backend."}</span>
    </div>
  );
}
