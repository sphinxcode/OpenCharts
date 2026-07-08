import { ChevronDown, ChevronRight, GripVertical, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDragOffset } from "../../hooks/useDragOffset.ts";
import { cn } from "../../lib/utils.ts";
import { type CatalogInputSchema, catalogEntryFor } from "../../services/freqtrade/catalog.ts";
import { type Indicator, useIndicatorStore } from "../../services/indicatorStore.ts";
import { PythonEditor } from "./PythonEditor.tsx";

/**
 * Indicator Settings dialog (plan U7 / R4) — the ★ core screen. 640px
 * hand-rolled overlay mirroring `ChartSettingsDialog.tsx`'s structure
 * (drag-by-header, `fixed inset-0` scrim, click-outside-to-close; KTD8 — not
 * Radix). Opened from `ChartLegend`'s gear (overlay instances) or
 * `OscillatorPane`'s gear ("below" instances) via `TradingPage`'s
 * `settingsIid` state.
 *
 * Inputs/Style/Visibility all write straight through to `indicatorStore` as
 * the user interacts — the fast-lane chart repaints live via the store
 * subscription already wired in `useIndicators`/`OscillatorPane`. Cancel is
 * implemented by snapshotting the instance's editable fields when the dialog
 * opens and restoring that snapshot on Cancel/backdrop-close; Apply simply
 * keeps the already-committed store state and closes.
 */
export interface IndicatorSettingsDialogProps {
  /** Which instance's dialog is open; `null` = closed. */
  iid: string | null;
  onClose: () => void;
}

type SettingsTab = "inputs" | "style" | "visibility";

const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: "inputs", label: "Inputs" },
  { id: "style", label: "Style" },
  { id: "visibility", label: "Visibility" },
];

const VIS_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;

// Six design-token swatches (design_handoff_trading_lab README "Design
// Tokens") — a spread across the palette's indicator-relevant hues, kept
// distinct from the semantic up/down (buy/sell) colors so a chosen indicator
// color is never confused with a P&L signal.
const COLOR_SWATCHES = [
  "#14b8a6", // accent
  "#e3b341", // bollinger
  "#60a5fa", // vwap
  "#c084fc", // elliott
  "#38bdf8", // harmonic
  "#e0a52e", // last-price amber
];

const LINE_WIDTHS = [1, 2, 3] as const;

type EditableSnapshot = Pick<Indicator, "params" | "color" | "width" | "visible" | "plot" | "vis" | "code">;

function snapshotOf(inst: Indicator): EditableSnapshot {
  return {
    params: { ...inst.params },
    color: inst.color,
    width: inst.width,
    visible: inst.visible,
    plot: inst.plot,
    vis: { ...inst.vis },
    code: inst.code,
  };
}

function clampNumber(raw: string, schema: CatalogInputSchema): number {
  let n = Number(raw);
  if (!Number.isFinite(n)) n = Number(schema.default) || 0;
  if (schema.min !== undefined) n = Math.max(schema.min, n);
  if (schema.max !== undefined) n = Math.min(schema.max, n);
  if (schema.kind === "int") n = Math.round(n);
  return n;
}

function boolOf(raw: number | string | undefined, schema: CatalogInputSchema): boolean {
  if (raw === undefined) return Boolean(schema.default);
  return raw === "true" || raw === 1 || raw === "1";
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-0 p-0 transition-colors",
        checked ? "bg-accent" : "bg-secondary",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-[2px]",
        )}
      />
    </button>
  );
}

// ── Inputs tab ───────────────────────────────────────────────────────────

