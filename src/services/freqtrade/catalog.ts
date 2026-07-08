/**
 * Add-Indicator catalog (plan U6 / KTD3).
 *
 * FE-static for MVP: the catalog, each indicator's `INPUTS` schema, and its
 * Python `codeTemplate` all live client-side. Authority stays the Freqtrade
 * strategy backtest (`populate_indicators`); this catalog only seeds the
 * fast-lane preview + the U7 Settings-dialog Python editor. Shape matches
 * `INDICATOR_API.md` §1 (`INPUTS`/`PLOT`/`compute()`).
 */
import { INDICATOR_REGISTRY, type IndicatorPane, type IndicatorType } from "../../lib/indicators.ts";
import type { Indicator } from "../indicatorStore.ts";

export type CatalogCategory =
  | "Patterns (Python)"
  | "Moving averages"
  | "Oscillators"
  | "Volatility"
  | "Volume";

/** Design README §6 row tag — independent of `plot` (an indicator can be a
 *  chart 'overlay' but tagged 'confluence', e.g. a pattern indicator). */
export type CatalogTag = "overlay" | "candidate" | "confluence" | "pane";

export interface CatalogInputSchema {
  key: string;
  label: string;
  kind: "int" | "float" | "enum" | "bool";
  default: number | string | boolean;
  min?: number;
  max?: number;
  options?: string[];
}

/**
 * `type` is the client `IndicatorType` for entries that can actually be
 * added to the `indicatorStore` (everything except the deferred
 * pattern-indicator stubs, which never reach `add()` — see `disabled`).
 */
export interface CatalogEntry {
  type: IndicatorType | "ELLIOTT" | "HARMONIC";
  label: string;
  abbrev: string;
  description: string;
  category: CatalogCategory;
  tag: CatalogTag;
  plot: IndicatorPane;
  defaultParams: Record<string, number | string>;
  inputs: CatalogInputSchema[];
  codeTemplate: string;
  /** "Coming soon" rows (Elliott/harmonic, per plan U6) — preserved in the
   *  catalog for design parity but non-interactive; never added to the
   *  indicator store. */
  disabled?: boolean;
}

function regColor(type: IndicatorType): string {
  return INDICATOR_REGISTRY.find((r) => r.type === type)?.color ?? "#14b8a6";
}

// ── Python templates (INDICATOR_API.md §1 shape) ──────────────────────────

const emaTemplate = `# tradinglab/indicators/ema.py
import talib.abstract as ta
import pandas as pd

INPUTS = [
    {"key": "length", "label": "Length", "kind": "int", "default": 50, "min": 1, "max": 500},
    {"key": "source", "label": "Source", "kind": "enum", "default": "close",
     "options": ["close", "open", "hl2", "ohlc4"]},
]

PLOT = {
    "overlay": True,
    "series": [{"id": "ema", "label": "EMA", "type": "line", "color": "${regColor("EMA")}", "width": 2}],
    "repaints": False,
}

def compute(df: pd.DataFrame, length: int = 50, source: str = "close") -> pd.DataFrame:
    src = df[source] if source in df else df["close"]
    out = pd.DataFrame(index=df.index)
    out["ema"] = ta.EMA(src, timeperiod=length)
    return out
`;

const smaTemplate = `# tradinglab/indicators/sma.py
import talib.abstract as ta
import pandas as pd

INPUTS = [
    {"key": "length", "label": "Length", "kind": "int", "default": 20, "min": 1, "max": 500},
    {"key": "source", "label": "Source", "kind": "enum", "default": "close",
     "options": ["close", "open", "hl2", "ohlc4"]},
]

PLOT = {
    "overlay": True,
    "series": [{"id": "sma", "label": "SMA", "type": "line", "color": "${regColor("SMA")}", "width": 2}],
    "repaints": False,
}

def compute(df: pd.DataFrame, length: int = 20, source: str = "close") -> pd.DataFrame:
    src = df[source] if source in df else df["close"]
    out = pd.DataFrame(index=df.index)
    out["sma"] = ta.SMA(src, timeperiod=length)
    return out
`;

