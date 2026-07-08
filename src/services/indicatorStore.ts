/**
 * Indicator-instance store (plan U4 / KTD2).
 *
 * Trading Lab's indicator model is a first-class, persisted *instance* list —
 * not the old `activeIndicators: IndicatorType[]` (one-per-type, unpersisted,
 * hardcoded params) that `TradingPage.tsx` used to own. Multiple instances of
 * the same `type` can coexist (e.g. EMA 20 + EMA 50), each with its own
 * params/color/width/visibility/plot placement and Python source (U6/U7).
 *
 * Mirrors the manual-localStorage convention used by `useAuthStore` /
 * `useTradingStore` in `./store.tsx` rather than reaching for
 * `zustand/middleware`'s `persist` (unused anywhere else in this codebase,
 * and unverifiable here — see plan's RAM-constrained-VPS build ban).
 */
import { create } from "zustand";
import { INDICATOR_REGISTRY, type IndicatorPane, type IndicatorType } from "../lib/indicators.ts";

/** Design handoff README §"State management": `{ iid, type, params, color,
 *  width, visible, plot, vis{tf:bool}, code }`. */
export interface Indicator {
  /** Stable instance id — the render/diff key (never the `type`). */
  iid: string;
  type: IndicatorType;
  /** Kind values are `number | string` so free-text/enum inputs (U6/U7
   *  `INPUTS` schema, e.g. Source: close/open/hl2/ohlc4) round-trip through
   *  localStorage without a separate string-params bag. */
  params: Record<string, number | string>;
  color: string;
  width: number;
  visible: boolean;
  /** 'overlay' draws over price (main pane legend, U5); 'below' mounts the
   *  132px oscillator sub-pane (U6) and gets no legend row. */
  plot: IndicatorPane;
  /** Per-timeframe visibility checklist (U7 Visibility tab). Empty = visible
   *  on every timeframe (opt-in hiding, not opt-in showing). */
  vis: Record<string, boolean>;
  /** Python source shown/edited in the U7 Settings dialog; seeded from the
   *  U6 catalog template. Not executed client-side (KTD4 honesty seam). */
  code: string;
}

/** Fields the caller may seed on `add()`; `type` is the only requirement —
 *  everything else falls back to the indicator's `INDICATOR_REGISTRY` entry
 *  (color/width/plot) or a sane default. */
export type IndicatorSeed = { type: IndicatorType } & Partial<Omit<Indicator, "iid" | "type">>;

const STORAGE_KEY = "trading_lab_indicators";

function loadInds(): Indicator[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Defensive per-item validation — a corrupt/older-shape entry shouldn't
    // crash the whole store on load.
    return parsed.filter(
      (i): i is Indicator =>
        !!i && typeof i === "object" && typeof (i as Indicator).iid === "string",
    );
  } catch {
    return [];
  }
}

function persistInds(inds: Indicator[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inds));
  } catch {
    /* storage full/unavailable (private browsing) — in-memory state still works */
  }
}

let iidCounter = 0;
function genIid(): string {
  iidCounter += 1;
  return `ind_${Date.now().toString(36)}_${iidCounter}_${Math.random().toString(36).slice(2, 6)}`;
}

interface IndicatorState {
  inds: Indicator[];
  /** Adds a new instance seeded from `INDICATOR_REGISTRY[type]` defaults
   *  (color/width/plot/params), overridden by any fields in `seed`. Returns
   *  the new instance's `iid`. */
  add: (seed: IndicatorSeed) => string;
  remove: (iid: string) => void;
  /** Shallow-merges `patch` onto the instance (any field except `iid`). */
  update: (iid: string, patch: Partial<Omit<Indicator, "iid">>) => void;
  updateParams: (iid: string, params: Record<string, number | string>) => void;
  toggleVisible: (iid: string) => void;
  setCode: (iid: string, code: string) => void;
  /** Moves the instance to `toIndex` in the render/legend order. */
  reorder: (iid: string, toIndex: number) => void;
  /** Removes every instance (context-menu "Remove N indicators" / legacy
   *  toolbar dropdown "clear all" bridge). */
  clear: () => void;
}

export const useIndicatorStore = create<IndicatorState>((set, get) => ({
  inds: loadInds(),

  add: (seed) => {
    const config = INDICATOR_REGISTRY.find((r) => r.type === seed.type);
    const iid = genIid();
    const next: Indicator = {
      iid,
      type: seed.type,
      params: seed.params ?? { ...(config?.defaultParams ?? {}) },
      color: seed.color ?? config?.color ?? "#14b8a6",
      width: seed.width ?? 1,
      visible: seed.visible ?? true,
      plot: seed.plot ?? config?.pane ?? "overlay",
      vis: seed.vis ?? {},
      code: seed.code ?? "",
    };
    set((s) => {
      const inds = [...s.inds, next];
      persistInds(inds);
      return { inds };
    });
    return iid;
  },

  remove: (iid) =>
    set((s) => {
      const inds = s.inds.filter((i) => i.iid !== iid);
      persistInds(inds);
      return { inds };
    }),

  update: (iid, patch) =>
    set((s) => {
      const inds = s.inds.map((i) => (i.iid === iid ? { ...i, ...patch } : i));
      persistInds(inds);
      return { inds };
    }),

  updateParams: (iid, params) => get().update(iid, { params }),

  toggleVisible: (iid) =>
    set((s) => {
      const inds = s.inds.map((i) => (i.iid === iid ? { ...i, visible: !i.visible } : i));
      persistInds(inds);
      return { inds };
    }),

  setCode: (iid, code) => get().update(iid, { code }),

  reorder: (iid, toIndex) =>
    set((s) => {
      const idx = s.inds.findIndex((i) => i.iid === iid);
      if (idx === -1) return s;
      const inds = [...s.inds];
      const [item] = inds.splice(idx, 1);
      if (!item) return s;
      const clamped = Math.max(0, Math.min(toIndex, inds.length));
      inds.splice(clamped, 0, item);
      persistInds(inds);
      return { inds };
    }),

  clear: () => {
    persistInds([]);
    set({ inds: [] });
  },
}));
