import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { TradingPage } from "./pages/TradingPage.tsx";
import { WavesPage } from "./pages/waves/WavesPage.tsx";
import { useAuthStore, useTradingStore } from "./services/store.tsx";

/**
 * OpenCharts entry point.
 *
 * No auth / routing: the app boots straight into the trading terminal backed by
 * the in-browser demo session (real bundled OHLC + paper-trading engine). A
 * demo "login" seeds the local user/account and starts the market-data feed.
 */
export function App() {
  const [ready, setReady] = useState(false);
  const demoLogin = useAuthStore((s) => s.demoLogin);
  const loadSymbols = useTradingStore((s) => s.loadSymbols);
  const loadAccounts = useTradingStore((s) => s.loadAccounts);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      await demoLogin();
      // OpenCharts paper trades genuinely execute against the in-browser engine,
      // so this is a real (non-demo) session — clears the "trading disabled" gate.
      localStorage.setItem("is_demo", "false");
      useAuthStore.setState({ isDemo: false });
      await Promise.all([loadSymbols(), loadAccounts()]);
      if (!cancelled) setReady(true);
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, [demoLogin, loadSymbols, loadAccounts]);

  // /waves is a static-feed dashboard — it renders without the trading boot.
  const terminal = ready ? (
    <TradingPage />
  ) : (
    <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a0a] text-neutral-400">
      Loading OpenCharts…
    </div>
  );

  return (
    <Routes>
      <Route path="/waves" element={<WavesPage />} />
      <Route path="*" element={terminal} />
    </Routes>
  );
}
