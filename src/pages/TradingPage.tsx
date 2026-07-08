import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsFeedConnected } from "../components/ConnectionIndicator.tsx";
import { MobileAccountBar, MobileTradingPanel } from "../components/MobileTradingPanel.tsx";
import {
  OrderConfirmDialog,
  OrderModifyDialog,
  PositionModifyDialog,
} from "../components/TradingDialogs.tsx";
import { NewsFeed as MarketNewsFeed } from "../components/TradingPowerFeatures.tsx";
import { TradingViewTechnicalAnalysis } from "../components/TradingViewWidgets.tsx";
import { useChartDrawings } from "../hooks/useChartDrawings.ts";
import {
  getChartPreferencesFromStorage,
  updateChartPreferences,
  useChartPreferences,
} from "../hooks/useChartPreferences.ts";
import { useTradeSound } from "../hooks/useTradeSound";
import type { IndicatorType } from "../lib/indicators.ts";
import { posthog } from "../lib/posthog";
import type { CreateJournalEntryInput, UpdateJournalEntryInput } from "../services/api/journal.ts";
import { api } from "../services/api.ts";
import { useIndicatorStore } from "../services/indicatorStore.ts";
import {
  useAiTraderEnabled,
  useCandles,
  useCreateJournalEntry,
  useDeleteJournalEntry,
  useJournalEntries,
  useOrders,
  usePairIndicators,
  usePositions,
  useSymbols,
  useUpdateJournalEntry,
} from "../services/queries.ts";
import type { Order, PlaceOrderInput, Position, Symbol } from "../services/schemas.ts";
import { useTradingStore } from "../services/store.tsx";
import { toast } from "../services/toast.ts";
import { AiTraderPanel } from "./AiTraderPage.tsx";
import { AddIndicatorModal } from "./trading/AddIndicatorModal.tsx";
import { type BottomPanelTab, BottomPanel } from "./trading/BottomPanel.tsx";
import { ChartPanel } from "./trading/ChartPanel.tsx";
import { ChartToolbar } from "./trading/ChartToolbar.tsx";
import {
  type DrawingTool,
  LAYOUT,
  type MagnetMode,
  REPLAY_ENABLED,
  TIMEFRAMES,
  type Timeframe,
} from "./trading/constants.ts";
import { DOMPanel } from "./trading/DOMPanel.tsx";
import { DrawingToolRail } from "./trading/DrawingToolRail.tsx";
import { IndicatorSettingsDialog } from "./trading/IndicatorSettingsDialog.tsx";
import { MarketClosedBanner } from "./trading/MarketClosedBanner.tsx";
import { type StrategyPanelTab, RightPanel } from "./trading/RightPanel.tsx";
import { ReplayScrubber } from "./trading/ReplayScrubber.tsx";
import { StrategySourceDialog } from "./trading/StrategySourceDialog.tsx";
import type { BacktestRunStatus } from "./trading/StrategyTester/StrategyTesterPanel.tsx";
import { useReplayChartData } from "./trading/useReplayChartData.ts";
import { useReplayPlayback } from "./trading/useReplayPlayback.ts";
import { computeDefaultTimerange, getPipDigits } from "./trading/utils.ts";
import { pickAuthoritativeBollinger } from "../services/freqtrade/mappers.ts";
import type { MappedBacktestResults } from "../services/freqtrade/mappers.ts";

type ErrorWithMessage = { message?: string };

type ConfirmOrderState = {
  symbol: string;
  side: "BUY" | "SELL";
  type: string;
  quantity: number;
  price?: number;
  stopPrice?: number;
  takeProfit?: number;
  stopLoss?: number;
  _submit: () => Promise<unknown>;
} | null;

function getErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as ErrorWithMessage).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "Request failed";
}

