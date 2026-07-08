import { useEffect, useRef } from "react";
import type { CandlestickData, IChartApi, ISeriesApi, Time } from "lightweight-charts";
import { LineStyle } from "lightweight-charts";
import { bollingerBands, ema, INDICATOR_REGISTRY, sma, vwap } from "../../lib/indicators.ts";
import type { Indicator } from "../../services/indicatorStore.ts";
import { toIndicatorCandles } from "./utils.ts";

type AnySeries = ISeriesApi<"Line"> | ISeriesApi<"Histogram">;

/** Numeric param with a registry-default fallback. Instance params persist as
 *  `number | string` (Indicator model) so enum inputs round-trip through
 *  localStorage; numeric indicator math needs the coerced number. */
function numParam(
  params: Record<string, number | string>,
  key: string,
  fallback: number,
): number {
  const v = params[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/**
 * Renders chart-**overlay** indicator instances (`plot === 'overlay'`) as
 * `lightweight-charts` line series, keyed by the instance's `iid` — not its
 * `type` — so multiple instances of the same indicator type (e.g. two EMAs
 * at different lengths) coexist with independent params/color/width.
 *
 * "below" instances (RSI/MACD/ATR/STOCH) are intentionally NOT rendered
 * here — they mount in the dedicated `OscillatorPane` (plan U6) below the
 * main chart instead of the pre-U4 approach of overlaying a hidden named
 * price scale on the main pane.
 */
export function useIndicators(
  chartRef: React.RefObject<IChartApi | null>,
  candleSeriesRef: React.RefObject<ISeriesApi<"Candlestick"> | null>,
  chartData: CandlestickData<Time>[],
  inds: Indicator[],
  isDark: boolean,
): void {
  const seriesRef = useRef<Map<string, AnySeries[]>>(new Map());

  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;
    const chart = chartRef.current;

    // Full teardown + rebuild on every relevant change — mirrors the pre-U4
    // approach (chartData/isDark changes already force a full recompute) but
    // keys by `iid` so removing/updating one instance never collides with
    // another same-type instance's series identity.
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

    for (const inst of inds) {
      if (inst.plot !== "overlay") continue;
      const config = INDICATOR_REGISTRY.find((r) => r.type === inst.type);
      if (!config) continue;
      const created: AnySeries[] = [];
      const lineWidth = Math.max(1, Math.min(4, Math.round(inst.width || 1))) as 1 | 2 | 3 | 4;

      switch (inst.type) {
        case "SMA": {
          const period = numParam(inst.params, "period", Number(config.defaultParams.period ?? 20));
          const data = sma(indCandles, period);
          const s = chart.addLineSeries({
            color: inst.color,
            lineWidth,
            priceScaleId: "right",
            visible: inst.visible,
          });
          s.setData(data.map((p) => ({ time: p.time as Time, value: p.value })));
          created.push(s);
          break;
        }
        case "EMA": {
          const period = numParam(inst.params, "period", Number(config.defaultParams.period ?? 20));
          const data = ema(indCandles, period);
          const s = chart.addLineSeries({
            color: inst.color,
            lineWidth,
            priceScaleId: "right",
            visible: inst.visible,
          });
          s.setData(data.map((p) => ({ time: p.time as Time, value: p.value })));
          created.push(s);
          break;
        }
        case "BOLL": {
          const period = numParam(inst.params, "period", Number(config.defaultParams.period ?? 20));
          const stdDev = numParam(inst.params, "stdDev", Number(config.defaultParams.stdDev ?? 2));
          const data = bollingerBands(indCandles, period, stdDev);
          const upper = chart.addLineSeries({
            color: inst.color + "80",
            lineWidth,
            priceScaleId: "right",
            visible: inst.visible,
          });
          upper.setData(data.upper.map((p) => ({ time: p.time as Time, value: p.value })));
          const mid = chart.addLineSeries({
            color: inst.color,
            lineWidth,
            priceScaleId: "right",
            visible: inst.visible,
          });
          mid.setData(data.middle.map((p) => ({ time: p.time as Time, value: p.value })));
          const lower = chart.addLineSeries({
            color: inst.color + "80",
            lineWidth,
            priceScaleId: "right",
            visible: inst.visible,
          });
          lower.setData(data.lower.map((p) => ({ time: p.time as Time, value: p.value })));
          created.push(upper, mid, lower);
          break;
        }
        case "VWAP": {
          const data = vwap(indCandles);
          const s = chart.addLineSeries({
            color: inst.color,
            lineWidth,
            lineStyle: LineStyle.Dashed,
            priceScaleId: "right",
            visible: inst.visible,
          });
          s.setData(data.map((p) => ({ time: p.time as Time, value: p.value })));
          created.push(s);
          break;
        }
        default:
          // RSI / MACD / ATR / STOCH — "below" types render in OscillatorPane.
          break;
      }
      if (created.length > 0) seriesRef.current.set(inst.iid, created);
    }
    // chartRef/candleSeriesRef are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inds, chartData, isDark]);
}
