/**
 * Overview tab's equity area chart (plan U9 / design §4): `--accent` line,
 * gradient fill, dashed baseline at the starting balance. Mirrors
 * `ChartPanel.tsx`'s create/ResizeObserver/cleanup pattern but is a much
 * smaller standalone `lightweight-charts` instance — no candles, drawings,
 * or plugins.
 *
 * `mapBacktestResult` derives `eqPts` as *cumulative profit_abs seeded at 0*
 * (KTD6, FreqUI's CumProfitChart.vue convention) — this component overlays
 * `startingBalance` on top for display only (`startingBalance + point.value`)
 * so the curve reads as absolute equity around a dashed initial-capital
 * baseline, without mutating the verified `eqPts` derivation itself.
 *
 * UNVERIFIED: `chart.addAreaSeries(...)` is the `lightweight-charts@4.2.0`
 * API (matches `ChartPanel.tsx`'s `addCandlestickSeries`/`addHistogramSeries`
 * usage elsewhere in this file's package) — not executed/build-checked here
 * (RAM constraint), see U9 report.
 */
import { useEffect, useRef } from "react";
import {
  ColorType,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import type { EquityPoint } from "../../../services/freqtrade/mappers.ts";
import { CHART_COLORS } from "../constants.ts";

export interface EquityChartProps {
  points: EquityPoint[];
  startingBalance: number;
  isDark: boolean;
}

export function EquityChart({ points, startingBalance, isDark }: EquityChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const baselineRef = useRef<IPriceLine | null>(null);

  // ── Create / destroy the chart instance on mount + theme change ──
  useEffect(() => {
    if (!containerRef.current) return;
    const colors = isDark ? CHART_COLORS.dark : CHART_COLORS.light;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: colors.text,
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: colors.grid, style: LineStyle.Dotted },
      },
      crosshair: {
        vertLine: { color: colors.crosshair, width: 1, style: LineStyle.Dashed, labelVisible: false },
        horzLine: { color: colors.crosshair, width: 1, style: LineStyle.Dashed, labelVisible: true },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.15, bottom: 0.08 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;

    // --accent (#14b8a6) — constant across dark/light per U1/KTD9.
    const series = chart.addAreaSeries({
      lineColor: "#14b8a6",
      topColor: "rgba(20, 184, 166, 0.28)",
      bottomColor: "rgba(20, 184, 166, 0.02)",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });
    seriesRef.current = series;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      baselineRef.current = null;
    };
  }, [isDark]);

  // ── Push data + the dashed starting-balance baseline whenever either changes ──
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (points.length === 0) {
      series.setData([]);
      if (baselineRef.current) {
        try {
          series.removePriceLine(baselineRef.current);
        } catch {
          // Series/line already torn down (e.g. mid-unmount) — nothing to do.
        }
        baselineRef.current = null;
      }
      return;
    }
    series.setData(points.map((p) => ({ time: p.time as Time, value: startingBalance + p.value })));

    const baselineOpts = {
      price: startingBalance,
      color: isDark ? CHART_COLORS.dark.crosshair : CHART_COLORS.light.crosshair,
      lineWidth: 1 as const,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "Initial capital",
    };
    // Move-in-place (avoids stacking duplicate price lines on every re-render
    // — see ChartPanel.tsx's `upsertPriceLine` for the same pattern).
    if (baselineRef.current) {
      try {
        baselineRef.current.applyOptions(baselineOpts);
      } catch {
        baselineRef.current = series.createPriceLine(baselineOpts);
      }
    } else {
      baselineRef.current = series.createPriceLine(baselineOpts);
    }
    chartRef.current?.timeScale().fitContent();
  }, [points, startingBalance, isDark]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {points.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground">
          Run a backtest to see the equity curve
        </div>
      )}
    </div>
  );
}