export function TradingPage() {
  const hasTrackedFirstTrade = useRef(false);

  const handleFirstTrade = useCallback(() => {
    if (!hasTrackedFirstTrade.current) {
      hasTrackedFirstTrade.current = true;
      posthog.capture("funnel.trade.first_executed", { sessionId: posthog.get_session_id?.() });
    }
  }, []);

  const {
    selectedSymbol,
    setSelectedSymbol,
    ticks,
    updateTick,
    activeAccountId,
    symbols: _storeSymbols,
    replayVersion,
    isReplaying,
  } = useTradingStore();
  // Chart timeframe persistence (#8)
  const [timeframe, setTimeframe] = useState<Timeframe>(() => {
    const saved = localStorage.getItem(`tf_${selectedSymbol}`);
    return saved && TIMEFRAMES.includes(saved as Timeframe) ? (saved as Timeframe) : "15m";
  });
  const handleTimeframeChange = useCallback(
    (tf: Timeframe) => {
      setTimeframe(tf);
      localStorage.setItem(`tf_${selectedSymbol}`, tf);
    },
    [selectedSymbol],
  );
  // Restore timeframe when symbol changes
  useEffect(() => {
    const saved = localStorage.getItem(`tf_${selectedSymbol}`);
    if (saved && TIMEFRAMES.includes(saved as Timeframe)) setTimeframe(saved as Timeframe);
  }, [selectedSymbol]);

  // Indicator instances (plan U4) — the store is the single source of truth;
  // `activeIndicatorTypes` below is a derived `IndicatorType[]` view kept
  // only to satisfy `ChartToolbar`'s legacy dropdown (plan U3) contract.
  const inds = useIndicatorStore((s) => s.inds);
  const addIndicator = useIndicatorStore((s) => s.add);
  const removeIndicator = useIndicatorStore((s) => s.remove);
  const clearIndicators = useIndicatorStore((s) => s.clear);
  const activeIndicatorTypes = useMemo(
    () => Array.from(new Set(inds.map((i) => i.type))),
    [inds],
  );
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
  // Add-Indicator modal (plan U6) — the toolbar's ƒx button opens this once
  // wired below; the legacy type-only dropdown (plan U3) stays available too.
  const [showAddIndicatorModal, setShowAddIndicatorModal] = useState(false);
  const [drawingTool, setDrawingTool] = useState<DrawingTool>("none");
  const {
    drawings,
    addDrawing,
    updateDrawing,
    removeDrawing,
    clearDrawings,
    undo: undoDrawing,
    redo: redoDrawing,
  } = useChartDrawings(selectedSymbol, timeframe);
  const [activePlugins, setActivePlugins] = useState<string[]>(
    () => getChartPreferencesFromStorage().activePlugins,
  );
  const handleTogglePlugin = useCallback((id: string) => {
    setActivePlugins((prev) => {
      const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
      updateChartPreferences({ activePlugins: next });
      return next;
    });
  }, []);
  // Template load — replace the whole plugin list at once.
  const handleSetPlugins = useCallback((ids: string[]) => {
    setActivePlugins(ids);
    updateChartPreferences({ activePlugins: ids });
  }, []);
  const [bottomTab, setBottomTab] = useState<BottomPanelTab>("positions");
  const { data: aiTraderEnabled } = useAiTraderEnabled();
  const [rightPanel, setRightPanel] = useState<
    StrategyPanelTab | "dom" | "news" | "ai-trader" | "tv-analysis"
  >("strategy");
  const [showRightPanel, setShowRightPanel] = useState(true);

  // ── Vertical resize: chart vs bottom panel ──
  const [bottomPanelHeight, setBottomPanelHeight] = useState(() => {
    const saved = localStorage.getItem("bottomPanelHeight");
    return saved ? parseInt(saved, 10) : LAYOUT.testerHeight;
  });
  // Strategy-Tester collapse (design region 4, toolbar ⊞ toggle) — the main
  // chart pane reclaims the space via its own min-h-[200px] flex-1 clamp.
  const [bottomPanelCollapsed, setBottomPanelCollapsed] = useState(
    () => localStorage.getItem("bottomPanelCollapsed") === "true",
  );
  const toggleBottomPanelCollapsed = useCallback(() => {
    setBottomPanelCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("bottomPanelCollapsed", String(next));
      return next;
    });
  }, []);
  const resizingRef = useRef(false);
  const resizeStartY = useRef(0);
  const resizeStartH = useRef(0);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      resizingRef.current = true;
      const clientY = "touches" in e ? e.touches[0]!.clientY : e.clientY;
      resizeStartY.current = clientY;
      resizeStartH.current = bottomPanelHeight;

      const onMove = (ev: MouseEvent | TouchEvent) => {
        if (!resizingRef.current) return;
        const y = "touches" in ev ? ev.touches[0]!.clientY : (ev as MouseEvent).clientY;
        const delta = resizeStartY.current - y;
        const newH = Math.max(100, Math.min(600, resizeStartH.current + delta));
        setBottomPanelHeight(newH);
      };
      const onUp = () => {
        resizingRef.current = false;
        setBottomPanelHeight((h) => {
          localStorage.setItem("bottomPanelHeight", String(h));
          return h;
        });
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        window.removeEventListener("touchmove", onMove);
        window.removeEventListener("touchend", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("touchmove", onMove, { passive: false });
      window.addEventListener("touchend", onUp);
    },
    [bottomPanelHeight],
  );

  // (#4) One-click trading mode
  const [oneClick, setOneClick] = useState(
    () => localStorage.getItem("oneClickTrading") === "true",
  );

  // Trade sound effect
  const { muted: soundMuted, toggleMute: toggleSoundMute, playTradeSound } = useTradeSound();
  const toggleOneClick = useCallback(() => {
    setOneClick((prev) => {
      const v = !prev;
      localStorage.setItem("oneClickTrading", String(v));
      return v;
    });
  }, []);

  // (#6) Position modify dialog
  const [modifyingPosition, setModifyingPosition] = useState<Position | null>(null);

  // (#30) Order modify dialog
  const [modifyingOrder, setModifyingOrder] = useState<Order | null>(null);

  // (#7) Order confirmation dialog
  const [confirmOrder, setConfirmOrder] = useState<ConfirmOrderState>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const queryClient = useQueryClient();
  const { data: symbols = [] } = useSymbols();
  const isFeedConnected = useIsFeedConnected();

  // Prime the active symbol with a fresh server-side snapshot immediately on
  // symbol switch so bid/ask appears without waiting for the next WS tick.
  useEffect(() => {
    let cancelled = false;
    void api
      .getTick(selectedSymbol)
      .then((tick) => {
        if (cancelled || !tick) return;
        updateTick(
          selectedSymbol,
          Number(tick.bid),
          Number(tick.ask),
          typeof tick.timestamp === "number" ? tick.timestamp : Date.now(),
        );
      })
      .catch(() => {
        // Ignore snapshot misses; WS stream remains authoritative.
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSymbol, updateTick]);

  // Handler for chart drag-to-edit SL/TP levels
  const handleChartModifyPosition = useCallback(
    async (positionId: string, mods: { takeProfit?: number | null; stopLoss?: number | null }) => {
      if (!isFeedConnected) {
        toast.warning(
          "No Data Feed",
          "Cannot modify positions while disconnected from the data feed",
        );
        if (activeAccountId)
          queryClient.invalidateQueries({
            queryKey: ["positions", activeAccountId],
          });
        return;
      }
      try {
        await api.modifyPosition(positionId, mods);
        const field = mods.takeProfit !== undefined ? "TP" : "SL";
        const price = mods.takeProfit !== undefined ? mods.takeProfit : mods.stopLoss;
        toast.success(`${field} Updated`, `${field} set to ${price}`);
        if (activeAccountId) {
          queryClient.invalidateQueries({
            queryKey: ["positions", activeAccountId],
          });
        }
      } catch (err: unknown) {
        toast.error("Modify Failed", getErrorMessage(err));
        // Refetch to revert price line to original value
        if (activeAccountId) {
          queryClient.invalidateQueries({
            queryKey: ["positions", activeAccountId],
          });
        }
      }
    },
    [activeAccountId, queryClient, isFeedConnected],
  );

  // Chart context-menu quick orders (Buy/Sell limit/stop at the clicked price).
  // Always routes through the confirm dialog so a stray right-click can never
  // place an order directly.
  const handleQuickOrder = useCallback(
    (side: "BUY" | "SELL", type: "LIMIT" | "STOP", price: number) => {
      if (!activeAccountId) {
        toast.warning("No Account", "Select an account before placing orders");
        return;
      }
      const input: PlaceOrderInput = {
        accountId: activeAccountId,
        symbol: selectedSymbol,
        side,
        type,
        quantity: 1,
        ...(type === "LIMIT" ? { price } : { stopPrice: price }),
      };
      setConfirmOrder({
        symbol: selectedSymbol,
        side,
        type,
        quantity: 1,
        price: type === "LIMIT" ? price : undefined,
        stopPrice: type === "STOP" ? price : undefined,
        _submit: () => api.placeOrder(input),
      });
    },
    [activeAccountId, selectedSymbol],
  );

  const handleClearIndicators = useCallback(() => {
    clearIndicators();
  }, [clearIndicators]);

  // Legacy dropdown "toggle" (plan U3/U4 bridge): add a default-params
  // instance of `type` if none exists yet, otherwise remove every instance
  // of that type. Multiple same-type instances added via the new
  // Add-Indicator modal (U6) still individually manage themselves — this
  // only drives the coarse on/off toolbar checkbox.
  const handleToggleIndicator = useCallback(
    (type: IndicatorType) => {
      const existing = inds.filter((i) => i.type === type);
      if (existing.length > 0) {
        for (const i of existing) removeIndicator(i.iid);
      } else {
        addIndicator({ type });
      }
    },
    [inds, addIndicator, removeIndicator],
  );

  // Chart-template "load" (plan U3 `ChartTemplatesMenu`): templates only
  // ever stored a flat `IndicatorType[]` (never per-instance params), so
  // loading one replaces the whole store with one default instance per type
  // — the same fidelity the pre-U4 model had.
  const handleSetIndicators = useCallback(
    (types: IndicatorType[]) => {
      clearIndicators();
      for (const type of types) addIndicator({ type });
    },
    [clearIndicators, addIndicator],
  );

  // Deep-history target used after the initial fast render completes.
  const deepCandleLimit = useMemo(() => {
    switch (timeframe) {
      case "1m":
        return 3_000;
      case "5m":
        return 5_000;
      case "15m":
        return 12_000;
      case "30m":
        return 8_000;
      case "1h":
        return 8_760;
      case "4h":
        return 2_500;
      case "1d":
        return 1_000;
      case "1w":
        return 520;
      default:
        return 5_000;
    }
  }, [timeframe]);
  // First paint: viewport-sized so the initial fetch is as small as possible.
  // Mobile (<768px) needs fewer bars to fill the screen; desktop gets more.
  // The deep-history fetch fires 400ms later and loads a full year of data.
  const firstPaintCandleLimit = useMemo(() => {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    return isMobile ? 500 : 400;
  }, []);
  const [candleLimit, setCandleLimit] = useState(firstPaintCandleLimit);
  useEffect(() => {
    setCandleLimit(firstPaintCandleLimit);
    // Wait long enough for the first-paint response to arrive and render
    // before firing the heavier deep-history request. 400 ms is a reasonable
    // budget for a cached/warm DB response; users on fast connections will
    // see data before the deep load starts, avoiding visible re-draws.
    const timer = window.setTimeout(() => {
      setCandleLimit(deepCandleLimit);
    }, 400);
    return () => {
      window.clearTimeout(timer);
    };
  }, [selectedSymbol, timeframe, firstPaintCandleLimit, deepCandleLimit]);
  const { data: candles = [] } = useCandles(selectedSymbol, timeframe, candleLimit, replayVersion);
  // Replay: sliced 1m buffer + trade-event markers; null when not replaying.
  // While replayCandles is set, the live tick/candle feed is suppressed below
  // so real-time data can't paint over the playback.
  const { replayCandles, replayTradeEvents } = useReplayChartData(activeAccountId);
  const chartPrefs = useChartPreferences();
  const cycleMagnetMode = useCallback(() => {
    const order: MagnetMode[] = ["none", "weak", "strong"];
    const next = order[(order.indexOf(chartPrefs.magnetMode) + 1) % order.length] ?? "none";
    updateChartPreferences({ magnetMode: next });
  }, [chartPrefs.magnetMode]);
  useReplayPlayback(activeAccountId ?? "");
  const { data: positions = [] } = usePositions(activeAccountId);
  const { data: orders = [] } = useOrders(activeAccountId);
  const chartPositions = chartPrefs.overlayPositionsOnChart ? positions : [];
  const chartOrders = chartPrefs.overlayPositionsOnChart ? orders : [];
  const positionPnl = useMemo(
    () => positions.reduce((sum, position) => sum + (position.unrealizedPnl || 0), 0),
    [positions],
  );

  // (#26) Trade journal
  const { data: journalData, isLoading: journalLoading } = useJournalEntries(activeAccountId);
  const createJournal = useCreateJournalEntry();
  const updateJournal = useUpdateJournalEntry();
  const deleteJournal = useDeleteJournalEntry();

  // Get account data for risk display
  const account = useTradingStore((s) => s.accounts.find((a) => a.id === activeAccountId));

  const tick = ticks[selectedSymbol];
  const symbolInfo = symbols.find((s) => s.name === selectedSymbol) as Symbol | undefined;
  const liveCandleUpdates = useTradingStore((s) => s.liveCandleUpdates);
  const liveCandle = liveCandleUpdates[`${selectedSymbol}:${timeframe}`];
  const pipDigits = useMemo(
    () => getPipDigits(symbolInfo, selectedSymbol),
    [symbolInfo, selectedSymbol],
  );

  // Theme toggle (design region 1, ☾/☀) — single source of truth for the
  // `.light` class on <html>; nothing else in the app mutated this class
  // before, so this both introduces and owns the toggle mechanism.
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light") return false;
    if (saved === "dark") return true;
    return !document.documentElement.classList.contains("light");
  });
  useEffect(() => {
    document.documentElement.classList.toggle("light", !isDark);
  }, [isDark]);
  const handleToggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      localStorage.setItem("theme", next ? "dark" : "light");
      return next;
    });
  }, []);

  // Strategy Tester — Freqtrade backtest round-trip (plan U9). Load the
  // active strategy name once (informational label + default backtest
  // target); `getStrategies()` already tolerates a down/misconfigured
  // backend by resolving to `[]` (see services/api.ts), so this never
  // blocks boot.
  const [activeStrategyName, setActiveStrategyName] = useState<string | null>(null);
  const [strategies, setStrategies] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    api
      .getStrategies()
      .then((list) => {
        if (!cancelled && Array.isArray(list) && list.length > 0) {
          setStrategies(list);
          setActiveStrategyName((prev) => prev ?? list[0] ?? null);
        }
      })
      .catch(() => {
        // getStrategies() already swallows failures internally; this guards
        // only against a genuinely unexpected throw.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [backtestStatus, setBacktestStatus] = useState<BacktestRunStatus>("idle");
  const [backtestProgress, setBacktestProgress] = useState<number | undefined>(undefined);
  const [backtestResults, setBacktestResults] = useState<MappedBacktestResults | null>(null);
  const [backtestError, setBacktestError] = useState<string | null>(null);
  const [backtestTimerange, setBacktestTimerange] = useState<string | null>(null);
  const backtestPollTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (backtestPollTimer.current != null) window.clearTimeout(backtestPollTimer.current);
    },
    [],
  );

  // Authoritative overlay reconciliation (plan U10 / R5): once a backtest
  // has completed, fetch the same `/pair_candles` response `useCandles`
  // already reads (identical query key/args → shared cache entry, no extra
  // request) and pick out the authoritative Bollinger columns to draw over
  // the client-side BOLL preview. Gated on `backtestStatus === "done"` so
  // this is a no-op query during ordinary chart browsing. Note this assumes
  // the backtest ran against the currently selected symbol/timeframe — the
  // same assumption `backtestSymbol`/`backtestTimeframe` below already make
  // (plan U9); there's no separate "the backtest was run for X/Y" record.
  const { data: pairIndicators } = usePairIndicators(
    selectedSymbol,
    timeframe,
    candleLimit,
    replayVersion,
    backtestStatus === "done",
  );
  const authoritativeBollinger = useMemo(
    () => (pairIndicators ? pickAuthoritativeBollinger(pairIndicators) : null),
    [pairIndicators],
  );

  // Run backtest (toolbar ▶ button, plan U9): POST /backtest -> poll
  // GET /backtest (progress 0..1 -> toolbar NN%) -> on completion, map the
  // raw BacktestResult into the Strategy Tester's `results` shape and
  // surface the tab. Errors and a zero-trades result both resolve to a
  // rendered state, never a crash (mapBacktestResult is zero-trades-safe).
  const handleRunBacktest = useCallback(() => {
    if (backtestStatus === "running") return; // one run at a time
    const strategyName = activeStrategyName ?? "RSIVolume";
    const timerange = computeDefaultTimerange(candles);

    setBacktestStatus("running");
    setBacktestProgress(0);
    setBacktestError(null);
    setBacktestResults(null);
    setBacktestTimerange(timerange);
    setBottomTab("tester");
    if (bottomPanelCollapsed) toggleBottomPanelCollapsed();

    const poll = () => {
      api
        .pollBacktest()
        .then((status) => {
          const pct = Math.round(Math.max(0, Math.min(1, status.progress ?? 0)) * 100);
          setBacktestProgress(pct);

          if (!status.running && status.backtest_result) {
            const mapped = api.mapBacktestResult(status.backtest_result, strategyName);
            setBacktestResults(mapped);
            setBacktestStatus("done");
            setBacktestProgress(undefined);
            return;
          }
          if (status.status === "error" || (!status.running && status.status_msg && !status.backtest_result)) {
            setBacktestStatus("error");
            setBacktestError(status.status_msg || "Backtest failed");
            setBacktestProgress(undefined);
            return;
          }
          backtestPollTimer.current = window.setTimeout(poll, 1500);
        })
        .catch((err: unknown) => {
          setBacktestStatus("error");
          setBacktestError(getErrorMessage(err));
          setBacktestProgress(undefined);
        });
    };

    api
      .startBacktest({ strategy: strategyName, timeframe, timerange, enable_protections: false })
      .then(() => {
        backtestPollTimer.current = window.setTimeout(poll, 800);
      })
      .catch((err: unknown) => {
        setBacktestStatus("error");
        setBacktestError(getErrorMessage(err));
        setBacktestProgress(undefined);
      });
  }, [
    activeStrategyName,
    candles,
    timeframe,
    backtestStatus,
    bottomPanelCollapsed,
    toggleBottomPanelCollapsed,
  ]);

  // Legend gear / oscillator-pane gear (plan U5/U6) → opens the ★ core
  // Indicator Settings dialog (plan U7) for that instance.
  const [settingsIid, setSettingsIid] = useState<string | null>(null);
  const handleOpenIndicatorSettings = useCallback((iid: string) => {
    setSettingsIid(iid);
  }, []);

  // Strategy tab "Edit strategy source" — the Elliott Wave/Harmonic card has
  // no backing indicatorStore instance (those catalog entries are
  // `disabled: true`, so they never reach `indicatorStore.add()`), so this
  // opens the standalone `StrategySourceDialog` seeded from the active
  // strategy's `.py` instead of `IndicatorSettingsDialog` (see that file's
  // header comment for the full rationale).
  const [showStrategySource, setShowStrategySource] = useState(false);
  const handleEditStrategy = useCallback(() => {
    setShowStrategySource(true);
  }, []);

  // Mobile trading state
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Mobile Account Bar (small screens only) ────── */}
      <div className="md:hidden">
        <MobileAccountBar
          balance={account?.balance ?? 0}
          equity={account?.equity ?? account?.balance ?? 0}
          margin={account?.margin ?? 0}
          pnl={positionPnl}
        />
      </div>

      {/* ── Top Toolbar ──────────────────────────────────── */}
      <ChartToolbar
        selectedSymbol={selectedSymbol}
        symbols={symbols}
        onSymbolChange={setSelectedSymbol}
        timeframe={timeframe}
        onTimeframeChange={handleTimeframeChange}
        activeIndicators={activeIndicatorTypes}
        onToggleIndicator={handleToggleIndicator}
        showIndicatorMenu={showIndicatorMenu}
        onToggleIndicatorMenu={() => setShowIndicatorMenu((v) => !v)}
        onOpenIndicators={() => setShowAddIndicatorModal(true)}
        drawingTool={drawingTool}
        onDrawingTool={setDrawingTool}
        drawings={drawings}
        onClearDrawings={clearDrawings}
        rightPanel={rightPanel}
        onRightPanel={setRightPanel}
        showRightPanel={showRightPanel}
        onToggleRightPanel={() => setShowRightPanel((v) => !v)}
        tick={tick}
        symbolInfo={symbolInfo}
        aiTraderEnabled={aiTraderEnabled?.enabled ?? false}
        isReplaying={isReplaying}
        replayAccountId={activeAccountId}
        activePlugins={activePlugins}
        onTogglePlugin={handleTogglePlugin}
        onSetIndicators={handleSetIndicators}
        onSetPlugins={handleSetPlugins}
        magnetMode={chartPrefs.magnetMode}
        onCycleMagnet={cycleMagnetMode}
        stayInDrawingMode={chartPrefs.stayInDrawingMode}
        onToggleStayInDrawingMode={() =>
          updateChartPreferences({ stayInDrawingMode: !chartPrefs.stayInDrawingMode })
        }
        onRunBacktest={handleRunBacktest}
        backtestProgress={backtestProgress}
        strategies={strategies}
        activeStrategy={activeStrategyName}
        onSelectStrategy={setActiveStrategyName}
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
        testerOpen={!bottomPanelCollapsed}
        onToggleTester={toggleBottomPanelCollapsed}
      />

      <MarketClosedBanner symbolInfo={symbolInfo} />

      {/* ── Main Layout ──────────────────────────────────── */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* Left drawing rail — design region 2, spans chart + tester */}
        <DrawingToolRail
          drawingTool={drawingTool}
          onDrawingTool={setDrawingTool}
          magnetMode={chartPrefs.magnetMode}
          onCycleMagnet={cycleMagnetMode}
          onClearDrawings={clearDrawings}
        />

        {/* Chart + Bottom Panel */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Chart Area */}
          <div className="flex-1 min-h-[200px] relative">
            <ChartPanel
              candles={replayCandles ?? candles}
              selectedSymbol={selectedSymbol}
              timeframe={replayCandles ? "1m" : timeframe}
              isDark={isDark}
              drawingTool={drawingTool}
              drawings={drawings}
              onAddDrawing={addDrawing}
              onUpdateDrawing={updateDrawing}
              onRemoveDrawing={removeDrawing}
              onDrawingComplete={() => setDrawingTool("none")}
              onDrawingToolSelect={setDrawingTool}
              onUndoDrawing={undoDrawing}
              onRedoDrawing={redoDrawing}
              magnetMode={chartPrefs.magnetMode}
              stayInDrawingMode={chartPrefs.stayInDrawingMode}
              positions={chartPositions}
              orders={chartOrders}
              tick={replayCandles ? undefined : tick}
              liveCandle={replayCandles ? undefined : liveCandle}
              pipDigits={pipDigits}
              symbolInfo={symbolInfo}
              onModifyPosition={handleChartModifyPosition}
              replayTradeEvents={replayTradeEvents}
              isReplaying={isReplaying}
              activePlugins={activePlugins}
              onTogglePlugin={handleTogglePlugin}
              accountEquity={account?.equity ?? account?.balance ?? 0}
              accountId={activeAccountId}
              onQuickOrder={handleQuickOrder}
              onClearDrawings={clearDrawings}
              onClearIndicators={handleClearIndicators}
              onOpenIndicatorSettings={handleOpenIndicatorSettings}
              backtestTrades={backtestResults?.trades}
              authoritativeBollinger={authoritativeBollinger}
            />
          </div>

          {/* Replay timeline scrubber — disabled until the feature is QA'd */}
          {REPLAY_ENABLED && isReplaying && activeAccountId != null && (
            <ReplayScrubber accountId={activeAccountId} />
          )}

          {/* ── Resize Handle ── */}
          <div
            onMouseDown={handleResizeStart}
            onTouchStart={handleResizeStart}
            className="hidden md:flex h-1.5 cursor-row-resize items-center justify-center hover:bg-primary/20 active:bg-primary/30 transition-colors group border-t border-border bg-secondary/40 touch-none"
          >
            <div className="w-8 h-0.5 rounded-full bg-border group-hover:bg-primary/50 transition-colors" />
          </div>

          {/* Bottom Panel (Positions / Orders / Journal / Calendar / News) */}
          <BottomPanel
            tab={bottomTab}
            onTabChange={setBottomTab}
            positions={positions}
            orders={orders}
            accountId={activeAccountId}
            onModifyPosition={setModifyingPosition}
            onModifyOrder={setModifyingOrder}
            onSelectPositionSymbol={setSelectedSymbol}
            onSelectOrderSymbol={setSelectedSymbol}
            aiTraderEnabled={aiTraderEnabled?.enabled ?? false}
            height={bottomPanelHeight}
            collapsed={bottomPanelCollapsed}
            onToggleCollapse={toggleBottomPanelCollapsed}
            isFeedConnected={isFeedConnected}
            backtestResults={backtestResults}
            backtestStatus={backtestStatus}
            backtestProgress={backtestProgress}
            backtestError={backtestError}
            activeStrategyName={activeStrategyName}
            backtestSymbol={selectedSymbol}
            backtestTimeframe={timeframe}
            backtestTimerange={backtestTimerange}
            isDark={isDark}
            journalEntries={journalData?.entries || []}
            journalLoading={journalLoading}
            onCreateJournal={(data: CreateJournalEntryInput) =>
              createJournal.mutate(data, {
                onSuccess: () => toast.success("Journal", "Entry saved"),
                onError: (err: unknown) =>
                  toast.error("Journal", getErrorMessage(err) || "Failed to save"),
              })
            }
            onUpdateJournal={(id: string, data: UpdateJournalEntryInput) =>
              updateJournal.mutate(
                { id, accountId: activeAccountId!, ...data },
                {
                  onSuccess: () => toast.success("Journal", "Entry updated"),
                  onError: (err: unknown) =>
                    toast.error("Journal", getErrorMessage(err) || "Failed to update"),
                },
              )
            }
            onDeleteJournal={(id: string) =>
              deleteJournal.mutate(
                { id, accountId: activeAccountId! },
                {
                  onSuccess: () => toast.success("Journal", "Entry deleted"),
                  onError: (err: unknown) =>
                    toast.error("Journal", getErrorMessage(err) || "Failed to delete"),
                },
              )
            }
          />
        </div>

        {/* Right Panel — design region 5, fixed 296px */}
        {showRightPanel && (
          <div className="hidden md:flex w-full md:w-[296px] border-t md:border-t-0 md:border-l border-border flex-col bg-card overflow-hidden shrink-0 md:max-h-none">
            {rightPanel === "strategy" || rightPanel === "watchlist" || rightPanel === "order" ? (
              <RightPanel
                activeTab={rightPanel}
                onTabChange={setRightPanel}
                watchlist={{
                  symbols,
                  ticks,
                  selectedSymbol,
                  onSelect: setSelectedSymbol,
                  oneClick,
                  accountId: activeAccountId,
                  isFeedConnected,
                }}
                order={{
                  symbol: selectedSymbol,
                  symbolInfo,
                  tick,
                  accountId: activeAccountId,
                  oneClick,
                  onToggleOneClick: toggleOneClick,
                  onConfirmOrder: setConfirmOrder,
                  accountBalance: account?.balance,
                  isFeedConnected,
                  soundMuted,
                  onToggleMute: toggleSoundMute,
                  onOrderSuccess: () => {
                    playTradeSound();
                    handleFirstTrade();
                  },
                }}
                onEditStrategy={handleEditStrategy}
              />
            ) : (
              <>
                {rightPanel === "dom" && <DOMPanel symbol={selectedSymbol} tick={tick} />}
                {rightPanel === "news" && (
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    <MarketNewsFeed symbol={selectedSymbol} />
                  </div>
                )}
                {rightPanel === "ai-trader" && (
                  <div className="flex-1 overflow-hidden">
                    <AiTraderPanel accountId={activeAccountId} />
                  </div>
                )}
                {rightPanel === "tv-analysis" && (
                  <div className="flex-1 overflow-hidden">
                    <TradingViewTechnicalAnalysis
                      symbol={selectedSymbol}
                      theme={isDark ? "dark" : "light"}
                      interval={timeframe}
                      width="100%"
                      height="100%"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Mobile Trading Panel (small screens only) ──── */}
      <div className="md:hidden">
        {!mobilePanelOpen && (
          <button
            onClick={() => setMobilePanelOpen(true)}
            className="fixed bottom-20 right-4 z-40 bg-primary text-primary-foreground rounded-full w-14 h-14 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
          >
            <span className="text-2xl font-bold">$</span>
          </button>
        )}
        {mobilePanelOpen && (
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto bg-card border-t border-border rounded-t-2xl shadow-2xl safe-area-bottom">
            <div className="flex justify-center py-1">
              <button
                onClick={() => setMobilePanelOpen(false)}
                className="w-10 h-1.5 rounded-full bg-muted-foreground/30"
              />
            </div>
            <MobileTradingPanel
              symbol={selectedSymbol}
              bid={tick?.bid}
              ask={tick?.ask}
              positions={positions || []}
              onPlaceOrder={(order) => {
                if (oneClick) {
                  api
                    .placeOrder({ ...order, accountId: activeAccountId! } as PlaceOrderInput)
                    .catch(() => {});
                  setMobilePanelOpen(false);
                  return;
                }
                setConfirmOrder({
                  ...order,
                  _submit: () =>
                    api.placeOrder({ ...order, accountId: activeAccountId! } as PlaceOrderInput),
                });
                setMobilePanelOpen(false);
              }}
            />
          </div>
        )}
      </div>

      {/* Dialogs */}
      <AddIndicatorModal
        isOpen={showAddIndicatorModal}
        onClose={() => setShowAddIndicatorModal(false)}
      />
      <IndicatorSettingsDialog iid={settingsIid} onClose={() => setSettingsIid(null)} />
      <StrategySourceDialog
        open={showStrategySource}
        onClose={() => setShowStrategySource(false)}
        strategyName={activeStrategyName ?? "RSIVolume"}
      />
      <PositionModifyDialog
        position={modifyingPosition}
        onClose={() => setModifyingPosition(null)}
        onSaved={() => setModifyingPosition(null)}
        tick={tick}
        isFeedConnected={isFeedConnected}
      />
      <OrderModifyDialog
        order={modifyingOrder}
        onClose={() => setModifyingOrder(null)}
        onSaved={() => setModifyingOrder(null)}
        tick={tick}
      />
      <OrderConfirmDialog
        isOpen={!!confirmOrder}
        order={confirmOrder}
        onConfirm={() => {
          if (confirmOrder?._submit) {
            setConfirmLoading(true);
            confirmOrder
              ._submit()
              .then(() => {
                playTradeSound();
                handleFirstTrade();
              })
              .finally(() => {
                setConfirmLoading(false);
                setConfirmOrder(null);
              });
          }
        }}
        onCancel={() => setConfirmOrder(null)}
        tick={tick}
        symbolInfo={symbolInfo}
        loading={confirmLoading}
      />
    </div>
  );
}
