/**
 * Balance input + humanized-report download (markdown) / print (PDF), shown
 * above the Strategy Tester tabs once a backtest has results. See
 * services/freqtrade/report.ts for the (honest) report content.
 */
import { useState } from "react";
import type { MappedBacktestResults } from "../../../services/freqtrade/mappers.ts";
import {
  downloadReportMarkdown,
  printReportPdf,
  type ReportMeta,
} from "../../../services/freqtrade/report.ts";

export interface ReportControlsProps {
  results: MappedBacktestResults;
  meta: Omit<ReportMeta, "balance">;
}

export function ReportControls({ results, meta }: ReportControlsProps) {
  const [balance, setBalance] = useState<number>(results.startingBalance > 0 ? results.startingBalance : 1000);
  const full: ReportMeta = { ...meta, balance };
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-panel2 px-3 py-1.5">
      <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
        Your balance
        <span className="ml-1 text-foreground">$</span>
        <input
          type="number"
          min={0}
          value={balance}
          onChange={(e) => setBalance(Math.max(0, Number(e.target.value) || 0))}
          className="w-24 rounded border border-border bg-panel px-1.5 py-1 font-mono text-xs text-foreground"
        />
      </label>
      <button
        type="button"
        onClick={() => downloadReportMarkdown(results, full)}
        className="rounded bg-accent px-2.5 py-1 text-[11px] font-bold text-accent-foreground"
      >
        ⬇ Report (.md)
      </button>
      <button
        type="button"
        onClick={() => printReportPdf(results, full)}
        className="rounded border border-border bg-panel px-2.5 py-1 text-[11px] font-semibold text-foreground"
      >
        🖨 Save as PDF
      </button>
      <span className="hidden text-[10px] text-muted-foreground lg:inline">
        Plain-language summary for your balance — with honest caveats.
      </span>
    </div>
  );
}