const rsiTemplate = `# tradinglab/indicators/rsi.py
import talib.abstract as ta
import pandas as pd

INPUTS = [
    {"key": "length", "label": "Length", "kind": "int", "default": 14, "min": 2, "max": 100},
]

PLOT = {
    "overlay": False,
    "levels": [30, 50, 70],
    "series": [{"id": "rsi", "label": "RSI", "type": "line", "color": "${regColor("RSI")}", "width": 2}],
    "repaints": False,
}

def compute(df: pd.DataFrame, length: int = 14) -> pd.DataFrame:
    out = pd.DataFrame(index=df.index)
    out["rsi"] = ta.RSI(df["close"], timeperiod=length)
    return out
`;

const macdTemplate = `# tradinglab/indicators/macd.py
import talib.abstract as ta
import pandas as pd

INPUTS = [
    {"key": "fast", "label": "Fast length", "kind": "int", "default": 12, "min": 1, "max": 100},
    {"key": "slow", "label": "Slow length", "kind": "int", "default": 26, "min": 1, "max": 200},
    {"key": "signal", "label": "Signal length", "kind": "int", "default": 9, "min": 1, "max": 100},
]

PLOT = {
    "overlay": False,
    "zeroLine": True,
    "series": [
        {"id": "macd", "label": "MACD", "type": "line", "color": "#2196f3", "width": 2},
        {"id": "signal", "label": "Signal", "type": "line", "color": "#ff9800", "width": 1},
        {"id": "hist", "label": "Histogram", "type": "histogram", "color": "${regColor("MACD")}"},
    ],
    "repaints": False,
}

def compute(df: pd.DataFrame, fast: int = 12, slow: int = 26, signal: int = 9) -> pd.DataFrame:
    macd, macdsignal, macdhist = ta.MACD(df["close"], fastperiod=fast, slowperiod=slow, signalperiod=signal)
    out = pd.DataFrame(index=df.index)
    out["macd"], out["signal"], out["hist"] = macd, macdsignal, macdhist
    return out
`;

const stochTemplate = `# tradinglab/indicators/stochastic.py
import talib.abstract as ta
import pandas as pd

INPUTS = [
    {"key": "kPeriod", "label": "%K length", "kind": "int", "default": 14, "min": 1, "max": 100},
    {"key": "dPeriod", "label": "%D smoothing", "kind": "int", "default": 3, "min": 1, "max": 50},
]

PLOT = {
    "overlay": False,
    "levels": [20, 50, 80],
    "series": [
        {"id": "k", "label": "%K", "type": "line", "color": "${regColor("STOCH")}", "width": 2},
        {"id": "d", "label": "%D", "type": "line", "color": "#ff7043", "width": 1},
    ],
    "repaints": False,
}

def compute(df: pd.DataFrame, kPeriod: int = 14, dPeriod: int = 3) -> pd.DataFrame:
    k, d = ta.STOCH(df["high"], df["low"], df["close"], fastk_period=kPeriod, slowd_period=dPeriod)
    out = pd.DataFrame(index=df.index)
    out["k"], out["d"] = k, d
    return out
`;

const bollTemplate = `# tradinglab/indicators/bollinger.py
import talib.abstract as ta
import pandas as pd

INPUTS = [
    {"key": "length", "label": "Length", "kind": "int", "default": 20, "min": 1, "max": 200},
    {"key": "stdDev", "label": "Std dev", "kind": "float", "default": 2.0, "min": 0.5, "max": 5.0},
]

PLOT = {
    "overlay": True,
    "series": [
        {"id": "upper", "label": "Upper", "type": "line", "color": "${regColor("BOLL")}", "width": 1},
        {"id": "middle", "label": "Basis", "type": "line", "color": "${regColor("BOLL")}", "width": 2},
        {"id": "lower", "label": "Lower", "type": "line", "color": "${regColor("BOLL")}", "width": 1},
    ],
    "repaints": False,
}

def compute(df: pd.DataFrame, length: int = 20, stdDev: float = 2.0) -> pd.DataFrame:
    upper, mid, lower = ta.BBANDS(df["close"], timeperiod=length, nbdevup=stdDev, nbdevdn=stdDev)
    out = pd.DataFrame(index=df.index)
    out["upper"], out["middle"], out["lower"] = upper, mid, lower
    return out
`;

