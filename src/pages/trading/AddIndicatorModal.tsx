import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { IndicatorType } from "../../lib/indicators.ts";
import {
  CATALOG_CATEGORIES,
  type CatalogEntry,
  searchCatalog,
} from "../../services/freqtrade/catalog.ts";
import { useIndicatorStore } from "../../services/indicatorStore.ts";
import { cn } from "../../lib/utils.ts";

export interface AddIndicatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TAG_LABEL: Record<CatalogEntry["tag"], string> = {
  overlay: "overlay",
  candidate: "candidate",
  confluence: "confluence",
  pane: "pane",
};

function CatalogRow({ entry, onAdd }: { entry: CatalogEntry; onAdd: (entry: CatalogEntry) => void }) {
  return (
    <button
      type="button"
      disabled={entry.disabled}
      onClick={() => !entry.disabled && onAdd(entry)}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors",
        entry.disabled
          ? "cursor-default opacity-45"
          : "hover:bg-panel2 active:bg-panel2/80 cursor-pointer",
      )}
    >
      <span className="flex h-7 w-9 shrink-0 items-center justify-center rounded bg-accent/15 font-mono text-[10px] font-bold text-accent">
        {entry.abbrev}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-foreground">{entry.label}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{entry.description}</span>
      </span>
      <span className="shrink-0 rounded bg-panel2 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
        {entry.disabled ? "soon" : TAG_LABEL[entry.tag]}
      </span>
    </button>
  );
}

/**
 * Add-Indicator modal (plan U6, README §6) — 560px hand-rolled overlay,
 * mirroring `ChartSettingsDialog.tsx`'s `fixed inset-0` + `if (!isOpen)
 * return null` pattern (KTD8) rather than the unused Radix `Dialog`.
 *
 * Category-grouped, search-filtered list sourced from
 * `services/freqtrade/catalog.ts`. Clicking a non-disabled row adds an
 * instance to `indicatorStore` and closes; Elliott Wave/Harmonic rows are
 * "coming soon" and non-interactive (plan Scope Boundaries).
 */
export function AddIndicatorModal({ isOpen, onClose }: AddIndicatorModalProps) {
  const [query, setQuery] = useState("");
  const add = useIndicatorStore((s) => s.add);

  const grouped = useMemo(() => {
    const matches = searchCatalog(query);
    return CATALOG_CATEGORIES.map((category) => ({
      category,
      entries: matches.filter((e) => e.category === category),
    })).filter((g) => g.entries.length > 0);
  }, [query]);

  if (!isOpen) return null;

  const close = () => {
    setQuery("");
    onClose();
  };

  const handleAdd = (entry: CatalogEntry) => {
    if (entry.disabled) return;
    add({
      // Disabled entries use placeholder catalog-only types (ELLIOTT/HARMONIC)
      // that never reach here (guarded above) — this cast is safe for every
      // clickable row.
      type: entry.type as IndicatorType,
      params: { ...entry.defaultParams },
      plot: entry.plot,
      code: entry.codeTemplate,
    });
    close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-20" onClick={close}>
      <div
        className="flex max-h-[70vh] w-[560px] max-w-[94vw] flex-col overflow-hidden rounded-lg border border-border bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Indicators &amp; strategies</h2>
            <p className="text-[11px] text-muted-foreground">Python · runs in Freqtrade</p>
          </div>
          <button onClick={close} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2 rounded-md border border-border bg-panel2 px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              placeholder="Search indicators..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Category-grouped list */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {grouped.length === 0 ? (
            <div className="px-3 py-8 text-center text-[12px] text-muted-foreground">
              No indicators match &ldquo;{query}&rdquo;
            </div>
          ) : (
            grouped.map(({ category, entries }) => (
              <div key={category} className="mb-2 last:mb-0">
                <div className="px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                  {category}
                </div>
                <div className="space-y-0.5">
                  {entries.map((entry) => (
                    <CatalogRow key={`${entry.category}:${entry.type}`} entry={entry} onAdd={handleAdd} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
