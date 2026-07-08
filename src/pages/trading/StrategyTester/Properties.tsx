/**
 * Strategy Tester → Properties tab (plan U9, design §4): 2-col key/value
 * list — Symbol, Timeframe, Date range, Initial capital, Order size,
 * Commission, Slippage, Pyramiding.
 *
 * Order size / Commission / Slippage / Pyramiding are NOT part of the
 * VERIFIED backtest-result contract (docs/plans/VERIFIED-API-CONTRACT.md
 * lists no such fields on `backtest_result.strategy[name]`) — rather than
 * fabricate figures, they render "—" until a verified source is found. See
 * the U9 report's UNCERTAINTY list.
 */
import type { MappedBacktestResults } from "../../../services/freqtrade/mappers.ts";
import { formatCurrency } from "../../../lib/utils.ts";
import { formatTimerange } from "./testerUtils.ts";

export interface PropertiesProps {
  results: MappedBacktestResults;
  symbol: string;
  timeframe: string;
  timerange: string | null;
}

export function Properties({ results, symbol, timeframe, timerange }: PropertiesProps) {
  const rows: [string, string][] = [
    ["Symbol", symbol],
    ["Timeframe", timeframe],
    ["Date range", formatTimerange(timerange)],
    ["Initial capital", formatCurrency(results.startingBalance)],
    ["Order size", "—"],
    ["Commission", "—"],
    ["Slippage", "—"],
    ["Pyramiding", "—"],
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-y-0">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-4 border-border px-3 py-2 sm:border-b"
          >
            <span className="text-[11px] text-muted-foreground">{label}</span>
            <span className="font-mono text-[11px] font-medium">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
