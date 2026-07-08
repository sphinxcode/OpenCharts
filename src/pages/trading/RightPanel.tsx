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
export function RightPanel({ activeTab, onTabChange, watchlist, order, onEditStrategy }: RightPanelProps) {
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
        {activeTab === "strategy" && <StrategyTab onEditStrategy={onEditStrategy} />}
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
 * Static "Elliott Wave + Harmonic" strategy card + Live-signal card
 * (README §"Screens" region 5, "Strategy"). All figures are placeholder
 * content — no data wiring until the backtest/signal units land.
 */
function StrategyTab({ onEditStrategy }: { onEditStrategy?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="flex items-center gap-2 bg-secondary px-3 py-2.5">
          <span
            className="h-2 w-2 rounded-full bg-primary"
            style={{ boxShadow: "0 0 8px hsl(var(--accent))" }}
          />
          <span className="text-xs font-bold">Elliott Wave + Harmonic</span>
          <span className="ml-auto rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-primary bg-primary/20">
            CONFLUENCE
          </span>
        </div>
        <div className="flex flex-col gap-2.5 px-3 py-2.5">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Long when a completed harmonic (Gartley/Bat) sits in confluence with an Elliott
            wave-2/4 retrace. Python signal → Freqtrade backtest.
          </p>
          <button
            type="button"
            onClick={() => onEditStrategy?.()}
            className="mt-0.5 flex h-[30px] items-center justify-center gap-1.5 rounded-md border border-border text-[11px] hover:bg-secondary"
          >
            <span className="font-mono text-primary">.py</span> Edit strategy source
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Live signal
        </span>
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-secondary p-3">
          <div className="flex items-center gap-2">
            <span className="rounded px-2 py-0.5 text-[10px] font-bold text-buy bg-buy/15">
              LONG SETUP
            </span>
            <span className="text-[11px] text-muted-foreground">forming · wave 2</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] uppercase text-muted-foreground">Entry</span>
              <span className="font-mono text-xs font-semibold">61,240</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] uppercase text-muted-foreground">Stop</span>
              <span className="font-mono text-xs font-semibold text-sell">59,900</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] uppercase text-muted-foreground">Target</span>
              <span className="font-mono text-xs font-semibold text-buy">65,260</span>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-1.5">
            <span className="text-[11px] text-muted-foreground">Risk / reward</span>
            <span className="font-mono text-xs font-bold text-primary">1 : 3.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