const atrTemplate = `# tradinglab/indicators/atr.py
import talib.abstract as ta
import pandas as pd

INPUTS = [
    {"key": "length", "label": "Length", "kind": "int", "default": 14, "min": 1, "max": 100},
]

PLOT = {
    "overlay": False,
    "series": [{"id": "atr", "label": "ATR", "type": "line", "color": "${regColor("ATR")}", "width": 2}],
    "repaints": False,
}

def compute(df: pd.DataFrame, length: int = 14) -> pd.DataFrame:
    out = pd.DataFrame(index=df.index)
    out["atr"] = ta.ATR(df["high"], df["low"], df["close"], timeperiod=length)
    return out
`;

const vwapTemplate = `# tradinglab/indicators/vwap.py
import pandas as pd

INPUTS = []

PLOT = {
    "overlay": True,
    "series": [{"id": "vwap", "label": "VWAP", "type": "line", "color": "${regColor("VWAP")}", "width": 2}],
    "repaints": False,
}

def compute(df: pd.DataFrame) -> pd.DataFrame:
    typical = (df["high"] + df["low"] + df["close"]) / 3
    out = pd.DataFrame(index=df.index)
    out["vwap"] = (typical * df["volume"]).cumsum() / df["volume"].cumsum()
    return out
`;

const volumeTemplate = `# tradinglab/indicators/volume.py
import talib.abstract as ta
import pandas as pd

# Mirrors the RSIVolume strategy's volume/vol_avg pair (INDICATOR_API.md §2) —
# the sample strategy's authoritative "volume confirms the move" signal.
INPUTS = [
    {"key": "period", "label": "Avg length", "kind": "int", "default": 20, "min": 1, "max": 200},
]

PLOT = {
    "overlay": False,
    "series": [
        {"id": "volume", "label": "Volume", "type": "histogram", "color": "${regColor("VOLUME")}"},
        {"id": "avg", "label": "Vol avg", "type": "line", "color": "#e0a52e", "width": 1},
    ],
    "repaints": False,
}

def compute(df: pd.DataFrame, period: int = 20) -> pd.DataFrame:
    out = pd.DataFrame(index=df.index)
    out["volume"] = df["volume"]
    out["avg"] = ta.SMA(df["volume"], timeperiod=period)
    return out
`;

const elliottTemplate = `# tradinglab/indicators/elliott.py — deferred (not shipped in MVP)
# Returns a candidate Elliott wave count off a ZigZag pivot scan.
# PLOT.repaints = True: built on future-relative pivots — see
# INDICATOR_API.md §5 "Guardrails" and the plan's Scope Boundaries.
INPUTS = [
    {"key": "depth", "label": "ZigZag depth", "kind": "int", "default": 12, "min": 6, "max": 24},
]
PLOT = {"overlay": True, "draw": "polygon", "repaints": True}

def compute(df, depth=12):
    raise NotImplementedError("Elliott Wave is deferred — see plan Scope Boundaries")
`;

const harmonicTemplate = `# tradinglab/indicators/harmonic.py — deferred (not shipped in MVP)
# Scans completed XABCD harmonic patterns (Gartley/Bat/Butterfly/Crab).
# PLOT.repaints = True — see INDICATOR_API.md §1 "Pattern indicators".
INPUTS = [
    {"key": "tolerance", "label": "Fib tolerance %", "kind": "float", "default": 5.0},
    {"key": "min_len", "label": "Min swing bars", "kind": "int", "default": 8},
]
PLOT = {"overlay": True, "draw": "polygon", "repaints": True}

def compute(df, tolerance=5.0, min_len=8):
    raise NotImplementedError("Harmonic confluence is deferred — see plan Scope Boundaries")
`;