function InputRow({
  schema,
  inst,
  onCommit,
}: {
  schema: CatalogInputSchema;
  inst: Indicator;
  onCommit: (value: number | string) => void;
}) {
  const raw = inst.params[schema.key];

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="text-xs text-foreground">{schema.label}</div>
      {schema.kind === "int" || schema.kind === "float" ? (
        <input
          type="number"
          value={raw === undefined ? Number(schema.default) : Number(raw)}
          min={schema.min}
          max={schema.max}
          step={schema.kind === "float" ? "any" : 1}
          onChange={(e) => onCommit(clampNumber(e.target.value, schema))}
          className="w-24 rounded border border-border bg-panel2 px-2 py-1 text-right font-mono text-xs text-foreground outline-none focus:border-accent"
        />
      ) : schema.kind === "enum" ? (
        <select
          value={raw === undefined ? String(schema.default) : String(raw)}
          onChange={(e) => onCommit(e.target.value)}
          className="rounded border border-border bg-panel2 px-2 py-1 text-xs text-foreground outline-none focus:border-accent"
        >
          {(schema.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <Switch
          checked={boolOf(raw, schema)}
          onChange={(v) => onCommit(v ? "true" : "false")}
        />
      )}
    </div>
  );
}

function InputsTab({ inst }: { inst: Indicator }) {
  const updateParams = useIndicatorStore((s) => s.updateParams);
  const entry = catalogEntryFor(inst.type);
  const schemas = entry?.inputs ?? [];

  if (schemas.length === 0) {
    return (
      <p className="py-4 text-xs text-muted-foreground">
        {entry?.label ?? inst.type} has no configurable inputs.
      </p>
    );
  }

  return (
    <div>
      {schemas.map((schema) => (
        <InputRow
          key={schema.key}
          schema={schema}
          inst={inst}
          onCommit={(value) => updateParams(inst.iid, { ...inst.params, [schema.key]: value })}
        />
      ))}
    </div>
  );
}

// ── Style tab ────────────────────────────────────────────────────────────

function StyleTab({ inst }: { inst: Indicator }) {
  const update = useIndicatorStore((s) => s.update);

  return (
    <div>
      <div className="flex items-center justify-between gap-4 py-2">
        <div className="min-w-0">
          <div className="text-xs text-foreground">Plot on chart</div>
          <div className="text-[10px] text-muted-foreground">Show this instance's series</div>
        </div>
        <Switch checked={inst.visible} onChange={(v) => update(inst.iid, { visible: v })} />
      </div>

      <div className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Color
      </div>
      <div className="flex items-center gap-2 py-1">
        {COLOR_SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => update(inst.iid, { color: c })}
            title={c}
            className={cn(
              "h-6 w-6 shrink-0 rounded-full transition-shadow",
              inst.color.toLowerCase() === c.toLowerCase() && "ring-2 ring-offset-2 ring-offset-card ring-foreground",
            )}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <div className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Line width
      </div>
      <div className="flex items-center gap-1.5 py-1">
        {LINE_WIDTHS.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => update(inst.iid, { width: w })}
            className={cn(
              "flex h-7 w-9 items-center justify-center rounded border text-xs font-medium transition-colors",
              inst.width === w
                ? "border-accent bg-accent/15 text-accent"
                : "border-border text-muted-foreground hover:bg-secondary",
            )}
          >
            {w}px
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Visibility tab ───────────────────────────────────────────────────────

function VisibilityTab({ inst }: { inst: Indicator }) {
  const update = useIndicatorStore((s) => s.update);

  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Show on timeframes
      </div>
      <div className="flex flex-wrap gap-1.5 py-1">
        {VIS_TIMEFRAMES.map((tf) => {
          // Empty/unset = visible on every timeframe (opt-in hiding, per
          // indicatorStore.ts's `vis` field doc).
          const shown = inst.vis[tf] !== false;
          return (
            <button
              key={tf}
              type="button"
              onClick={() => update(inst.iid, { vis: { ...inst.vis, [tf]: !shown } })}
              className={cn(
                "flex h-7 min-w-[44px] items-center justify-center rounded border px-2 text-xs font-mono transition-colors",
                shown
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border text-muted-foreground hover:bg-secondary",
              )}
            >
              {tf}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
        Unchecking a timeframe hides this instance only while charting that timeframe — the
        instance and its settings stay saved.
      </p>
    </div>
  );
}

// ── Dialog shell ─────────────────────────────────────────────────────────

export function IndicatorSettingsDialog({ iid, onClose }: IndicatorSettingsDialogProps) {
  const inst = useIndicatorStore((s) => (iid ? s.inds.find((i) => i.iid === iid) : undefined));
  const update = useIndicatorStore((s) => s.update);
  const updateParams = useIndicatorStore((s) => s.updateParams);
  const setCode = useIndicatorStore((s) => s.setCode);
  const [tab, setTab] = useState<SettingsTab>("inputs");
  const [codeOpen, setCodeOpen] = useState(true);
  const drag = useDragOffset();
  const snapshotRef = useRef<{ iid: string; snapshot: EditableSnapshot } | null>(null);

  // Snapshot on open (for Cancel) + seed the Python editor from the catalog
  // template the first time this instance is opened with no code yet.
  useEffect(() => {
    if (!iid || !inst) return;
    if (snapshotRef.current?.iid === iid) return;
    snapshotRef.current = { iid, snapshot: snapshotOf(inst) };
    setTab("inputs");
    if (!inst.code) {
      const entry = catalogEntryFor(inst.type);
      if (entry?.codeTemplate) setCode(iid, entry.codeTemplate);
    }
    // Only re-snapshot when a *different* instance's dialog opens — not on
    // every store update the user themselves triggers while it's open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iid, inst?.iid]);

  if (!iid || !inst) return null;

  const entry = catalogEntryFor(inst.type);

  const close = () => {
    drag.reset();
    snapshotRef.current = null;
    onClose();
  };

  const handleCancel = () => {
    const snap = snapshotRef.current;
    if (snap && snap.iid === inst.iid) {
      update(inst.iid, { ...snap.snapshot });
    }
    close();
  };

  const handleApply = () => {
    // Fields are already committed live (fast-lane repaint); Apply just
    // stops treating them as "unsaved" and closes.
    close();
  };

  const handleResetDefaults = () => {
    if (entry) {
      updateParams(inst.iid, { ...entry.defaultParams });
      setCode(inst.iid, entry.codeTemplate ?? "");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={handleCancel}>
      <div
        className="flex max-h-[86vh] w-[640px] max-w-[94vw] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
        style={drag.style}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle header */}
        <div
          onPointerDown={drag.onPointerDown}
          className="flex cursor-grab select-none items-center justify-between border-b border-border px-3 py-2.5 active:cursor-grabbing"
        >
          <div className="flex min-w-0 items-center gap-2">
            <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: inst.color }} />
            <h2 className="truncate text-sm font-semibold text-foreground">
              {entry?.label ?? inst.type}
            </h2>
            {entry && (
              <span className="shrink-0 rounded bg-panel2 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                {entry.category}
              </span>
            )}
          </div>
          <button onClick={handleCancel} className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab bar — horizontal, 2px accent underline (design README §7) */}
        <div className="flex shrink-0 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex-1 border-b-2 py-2 text-xs font-semibold transition-colors",
                tab === t.id
                  ? "border-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Scrollable body: active tab + always-present Source code section */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {tab === "inputs" && <InputsTab inst={inst} />}
          {tab === "style" && <StyleTab inst={inst} />}
          {tab === "visibility" && <VisibilityTab inst={inst} />}

          <div className="mt-4 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setCodeOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 text-left text-xs font-semibold text-foreground"
            >
              {codeOpen ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              Source code (
              <span className="font-mono text-accent">
                {(entry?.abbrev ?? inst.type).toLowerCase()}.py
              </span>
              )
              <span className="ml-auto rounded bg-panel2 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                Python · editable
              </span>
            </button>
            {codeOpen && (
              <div className="mt-2">
                <PythonEditor
                  value={inst.code}
                  onChange={(code) => setCode(inst.iid, code)}
                  minHeight="200px"
                  maxHeight="360px"
                />
                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                  Preview is client-side (fast lane). Authoritative values come from the Freqtrade
                  backtest — this source is persisted with the instance but isn't executed
                  per-indicator yet.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-border px-3 py-2">
          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            Reset defaults
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="rounded px-3 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="rounded bg-accent px-3 py-1 text-xs font-medium text-accent-foreground hover:bg-accent/90"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
