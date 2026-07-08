import { GripVertical, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDragOffset } from "../../hooks/useDragOffset.ts";
import { api } from "../../services/api.ts";
import { PythonEditor } from "./PythonEditor.tsx";

/**
 * Strategy-source view (plan U7, RightPanel's "Edit strategy source .py"
 * button — README §5 "Strategy" card). A small, standalone dialog rather
 * than reusing `IndicatorSettingsDialog`: the Strategy tab's Elliott
 * Wave/Harmonic card has no backing `indicatorStore` instance (those catalog
 * entries are `disabled: true` — see `catalog.ts` — so they never reach
 * `indicatorStore.add()`), so there is no `iid`/`INPUTS` schema/Style/
 * Visibility to drive. What the design actually asks for here is just a
 * read/edit view of the active strategy's `.py`, seeded from
 * `GET /strategy/{name}` (KTD4) — this component is exactly that, in the
 * same `bg-code` editor surface as the indicator dialog's Python editor
 * (shares `PythonEditor.tsx`).
 *
 * Honesty note (KTD4): editing here is a local scratchpad only — there is no
 * `PUT /strategy/{name}` in the verified Freqtrade contract
 * (`services/freqtrade/client.ts` only exposes the `GET`), so edits are not
 * persisted or executed. This is surfaced in-UI, not silently dropped.
 */
export interface StrategySourceDialogProps {
  open: boolean;
  onClose: () => void;
  /** Defaults to the sample strategy per the plan's R10 sample set. */
  strategyName?: string;
}

export function StrategySourceDialog({
  open,
  onClose,
  strategyName = "RSIVolume",
}: StrategySourceDialogProps) {
  const drag = useDragOffset();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (loadedFor.current === strategyName) return;
    loadedFor.current = strategyName;
    setLoading(true);
    setError(null);
    api
      .getStrategySource(strategyName)
      .then((res) => {
        setCode((res as { code?: string } | null)?.code ?? "");
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load strategy source");
      })
      .finally(() => setLoading(false));
  }, [open, strategyName]);

  if (!open) return null;

  const close = () => {
    drag.reset();
    loadedFor.current = null;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={close}>
      <div
        className="flex h-[520px] w-[640px] max-w-[94vw] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
        style={drag.style}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          onPointerDown={drag.onPointerDown}
          className="flex cursor-grab select-none items-center justify-between border-b border-border px-3 py-2.5 active:cursor-grabbing"
        >
          <div className="flex items-center gap-1.5">
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/60" />
            <h2 className="text-sm font-semibold text-foreground">
              Strategy source ·{" "}
              <span className="font-mono text-accent">{strategyName}.py</span>
            </h2>
          </div>
          <button onClick={close} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading strategy source…
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <p className="text-xs text-destructive">{error}</p>
              <p className="text-[10px] text-muted-foreground">
                Backend may be offline — the terminal keeps running without it.
              </p>
            </div>
          ) : (
            <PythonEditor value={code} onChange={setCode} minHeight="380px" maxHeight="100%" />
          )}
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            Read/edit scratchpad — this strategy's authority is the Freqtrade backtest
            (`populate_indicators`/`populate_entry_trend`). Edits here aren't saved back to
            Freqtrade yet; there is no write endpoint in the current backend contract.
          </p>
        </div>

        <div className="flex shrink-0 items-center justify-end border-t border-border px-3 py-2">
          <button
            onClick={close}
            className="rounded bg-secondary px-3 py-1 text-xs text-foreground hover:bg-secondary/70"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
