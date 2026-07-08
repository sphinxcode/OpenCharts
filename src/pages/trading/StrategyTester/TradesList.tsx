/**
 * Strategy Tester → List of trades tab (plan U9, design §4): #, Side (colored
 * pill from `is_short`), Date, Entry, Exit, R:R, P&L (colored by sign).
 */
import { perTradeR, type RawTrade } from "../../../services/freqtrade/mappers.ts";
import { cn, formatCurrency, formatDate, formatNumber, pnlClass } from "../../../lib/utils.ts";

export interface TradesListProps {
  trades: RawTrade[];
}

export function TradesList({ trades }: TradesListProps) {
  const closed = trades.filter((t) => !t.is_open);

  if (closed.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
        No closed trades in this run
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 z-10 bg-panel">
          <tr className="border-b border-border text-left text-[9px] uppercase tracking-wide text-muted-foreground">
            <th className="px-2 py-1.5 font-medium">#</th>
            <th className="px-2 py-1.5 font-medium">Side</th>
            <th className="px-2 py-1.5 font-medium">Date</th>
            <th className="px-2 py-1.5 font-medium">Entry</th>
            <th className="px-2 py-1.5 font-medium">Exit</th>
            <th className="px-2 py-1.5 font-medium">R:R</th>
            <th className="px-2 py-1.5 font-medium">P&amp;L</th>
          </tr>
        </thead>
        <tbody>
          {closed.map((t, i) => {
            const r = perTradeR(t);
            const pnl = t.profit_abs ?? 0;
            const closeMs =
              typeof t.close_timestamp === "number"
                ? t.close_timestamp
                : t.close_date
                  ? Date.parse(t.close_date)
                  : NaN;
            return (
              <tr key={i} className="border-b border-border/50 hover:bg-secondary/30">
                <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                <td className="px-2 py-1.5">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[9px] font-bold",
                      t.is_short ? "bg-down/15 text-down" : "bg-up/15 text-up",
                    )}
                  >
                    {t.is_short ? "SHORT" : "LONG"}
                  </span>
                </td>
                <td className="px-2 py-1.5 font-mono text-muted-foreground">
                  {Number.isFinite(closeMs) ? formatDate(new Date(closeMs)) : "—"}
                </td>
                <td className="px-2 py-1.5 font-mono">
                  {t.open_rate != null ? formatNumber(t.open_rate, 5) : "—"}
                </td>
                <td className="px-2 py-1.5 font-mono">
                  {t.close_rate != null ? formatNumber(t.close_rate, 5) : "—"}
                </td>
                <td className="px-2 py-1.5 font-mono">{r != null ? `${formatNumber(r, 2)}R` : "—"}</td>
                <td className={cn("px-2 py-1.5 font-mono font-semibold", pnlClass(pnl))}>
                  {pnl >= 0 ? "+" : ""}
                  {formatCurrency(pnl)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
