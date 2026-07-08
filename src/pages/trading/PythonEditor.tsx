/**
 * Python source editor (plan U7 / KTD4) — CodeMirror 6 wrapper used by both
 * `IndicatorSettingsDialog.tsx`'s always-present "Source code" section and
 * `StrategySourceDialog.tsx`'s strategy-source view.
 *
 * Self-contained on purpose: every CodeMirror-specific import lives in this
 * one file so the rest of the dialog code never touches CodeMirror internals
 * directly (per the plan's "keep it self-contained" instruction) — swapping
 * the underlying editor later only touches this file.
 *
 * Belt-and-suspenders degrade path: an internal error boundary wraps the
 * CodeMirror render. If the installed CodeMirror packages resolve to a
 * different API shape than assumed here (untested — this box cannot
 * `npm install`, see plan's RAM constraint), the boundary catches the render
 * failure and swaps in a plain `<textarea>` so the dialog still opens and the
 * Python source is still readable/editable instead of crashing the page.
 */
import { Component, type ReactNode } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { cn } from "../../lib/utils.ts";

export interface PythonEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  className?: string;
  /** CSS height value for the visible editor area before it starts
   *  scrolling internally (the dialog body around it also scrolls). */
  minHeight?: string;
  maxHeight?: string;
}

// Repaint the editor's own background/gutter to sit flush on the Trading Lab
// `bg-code` surface (design token `--code-bg`, #0d1017 dark) instead of
// `oneDark`'s default panel color — the container div supplies the real
// background; this just makes CodeMirror's internal layers transparent so it
// shows through cleanly.
const codeSurfaceTheme = EditorView.theme(
  {
    "&": { backgroundColor: "transparent" },
    ".cm-gutters": {
      backgroundColor: "transparent",
      borderRight: "1px solid hsl(var(--border))",
      color: "hsl(var(--muted-foreground))",
    },
    ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.04)" },
    ".cm-activeLineGutter": { backgroundColor: "rgba(255,255,255,0.04)" },
    ".cm-content": {
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace",
      fontSize: "12px",
    },
    "&.cm-focused": { outline: "none" },
  },
  { dark: true },
);

/** Plain, dependency-free fallback surface — same tokens, no syntax
 *  highlighting. Used both as the true fallback (error boundary trips) and
 *  is easy to reason about if CodeMirror's `basicSetup`/`extensions` prop
 *  shapes drift across a version bump. */
function PlainTextFallback({
  value,
  onChange,
  readOnly,
  minHeight,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  minHeight: string;
}) {
  return (
    <textarea
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
      wrap="off"
      style={{ minHeight }}
      className="w-full resize-y bg-transparent p-3 font-mono text-[12px] leading-relaxed text-foreground outline-none"
    />
  );
}

interface BoundaryState {
  hasError: boolean;
}

/** Class component on purpose — `getDerivedStateFromError` /
 *  `componentDidCatch` only exist on class components; there is no hook
 *  equivalent for catching a child's render error. */
class CodeMirrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, BoundaryState> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.warn(
      "[PythonEditor] CodeMirror failed to render — falling back to a plain textarea.",
      error,
    );
  }

  render(): ReactNode {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function CodeMirrorEditor({
  value,
  onChange,
  readOnly,
  minHeight,
  maxHeight,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  minHeight: string;
  maxHeight: string;
}) {
  return (
    <CodeMirror
      value={value}
      onChange={(val) => onChange(val)}
      editable={!readOnly}
      readOnly={readOnly}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: !readOnly,
        highlightActiveLineGutter: !readOnly,
        autocompletion: false,
      }}
      extensions={[python(), oneDark, codeSurfaceTheme]}
      height="auto"
      minHeight={minHeight}
      maxHeight={maxHeight}
    />
  );
}

/**
 * Line-numbered, Python-highlighted, editable source editor on the
 * `bg-code` surface. Controlled component — `value`/`onChange` are the only
 * contract callers need; everything CodeMirror-specific is internal.
 */
export function PythonEditor({
  value,
  onChange,
  readOnly = false,
  className,
  minHeight = "220px",
  maxHeight = "420px",
}: PythonEditorProps) {
  return (
    <div className={cn("overflow-hidden rounded-md border border-border bg-code", className)}>
      <CodeMirrorBoundary
        fallback={
          <PlainTextFallback
            value={value}
            onChange={onChange}
            readOnly={readOnly}
            minHeight={minHeight}
          />
        }
      >
        <CodeMirrorEditor
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          minHeight={minHeight}
          maxHeight={maxHeight}
        />
      </CodeMirrorBoundary>
    </div>
  );
}
