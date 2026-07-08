/**
 * Freqtrade-backed API facade (plan U8 / KTD1 / R6 / R10).
 *
 * `api` is `freqtradeApi` wrapped in the same Proxy the demo layer used —
 * any method not implemented here still resolves to a benign async no-op
 * (react-query rejects `undefined`, so `null`), so leftover PropSim query
 * hooks in `services/queries.ts` keep failing harmlessly instead of
 * throwing. `freqtradeApi` itself is `{...demoApi, <overrides>}`: market
 * data (getSymbols/getCandles/getCandlesWithMeta/getTick), auth
 * (login/demoLogin/refreshToken/logout/getMe/getMyProfile), and the new
 * strategy/backtest transport now hit the real Freqtrade webserver via
 * `./freqtrade/client.ts` + `./freqtrade/mappers.ts`. Everything else —
 * paper orders/positions/account, journal, chart drawings, feature flags —
 * stays on the in-browser demo engine unchanged (the Order panel is not this
 * unit's concern; see U8 in the Trading Lab plan).
 */
import { demoApi } from "./demo/api.ts";
import * as ft from "./freqtrade/client.ts";
import {
  mapPairCandles,
  mapBacktestResult,
  startBacktest,
  pollBacktest,
  abortBacktest,
} from "./freqtrade/mappers.ts";
import type { AuthResponse, Symbol, User } from "./schemas.ts";

export const API_BASE = "";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// react-query rejects `undefined` query results, so resolve to null instead.
const benign = () => Promise.resolve(null);

function pairToSymbol(pair: string): Symbol {
  return {
    id: pair,
    name: pair,
    displayName: pair,
    category: "CRYPTO",
    contractSize: 1,
    tickSize: 0.01,
    tickValue: 0.01,
    marginPercent: 1,
    maxLeverage: 1,
    commission: 0,
    swapLong: 0,
    swapShort: 0,
    tradingHoursStart: null,
    tradingHoursEnd: null,
    isActive: true,
  };
}

function authResponse(tokens: ft.FreqtradeTokens, username: string): AuthResponse {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: ft.getCachedUser(username),
  };
}

let offlineSeq = 0;
/** Boots the terminal in an unauthenticated/offline session — used when
 *  Freqtrade credentials aren't configured or the login call fails, so
 *  `App.tsx`'s `await demoLogin()` always resolves and the UI never crashes
 *  on boot (hard constraint: keep booting even if the backend is unreachable). */
function offlineAuthResponse(): AuthResponse {
  offlineSeq += 1;
  return {
    accessToken: "",
    refreshToken: "",
    user: ft.getCachedUser(`offline-${offlineSeq}`),
  };
}

/** MVP-only, client-bundled credentials for the public read/backtest-only
 *  Trading Lab terminal — see `.env.example` and the U8 report's uncertainty
 *  list. Unset → boots offline (chart shows no candles; paper trading still
 *  works, it's demo-engine-backed regardless — see below). */
function guestCredentials(): { username: string; password: string } | null {
  const u = import.meta.env.VITE_FT_USERNAME as string | undefined;
  const p = import.meta.env.VITE_FT_PASSWORD as string | undefined;
  return u && p ? { username: u, password: p } : null;
}

export const freqtradeApi = {
  ...demoApi,

  // ── Auth — real Freqtrade JWT, with an offline fallback so boot never
  // throws (App.tsx calls demoLogin() unconditionally on mount). ──
  login: async (usernameOrEmail: string, password: string): Promise<AuthResponse> => {
    const tokens = await ft.login(usernameOrEmail, password);
    return authResponse(tokens, usernameOrEmail);
  },
  demoLogin: async (): Promise<AuthResponse> => {
    const creds = guestCredentials();
    if (!creds) {
      console.warn(
        "[freqtradeApi] VITE_FT_USERNAME/VITE_FT_PASSWORD not set — booting offline (no live market data).",
      );
      return offlineAuthResponse();
    }
    try {
      const tokens = await ft.login(creds.username, creds.password);
      return authResponse(tokens, creds.username);
    } catch (err) {
      console.warn("[freqtradeApi] Freqtrade login failed — booting offline.", err);
      return offlineAuthResponse();
    }
  },
  refreshToken: async (refreshToken: string) => {
    const tokens = await ft.refresh(refreshToken);
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  },
  logout: async () => {
    // Freqtrade's webserver has no documented logout/revoke endpoint
    // (VERIFIED-API-CONTRACT.md doesn't list one) — clear local state only.
    ft.clearCachedUser();
    return { success: true };
  },
  getMe: async (): Promise<User> => ft.getCachedUser(),
  getMyProfile: async (): Promise<User> => ft.getCachedUser(),

  // ── Market data — real Freqtrade endpoints (R6, R10) ──
  getSymbols: async (): Promise<Symbol[]> => {
    try {
      const res = await ft.getAvailablePairs();
      return res.pairs.map(pairToSymbol);
    } catch (err) {
      console.warn("[freqtradeApi] getSymbols failed — offline.", err);
      return [];
    }
  },
  getCandles: async (symbol: string, timeframe: string, limit?: number) => {
    try {
      const raw = await ft.getPairCandles(symbol, timeframe, limit);
      return mapPairCandles(raw).candles;
    } catch (err) {
      console.warn("[freqtradeApi] getCandles failed — offline.", err);
      return [];
    }
  },
  getCandlesWithMeta: async (symbol: string, timeframe: string, limit?: number) => {
    try {
      const raw = await ft.getPairCandles(symbol, timeframe, limit);
      // `indicators` (plan U10 / R5) carries the authoritative
      // `populate_indicators` columns (rsi, bb_lower/mid/upper, ...) so
      // callers can reconcile them against the client-side preview after a
      // backtest — see `pickAuthoritativeBollinger` in ./freqtrade/mappers.ts.
      const { candles, indicators } = mapPairCandles(raw);
      return {
        candles,
        indicators,
        metadata: { isPartial: false, backfillQueued: false, historicalCoverageStart: null },
      };
    } catch (err) {
      console.warn("[freqtradeApi] getCandlesWithMeta failed — offline.", err);
      return {
        candles: [],
        indicators: {},
        metadata: { isPartial: false, backfillQueued: false, historicalCoverageStart: null },
      };
    }
  },
  getTick: async (symbol: string) => {
    try {
      const raw = await ft.getPairCandles(symbol, "1m", 1);
      const { candles } = mapPairCandles(raw);
      const last = candles[candles.length - 1];
      const price = last?.close ?? 0;
      return { symbol, bid: price, ask: price, timestamp: Date.now() };
    } catch (err) {
      console.warn("[freqtradeApi] getTick failed — offline.", err);
      return { symbol, bid: 0, ask: 0, timestamp: Date.now() };
    }
  },

  // ── Strategy + backtest transport — wired for U7/U9 to consume; nothing
  // in the terminal calls these yet. ──
  getStrategies: async (): Promise<string[]> => {
    try {
      const res = await ft.getStrategies();
      return res.strategies;
    } catch (err) {
      console.warn("[freqtradeApi] getStrategies failed — offline.", err);
      return [];
    }
  },
  getStrategySource: (name: string) => ft.getStrategySource(name),
  startBacktest,
  pollBacktest,
  abortBacktest,
  mapBacktestResult,
};

export const api = new Proxy(freqtradeApi as Record<string, unknown>, {
  get(target, prop: string) {
    if (prop in target) return target[prop];
    return benign;
  },
}) as typeof freqtradeApi & Record<string, (...args: never[]) => Promise<unknown>>;
