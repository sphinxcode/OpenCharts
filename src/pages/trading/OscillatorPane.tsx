import {
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  LineStyle,
  type Time,
} from "lightweight-charts";
import { Eye, EyeOff, Settings, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { atr, macd, rsi, stochastic, volumeWithAvg } from "../../lib/indicators.ts";
import { formatIndicatorLabel } from "../../services/freqtrade/catalog.ts";
import { type Indicator, useIndicatorStore } from "../../services/indicatorStore.ts";
import { cn } from "../../lib/utils.ts";
import { CHART_COLORS, LAYOUT } from "./constants.ts";
import { toIndicatorCandles } from "./utils.ts";

export interface OscillatorPaneProps {
  /** The main chart — its visible time range drives this pane's scroll/zoom
   *  (one shared timeline, TradingView-style). */
  mainChartRef: React.RefObject<IChartApi | null>;
  chartData: CandlestickData<Time>[];
  /** Full instance list — filtered to `plot === 'below'` internally. */
  inds: Indicator[];
  isDark: boolean;
  /** Opens the indicator Settings dialog for this `iid` (plan U7 stub). */
  onOpenSettings: (iid: string) => void;
}

type AnySeries = ISeriesApi<"Line"> | ISeriesApi<"Histogram">;

function OscLegendRow({
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
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: inst.color }} />
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

/**
 * 132px oscillator sub-pane (plan U6, `LAYOUT.oscillatorPaneHeight`) —
 * mounted below the main chart only while at least one `plot === 'below'`
 * instance (RSI/MACD/ATR/STOCH/VOLUME) exists.
 *
 * `lightweight-charts@4.2` has no multi-pane API (that landed in v5), so
 * this renders its **own** `createChart()` instance in a dedicated
 * container and syncs its visible logical range bidirectionally with the
 * main chart's time scale — the standard `lightweight-charts` v4 pattern
 * for a synced secondary pane.
 */
export function OscillatorPane({
  mainChartRef,
  chartData,
  inds,
  isDark,
  onOpenSettings,
}: OscillatorPaneProps) {
  // Memoised so the render effect below (keyed on this array's identity)
  // only reruns when the underlying instance list actually changes — not on
  // every unrelated ChartPanel re-render (ticks, legend state, etc.), which
  // would otherwise thrash the oscillator series on every parent render.
  const belowInds = useMemo(() => inds.filter((i) => i.plot === "below"), [inds]);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<Map<string, AnySeries[]>>(new Map());
  const syncingRef = useRef(false);

  // ── Create / destroy the oscillator chart + sync with the main chart ──
  useEffect(() => {
    if (!containerRef.current) return;
    const colors = isDark ? CHART_COLORS.dark : CHART_COLORS.light;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: colors.grid, style: LineStyle.Dotted },
        horzLines: { color: colors.grid, style: LineStyle.Dotted },
      },
      rightPriceScale: {
        borderColor: colors.grid,
        autoScale: true,
        alignLabels: true,
        borderVisible: true,
        minimumWidth: 80,
      },
      timeScale: {
        borderColor: colors.grid,
        timeVisible: true,
        visible: true,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true },
    });
    chartRef.current = chart;

    // One shared timeline: mirror the main chart's visible range onto this
    // pane, and vice versa — guarded against feedback loops with `syncingRef`.
    const applyFromMain = () => {
      const main = mainChartRef.current;
      if (!main || syncingRef.current) return;
      const range = main.timeScale().getVisibleLogicalRange();
      if (!range) return;
      syncingRef.current = true;
      try {
        chart.timeScale().setVisibleLogicalRange(range);
      } catch {
        /* pane not ready yet */
      }
      syncingRef.current = false;
    };
    const onMainRangeChange = () => applyFromMain();
    const onOscRangeChange = () => {
      const main = mainChartRef.current;
      if (!main || syncingRef.current) return;
      const range = chart.timeScale().getVisibleLogicalRange();
      if (!range) return;
      syncingRef.current = true;
      try {
        main.timeScale().setVisibleLogicalRange(range);
      } catch {
        /* main chart not ready */
      }
      syncingRef.current = false;
    };
    mainChartRef.current?.timeScale().subscribeVisibleLogicalRangeChange(onMainRangeChange);
    chart.timeScale().subscribeVisibleLogicalRangeChange(onOscRangeChange);
    applyFromMain();

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      mainChartRef.current?.timeScale().unsubscribeVisibleLogicalRangeChange(onMainRangeChange);
      try {
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(onOscRangeChange);
      } catch {
        /* chart already torn down */
      }
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current.clear();
    };
    // Recreated on theme toggle, matching the main chart's own convention
    // (ChartPanel's create-effect also depends on `isDark`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark]);

  // ── Render below-plot indicator series ──
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    for (const [, series] of seriesRef.current) {
      for (const s of series) {
        try {
          chart.removeSeries(s);
        } catch {
          /* already removed */
        }
      }
    }
    seriesRef.current.clear();

    if (chartData.length === 0) return;
    const indCandles = toIndicatorCandles(chartData);

    for (const inst of belowInds) {
      const created: AnySeries[] = [];
      const lineWidth = Math.max(1, Math.min(4, Math.round(inst.width || 1))) as 1 | 2 | 3 | 4;
      const scaleId = `osc_${inst.type.toLowerCase()}`;

      switch (inst.type) {
        case "RSI": {
          const period = Number(inst.params.period ?? 14);
          const data = rsi(indCandles, period);
          const s = chart.addLineSeries({
            color: inst.color,
            lineWidth,
            priceScaleId: scaleId,
            visible: inst.visible,
          });
          // Fixed 0-100 scale so the 30/50/70 guides always sit at consistent
          // heights regardless of the visible RSI range (method, not a
          // constructor option, per lightweight-charts@4.2's ISeriesApi).
          s.autoscaleInfoProvider(() => ({
            priceRange: { minValue: 0, maxValue: 100 },
          }));
          s.setData(data.map((p) => ({ time: p.time as Time, value: p.value })));
          // 30/50/70 guide lines (design README §3).
          for (const level of [30, 50, 70]) {
            s.createPriceLine({
              price: level,
              color: level === 50 ? "#555" : "#555a",
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: false,
              title: "",
            });
          }
          created.push(s);
          break;
        }
        case "MACD": {
          const fast = Number(inst.params.fast ?? 12);
          const slow = Number(inst.params.slow ?? 26);
          const signal = Number(inst.params.signal ?? 9);
          const data = macd(indCandles, fast, slow, signal);
          const histo = chart.addHistogramSeries({
            priceScaleId: scaleId,
            visible: inst.visible,
          });
          histo.setData(
            data.histogram.map((p) => ({
              time: p.time as Time,
              value: p.value,
              color: p.value >= 0 ? "#16c78499" : "#ea394399",
            })),
          );
          // Zero-line (design README §3 "MACD draws a zero-line histogram").
          histo.createPriceLine({
            price: 0,
            color: "#555a",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: false,
            title: "",
          });
          const mLine = chart.addLineSeries({
            color: inst.color,
            lineWidth,
            priceScaleId: scaleId,
            visible: inst.visible,
          });
          mLine.setData(data.macd.map((p) => ({ time: p.time as Time, value: p.value })));
          const sLine = chart.addLineSeries({
            color: "#ff9800",
            lineWidth: 1,
            priceScaleId: scaleId,
            visible: inst.visible,
          });
          sLine.setData(data.signal.map((p) => ({ time: p.time as Time, value: p.value })));
          created.push(histo, mLine, sLine);
          break;
        }
        case "STOCH": {
          const kPeriod = Number(inst.params.kPeriod ?? 14);
          const dPeriod = Number(inst.params.dPeriod ?? 3);
          const data = stochastic(indCandles, kPeriod, dPeriod);
          const kLine = chart.addLineSeries({
            color: inst.color,
            lineWidth,
            priceScaleId: scaleId,
            visible: inst.visible,
          });
          kLine.autoscaleInfoProvider(() => ({ priceRange: { minValue: 0, maxValue: 100 } }));
          kLine.setData(data.k.map((p) => ({ time: p.time as Time, value: p.value })));
          const dLine = chart.addLineSeries({
            color: "#ff7043",
            lineWidth: 1,
            priceScaleId: scaleId,
            visible: inst.visible,
          });
          dLine.setData(data.d.map((p) => ({ time: p.time as Time, value: p.value })));
          created.push(kLine, dLine);
          break;
        }
        case "ATR": {
          const period = Number(inst.params.period ?? 14);
          const data = atr(indCandles, period);
          const s = chart.addLineSeries({
            color: inst.color,
            lineWidth,
            priceScaleId: scaleId,
            visible: inst.visible,
          });
          s.setData(data.map((p) => ({ time: p.time as Time, value: p.value })));
          created.push(s);
          break;
        }
        case "VOLUME": {
          const period = Number(inst.params.period ?? 20);
          const { volume, avg } = volumeWithAvg(indCandles, period);
          const histo = chart.addHistogramSeries({
            priceScaleId: scaleId,
            visible: inst.visible,
          });
          histo.setData(volume.map((p) => ({ time: p.time as Time, value: p.value })));
          const avgLine = chart.addLineSeries({
            color: "#e0a52e",
            lineWidth: 1,
            priceScaleId: scaleId,
            visible: inst.visible,
          });
          avgLine.setData(avg.map((p) => ({ time: p.time as Time, value: p.value })));
          created.push(histo, avgLine);
          break;
        }
        default:
          break;
      }
      if (created.length > 0) seriesRef.current.set(inst.iid, created);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [belowInds, chartData, isDark]);

  if (belowInds.length === 0) return null;

  return (
    <div
      className="relative w-full shrink-0 border-t border-border bg-background"
      style={{ height: LAYOUT.oscillatorPaneHeight }}
    >
      <div className="pointer-events-none absolute left-3 top-1.5 z-10 flex select-none flex-wrap items-center gap-3">
        {belowInds.map((inst) => (
          <OscLegendRow key={inst.iid} inst={inst} onOpenSettings={onOpenSettings} />
        ))}
      </div>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
