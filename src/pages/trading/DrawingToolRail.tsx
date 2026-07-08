import {
  Eraser,
  Layers,
  type LucideIcon,
  Magnet,
  Minus,
  MousePointer2,
  MoveUpRight,
  Square,
  TrendingUp,
  Type,
} from "lucide-react";
import { cn } from "../../lib/utils.ts";
import type { DrawingTool, MagnetMode } from "./constants.ts";

interface RailTool {
  tool: DrawingTool;
  icon: LucideIcon;
  label: string;
}

/**
 * Flat vertical stack matching the Trading Lab design
 * (design_handoff_trading_lab/README.md §"Screens" region 2): Cursor, Trend
 * line, Horizontal, Ray, Rectangle, Fib retracement, Text, Eraser, divider,
 * Magnet. Deeper tool variants (fib extension, parallel channel, ellipse,
 * triangle, arrow, long/short position, measure, extended line, vertical
 * line) stay reachable from the toolbar's "Drawing Tools" dropdown
 * (ChartToolbar.tsx `DrawingToolsDropdown`) — this rail is the design's
 * quick-access set only, not the full tool catalog.
 */
const RAIL_TOOLS: RailTool[] = [
  { tool: "trendline", icon: TrendingUp, label: "Trend line" },
  { tool: "horizontal", icon: Minus, label: "Horizontal line" },
  { tool: "ray", icon: MoveUpRight, label: "Ray" },
  { tool: "rectangle", icon: Square, label: "Rectangle" },
  { tool: "fibonacci", icon: Layers, label: "Fib retracement" },
  { tool: "text", icon: Type, label: "Text" },
];

function RailButton({
  icon: Icon,
  title,
  active,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      <Icon className="h-[17px] w-[17px]" strokeWidth={1.7} />
    </button>
  );
}

/**
 * Left drawing rail — design region 2 (46px, `--panel` bg, 1px `--border`
 * right). Docked as a fixed column by `TradingPage.tsx` (desktop only; on
 * mobile the toolbar's own drawing-tool affordances are already hidden, so
 * this rail follows the same `md:` breakpoint as the rest of the desktop
 * chart chrome).
 */
export function DrawingToolRail({
  drawingTool,
  onDrawingTool,
  magnetMode = "none",
  onCycleMagnet,
  onClearDrawings,
}: {
  drawingTool: DrawingTool;
  onDrawingTool: (t: DrawingTool) => void;
  magnetMode?: MagnetMode;
  onCycleMagnet?: () => void;
  onClearDrawings?: () => void;
}) {
  const select = (t: DrawingTool) => {
    onDrawingTool(drawingTool === t ? "none" : t);
  };

  return (
    <div className="hidden md:flex w-[46px] shrink-0 flex-col items-center gap-0.5 border-r border-border bg-card py-2">
      <RailButton
        icon={MousePointer2}
        title="Cursor"
        active={drawingTool === "none"}
        onClick={() => onDrawingTool("none")}
      />
      {RAIL_TOOLS.map((t) => (
        <RailButton
          key={t.tool}
          icon={t.icon}
          title={t.label}
          active={drawingTool === t.tool}
          onClick={() => select(t.tool)}
        />
      ))}
      <RailButton icon={Eraser} title="Clear all drawings" onClick={() => onClearDrawings?.()} />
      <div className="my-1 h-px w-[22px] bg-border" />
      <RailButton
        icon={Magnet}
        title={
          magnetMode === "strong"
            ? "Magnet: strong"
            : magnetMode === "weak"
              ? "Magnet: weak"
              : "Magnet: off"
        }
        active={magnetMode !== "none"}
        onClick={() => onCycleMagnet?.()}
      />
    </div>
  );
}
