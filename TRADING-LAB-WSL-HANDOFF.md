# Trading Lab — WSL build & deploy handoff

Branch `feat/trading-lab-terminal` carries the full Trading Lab skin (plan units U1–U10),
written on the RAM-constrained VPS where **nothing could be `npm install`/`build`/`tsc`'d**.
Everything below is code-complete + read-reviewed + brace-balanced, **not compiled**. This is
the build-verify-and-fix pass.

Backend is already live: **https://trading.sphinx.codes** (Freqtrade 2026.6, verified — see
`../trading/docs/plans/VERIFIED-API-CONTRACT.md`). Creds in `../trading` deploy env / the VPS
scratchpad.

## 1. Install + typecheck
```
npm install            # pulls the new CodeMirror deps (U7)
npm run typecheck      # fix the type nits the VPS couldn't catch
npm run build          # vite build (skips tsc — should succeed even with minor type issues)
npm run dev            # eyeball parity vs design/Trading Lab.dc.html
```
New deps to confirm/bump (U7, best-effort pins): `@uiw/react-codemirror@^4.23.10`,
`@codemirror/lang-python@^6.2.1`, `@codemirror/theme-one-dark@^6.1.2`, `@codemirror/view@^6.36.1`.

## 2. Known fix-ups flagged during the blind build (by unit)
- **Auth model (U8) — DECISION NEEDED before public FE.** How does a public browser terminal
  authenticate to Freqtrade? Current default: `VITE_FT_USERNAME`/`VITE_FT_PASSWORD` bundled into
  the FE (exposes the credential). Options: a thin server-side auth proxy, or a terminal login
  screen. Pick one before exposing the FE.
- **Default symbol (U8):** `useTradingStore` defaults `selectedSymbol` to `"BTCUSD"` (demo); the
  backend pair is `"BTC/USDT"`. One-line fix in `src/services/store.tsx` or symbol-mapping.
- **lightweight-charts API (U9/U10):** confirm `addAreaSeries`, `setMarkers(SeriesMarker<Time>[])`,
  `addLineSeries({title, lastValueVisible})` against the installed version (mirrored existing usage).
- **CodeMirror props (U7):** `@uiw/react-codemirror` `basicSetup`/`theme`/`extensions`/`height`
  prop shapes vs the resolved version; the `CodeMirrorBoundary` catches runtime throws but a
  prop-type mismatch surfaces at `tsc`.
- **Backtest field units (U9):** `trade_duration` assumed minutes; `max_drawdown_account` assumed
  a fraction (`*100`). Confirm against a live `/backtest` run (they degrade gracefully if wrong).
- **Marker timeframe (U10):** markers bucket to the *displayed* timeframe, not the backtest's — can
  misplace if you view a different TF than the run used.
- **`getCandlesWithMeta` `Candle` may lack `timestamp`** required by `MarketDataCandlesPayload`
  (pre-existing demo shape; U8/U10 touched it). Verify at `tsc`.
- **Tests deferred:** U9 `mappers.test.ts` and U7 dialog test were not written (can't run here). Add
  them where they execute.

## 3. Point the FE at the backend
`.env` (see `.env.example`): `VITE_API_URL=https://trading.sphinx.codes` (+ the auth vars per the
decision above). The Vite dev proxy already forwards `/api`+`/ws` for local dev.

## 4. Deploy the FE (U13b)
- New Railway service in the `trading-lab` project, connected to `sphinxcode/OpenCharts`,
  branch `feat/trading-lab-terminal` (or `main` after merge). Build `npm run build`, serve `dist/`
  (add a static Dockerfile or a Nixpacks `serve dist` start command — OpenCharts has neither yet).
- After it has a URL, add that exact origin to the backend's
  `FREQTRADE__API_SERVER__CORS_ORIGINS` (via the Railway gateway MCP or dashboard) or the browser
  blocks cross-origin REST.

## Commit map (branch `feat/trading-lab-terminal`)
U1 reskin · U2/U3 shell · U4/U5/U6 indicators · U8 adapter · U9 tester · U7 settings+editor · U10 markers.