export const INDICATOR_CATALOG: CatalogEntry[] = [
  // ── Patterns (Python) — deferred, disabled per plan U6 ──────────────────
  {
    type: "ELLIOTT",
    label: "Elliott Wave",
    abbrev: "EW",
    description: "Wave-count candidate off a ZigZag pivot scan. Coming soon.",
    category: "Patterns (Python)",
    tag: "candidate",
    plot: "overlay",
    defaultParams: { depth: 12 },
    inputs: [{ key: "depth", label: "ZigZag depth", kind: "int", default: 12, min: 6, max: 24 }],
    codeTemplate: elliottTemplate,
    disabled: true,
  },
  {
    type: "HARMONIC",
    label: "Harmonic Pattern",
    abbrev: "HP",
    description: "XABCD confluence (Gartley/Bat/Butterfly/Crab). Coming soon.",
    category: "Patterns (Python)",
    tag: "confluence",
    plot: "overlay",
    defaultParams: { tolerance: 5.0, min_len: 8 },
    inputs: [
      { key: "tolerance", label: "Fib tolerance %", kind: "float", default: 5.0 },
      { key: "min_len", label: "Min swing bars", kind: "int", default: 8, min: 3, max: 50 },
    ],
    codeTemplate: harmonicTemplate,
    disabled: true,
  },

  // ── Moving averages ──────────────────────────────────────────────────────
  {
    type: "SMA",
    label: "Simple Moving Average",
    abbrev: "SMA",
    description: "Arithmetic mean of the source over the last N bars.",
    category: "Moving averages",
    tag: "overlay",
    plot: "overlay",
    defaultParams: { period: 20 },
    inputs: [
      { key: "period", label: "Length", kind: "int", default: 20, min: 1, max: 500 },
      {
        key: "source",
        label: "Source",
        kind: "enum",
        default: "close",
        options: ["close", "open", "hl2", "ohlc4"],
      },
    ],
    codeTemplate: smaTemplate,
  },
  {
    type: "EMA",
    label: "Exponential Moving Average",
    abbrev: "EMA",
    description: "Weighted moving average that reacts faster to recent price.",
    category: "Moving averages",
    tag: "overlay",
    plot: "overlay",
    defaultParams: { period: 20 },
    inputs: [
      { key: "period", label: "Length", kind: "int", default: 20, min: 1, max: 500 },
      {
        key: "source",
        label: "Source",
        kind: "enum",
        default: "close",
        options: ["close", "open", "hl2", "ohlc4"],
      },
    ],
    codeTemplate: emaTemplate,
  },

  // ── Oscillators ───────────────────────────────────────────────────────────
  {
    type: "RSI",
    label: "Relative Strength Index",
    abbrev: "RSI",
    description: "Momentum oscillator, 0–100, with 30/70 overbought/oversold bands.",
    category: "Oscillators",
    tag: "pane",
    plot: "below",
    defaultParams: { period: 14 },
    inputs: [{ key: "period", label: "Length", kind: "int", default: 14, min: 2, max: 100 }],
    codeTemplate: rsiTemplate,
  },
  {
    type: "MACD",
    label: "MACD",
    abbrev: "MACD",
    description: "Trend/momentum via fast-slow EMA spread plus a signal line.",
    category: "Oscillators",
    tag: "pane",
    plot: "below",
    defaultParams: { fast: 12, slow: 26, signal: 9 },
    inputs: [
      { key: "fast", label: "Fast length", kind: "int", default: 12, min: 1, max: 100 },
      { key: "slow", label: "Slow length", kind: "int", default: 26, min: 1, max: 200 },
      { key: "signal", label: "Signal length", kind: "int", default: 9, min: 1, max: 100 },
    ],
    codeTemplate: macdTemplate,
  },
  {
    type: "STOCH",
    label: "Stochastic Oscillator",
    abbrev: "STOCH",
    description: "%K/%D range position, 0–100, with 20/80 bands.",
    category: "Oscillators",
    tag: "pane",
    plot: "below",
    defaultParams: { kPeriod: 14, dPeriod: 3 },
    inputs: [
      { key: "kPeriod", label: "%K length", kind: "int", default: 14, min: 1, max: 100 },
      { key: "dPeriod", label: "%D smoothing", kind: "int", default: 3, min: 1, max: 50 },
    ],
    codeTemplate: stochTemplate,
  },

  // ── Volatility ────────────────────────────────────────────────────────────
  {
    type: "BOLL",
    label: "Bollinger Bands",
    abbrev: "BOLL",
    description: "SMA basis with upper/lower bands at N standard deviations.",
    category: "Volatility",
    tag: "overlay",
    plot: "overlay",
    defaultParams: { period: 20, stdDev: 2 },
    inputs: [
      { key: "period", label: "Length", kind: "int", default: 20, min: 1, max: 200 },
      { key: "stdDev", label: "Std dev", kind: "float", default: 2, min: 0.5, max: 5 },
    ],
    codeTemplate: bollTemplate,
  },
  {
    type: "ATR",
    label: "Average True Range",
    abbrev: "ATR",
    description: "Volatility measure — average of true range over N bars.",
    category: "Volatility",
    tag: "pane",
    plot: "below",
    defaultParams: { period: 14 },
    inputs: [{ key: "period", label: "Length", kind: "int", default: 14, min: 1, max: 100 }],
    codeTemplate: atrTemplate,
  },

  // ── Volume ────────────────────────────────────────────────────────────────
  {
    type: "VWAP",
    label: "Volume Weighted Avg Price",
    abbrev: "VWAP",
    description: "Cumulative typical-price average weighted by volume.",
    category: "Volume",
    tag: "overlay",
    plot: "overlay",
    defaultParams: {},
    inputs: [],
    codeTemplate: vwapTemplate,
  },
  {
    type: "VOLUME",
    label: "Volume",
    abbrev: "VOL",
    description: "Volume histogram with a moving average — RSIVolume's confirmation signal.",
    category: "Volume",
    tag: "pane",
    plot: "below",
    defaultParams: { period: 20 },
    inputs: [{ key: "period", label: "Avg length", kind: "int", default: 20, min: 1, max: 200 }],
    codeTemplate: volumeTemplate,
  },
];

export const CATALOG_CATEGORIES: CatalogCategory[] = [
  "Patterns (Python)",
  "Moving averages",
  "Oscillators",
  "Volatility",
  "Volume",
];

export function searchCatalog(query: string): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return INDICATOR_CATALOG;
  return INDICATOR_CATALOG.filter(
    (e) =>
      e.label.toLowerCase().includes(q) ||
      e.abbrev.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q),
  );
}

export function catalogEntryFor(type: IndicatorType): CatalogEntry | undefined {
  return INDICATOR_CATALOG.find((e) => e.type === type);
}

/** First numeric param, formatted for a legend/pane row label — mirrors the
 *  design's `EMA (50)` / `RSI (14)` convention. Falls back to the type's
 *  abbreviation alone when the instance has no numeric params (e.g. VWAP). */
export function formatIndicatorLabel(inst: Indicator): string {
  const entry = catalogEntryFor(inst.type);
  const abbrev = entry?.abbrev ?? inst.type;
  const firstNumericKey = entry?.inputs.find((i) => i.kind === "int" || i.kind === "float")?.key;
  if (!firstNumericKey) return abbrev;
  const v = inst.params[firstNumericKey];
  if (v === undefined || v === "") return abbrev;
  return `${abbrev} (${v})`;
}
