/** Shape of public/waves/<asset>.json, produced by trading-lab's
 * tools/build_wave_feed.py. Everything is copied from engine output —
 * the page draws it, it never recomputes it. */

export interface WavePoint {
  label: string;
  date: string;
  price: number;
}

export interface LiveLeg {
  label: string;
  from: { date: string; price: number };
  to: { date: string; price: number };
}

export interface Reading {
  degree: string;
  pattern: string;
  running: string | null;
  weight: number;
  zone: [number, number];
  invalidation: number | null;
  invalidation_why: string | null;
}

export interface LedgerRow {
  date: string;
  degree: string;
  reading: string;
  zone: [number, number];
  outcome: "hit" | "miss" | "invalidated";
  days: number | null;
  weight: number | null;
}

export interface WaveFeed {
  asset: string;
  pair: string;
  as_of: string;
  price_now: number;
  engine: string;
  series_full: [string, number][];
  series_recent: [string, number][];
  waves: WavePoint[];
  live_legs: LiveLeg[];
  readings: Reading[];
  ledger: LedgerRow[];
  ledger_totals: { resolved: number; hit: number; miss: number; invalidated: number };
}
