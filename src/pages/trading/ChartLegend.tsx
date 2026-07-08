import { Eye, EyeOff, Settings, X } from "lucide-react";
import { formatIndicatorLabel } from "../../services/freqtrade/catalog.ts";
import { type Indicator, useIndicatorStore } from "../../services/indicatorStore.ts";
import { cn } from "../../lib/utils.ts";

/**
 * Top-left overlay legend row per **overlay** indicator instance (plan U5 /
 * README §3): color dot + label (e.g. `EMA (50)`) + eye + gear + ✕.
 *
 * "below" instances (RSI/MACD/ATR/STOCH/VOLUME) intentionally get no row
 * here — they live in the oscillator sub-pane (plan U6) instead.
 *
 * Mounted inside `ChartPanel`, stacked directly under the existing
 * `ChartLegendHeader` (symbol · TF · OHLC · bid/ask) so the two form one
 * combined top-left legend block without duplicating the OHLC/crosshair
 * wiring already owned by `ChartPanel`.
 */
export interface ChartLegendProps {
  /** Full instance list — filtered to `plot === 'overlay'` internally so
   *  callers can pass the store's `inds` straight through. */
  inds: Indicator[];
  /** Opens the indicator Settings dialog for this `iid` (★ core screen,
   *  plan U7). `TradingPage.tsx` passes a no-op TODO stub until U7 lands. */
  onOpenSettings: (iid: string) => void;
}

function LegendRow({
  inst,
  onOpenSettings,
}: {
  inst: Indicator;
  onOpenSettings: (iid: string) => void;
}) {
  const remove = useIndicatorStore((s) => s.remove);
  const toggleVisible = useIndicatorStore((s) => s.toggleVisible);

  return (
    <div className="group pointer-events-auto flex items-center gap-1.5 leading-none">
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: inst.color }}
      />
      <span
        className={cn(
          "font-mono text-[11px] text-foreground/90",
          !inst.visible && "text-muted-foreground/50 line-through",
        )}
      >
        {formatIndicatorLabel(inst)}
      </span>
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={() => toggleVisible(inst.iid)}
          title={inst.visible ? "Hide" : "Show"}
          className="text-muted-foreground hover:text-foreground"
        >
          {inst.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
        </button>
        <button
          type="button"
          onClick={() => onOpenSettings(inst.iid)}
          title="Settings"
          className="text-muted-foreground hover:text-foreground"
        >
          <Settings className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => remove(inst.iid)}
          title="Remove"
          className="text-muted-foreground hover:text-down"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export function ChartLegend({ inds, onOpenSettings }: ChartLegendProps) {
  const overlays = inds.filter((i) => i.plot === "overlay");
  if (overlays.length === 0) return null;

  return (
    <div className="pointer-events-none absolute left-3 top-9 z-10 flex select-none flex-col gap-1">
      {overlays.map((inst) => (
        <LegendRow key={inst.iid} inst={inst} onOpenSettings={onOpenSettings} />
      ))}
    </div>
  );
}
