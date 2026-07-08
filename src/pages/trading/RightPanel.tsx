import { cn } from "../../lib/utils.ts";
import { OrderPanel, type OrderPanelProps } from "./OrderPanel.tsx";
import { WatchlistPanel } from "./WatchlistPanel.tsx";

/** The three design-region tabs (README §"Screens" region 5). */
export type StrategyPanelTab = "strategy" | "watchlist" | "order";

export interface RightPanelProps {
  activeTab: StrategyPanelTab;
  onTabChange: (tab: StrategyPanelTab) => void;
  watchlist: {
    symbols: Array<{
      id?: string;
      name: string;
      displayName?: string | null;
      assetClass?: string;
      category?: string;
      isActive?: boolean;
    }>;
    ticks: Record<string, { bid: number; ask: number; timestamp: number }>;
    selectedSymbol: string;
    onSelect: (s: string) => void;
    oneClick?: boolean;
    accountId?: string | null;
    isFeedConnected?: boolean;
  };
  order: OrderPanelProps;
  /**
   * Opens the indicator Settings dialog on the strategy's Elliott
   * Wave/Harmonic instance (★ core screen, plan U7). No-op stub until that
   * unit lands.
   */
  onEditStrategy?: () => void;
  /** Active strategy name (from the toolbar picker). */
  activeStrategy?: string | null;
}

const TABS: Array<{ key: StrategyPanelTab; label: string }> = [
  { key: "strategy", label: "Strategy" },
  { key: "watchlist", label: "Watchlist" },
  { key: "order", label: "Order" },
];

/**
 * Design region 5 — tabbed Strategy / Watchlist / Order host (296px,
 * `--panel` bg, active tab = 2px `--accent` underline). Hosts the existing
 * `WatchlistPanel` / `OrderPanel` unchanged; the Strategy tab is a static
 * placeholder (Elliott Wave + Harmonic card + Live-signal card) until the
 * indicator-instance store (U4+) and backtest wiring (U9+) land.
 */
export function RightPanel({
  activeTab,
  onTabChange,
  watchlist,
  order,
  onEditStrategy,
  activeStrategy,
}: RightPanelProps) {
  return (
    <div className="flex h-full flex-col min-h-0">
      <div className="flex h-[38px] shrink-0 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onTabChange(t.key)}
            className={cn(
              "flex-1 border-b-2 text-xs font-semibold transition-colors",
              activeTab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "strategy" && <StrategyTab activeStrategy={activeStrategy} onEditStrategy={onEditStrategy} />}
        {activeTab === "watchlist" && (
          <WatchlistPanel
            symbols={watchlist.symbols}
            ticks={watchlist.ticks}
            selectedSymbol={watchlist.selectedSymbol}
            onSelect={watchlist.onSelect}
            oneClick={watchlist.oneClick}
            accountId={watchlist.accountId}
            isFeedConnected={watchlist.isFeedConnected}
          />
        )}
        {activeTab === "order" && <OrderPanel {...order} />}
      </div>
    </div>
  );
}

/**
 * Reflects the ACTIVE selected strategy (from the toolbar picker) + an honest
 * "how to test" guide. Replaces the old hardcoded Elliott/Harmonic + fake
 * live-signal placeholder, which was misleading (it showed regardless of what
 * strategy was loaded, and this is a backtest lab with no live signals).
 */
function StrategyTab({
  activeStrategy,
  onEditStrategy,
}: {
  activeStrategy?: string | null;
  onEditStrategy?: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="flex items-center gap-2 bg-secondary px-3 py-2.5">
          <span
            className="h-2 w-2 rounded-full bg-primary"
            style={{ boxShadow: "0 0 8px hsl(var(--accent))" }}
          />
          <span className="text-xs font-bold">{activeStrategy ?? "No strategy loaded"}</span>
          <span className="ml-auto rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-primary bg-primary/20">
            PYTHON
          </span>
        </div>
        <div className="flex flex-col gap-2.5 px-3 py-2.5">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {activeStrategy
              ? "A Freqtrade strategy written in Python. Edit its source, pick a timeframe, then Run backtest to see how it would have performed on real BTC/USDT history."
              : "Pick a strategy from the top toolbar to load and backtest it."}
          </p>
          <button
            type="button"
            onClick={() => onEditStrategy?.()}
            disabled={!activeStrategy}
            className="mt-0.5 flex h-[30px] items-center justify-center gap-1.5 rounded-md border border-border text-[11px] hover:bg-secondary disabled:opacity-50"
          >
            <span className="font-mono text-primary">.py</span> Edit strategy source
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          How to test this strategy
        </span>
        <ol className="flex flex-col gap-1.5 rounded-lg border border-border bg-secondary p-3 text-[11px] text-muted-foreground">
          <li>1. Pick a strategy in the top toolbar.</li>
          <li>2. Choose a timeframe (1m–1w).</li>
          <li>
            3. Click <span className="font-semibold text-foreground">▶ Run backtest</span>.
          </li>
          <li>
            4. Read the <span className="font-semibold text-foreground">Strategy Tester</span> — metrics, equity
            curve, MET/NOT-MET.
          </li>
          <li>
            5. Run <span className="font-semibold text-foreground">Walk-forward</span> to check it isn't overfit.
          </li>
          <li>6. Download the plain-English report.</li>
        </ol>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          No live trading signals — this is a backtest lab (dry-run only). Nothing risks real money.
        </p>
      </div>
    </div>
  );
}
