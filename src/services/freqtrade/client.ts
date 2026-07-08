/**
 * Freqtrade REST client — auth + market-data/strategy transport (plan U8 / KTD1).
 *
 * Verified against `docs/plans/VERIFIED-API-CONTRACT.md` (trading.sphinx.codes,
 * live, 2026-07-08) — NOT the FreqUI reference, which differs on
 * `enable_protections` (required here) and some field names.
 *
 * Auth: `POST /token/login` with HTTP **Basic** auth → `{access_token,
 * refresh_token}`; every other call attaches `Authorization: Bearer
 * <access_token>` and auto-refreshes once on 401 — both handled by
 * `services/api/request.ts`'s existing plumbing (now pointed at
 * `${VITE_API_URL}/api/v1` and reworked to speak this Bearer-refresh
 * contract; see that file's header comment). Login and refresh themselves
 * are hand-rolled `fetch` calls here because `request()`'s automatic
 * Bearer-attach (from whatever access token is already in localStorage)
 * would clobber the Basic/refresh-token header they need to send instead.
 */
import { request, ApiError, API_BASE } from "../api/request.ts";
import type { User } from "../schemas.ts";

export interface FreqtradeTokens {
  accessToken: string;
  refreshToken: string;
}

/** Freqtrade's webserver has no "current user" endpoint — synthesize a
 *  `User` shape locally from the login username so the rest of the app
 *  (which expects `AuthResponse.user`) keeps working unchanged. */
let cachedUser: User | null = null;
let backendOnline = true;

function makeUser(username: string): User {
  return {
    id: username,
    email: `${username}@freqtrade.local`,
    firstName: username,
    lastName: null,
    roles: ["trader"],
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
  };
}

export function getCachedUser(username = "trader"): User {
  if (!cachedUser) cachedUser = makeUser(username);
  return cachedUser;
}

export function clearCachedUser(): void {
  cachedUser = null;
}

export function isBackendOnline(): boolean {
  return backendOnline;
}

/** `GET /ping` — no auth. Feature-detect for graceful offline degradation
 *  (hard constraint: the terminal must keep booting when the backend is
 *  unreachable). Never throws. */
export async function ping(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/ping`);
    backendOnline = res.ok;
    return res.ok;
  } catch {
    backendOnline = false;
    return false;
  }
}

/**
 * `POST /token/login` with HTTP Basic auth. Bypasses `request()` on purpose
 * (see file header) — this is the one hand-rolled fetch in the adapter.
 */
export async function login(username: string, password: string): Promise<FreqtradeTokens> {
  const basic = typeof btoa === "function" ? btoa(`${username}:${password}`) : "";
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/token/login`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}` },
    });
  } catch (err) {
    backendOnline = false;
    throw new ApiError(0, "NETWORK_ERROR", err instanceof Error ? err.message : "Network error");
  }
  // Reachable either way (even a 401 means we got a response from the server).
  backendOnline = true;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = typeof json?.detail === "string" ? json.detail : res.statusText;
    throw new ApiError(res.status, "AUTH_FAILED", detail, json ?? undefined);
  }
  if (!json?.access_token || !json?.refresh_token) {
    throw new ApiError(res.status, "AUTH_MALFORMED", "Login response missing tokens", json ?? undefined);
  }
  cachedUser = makeUser(username);
  return { accessToken: json.access_token, refreshToken: json.refresh_token };
}

/**
 * `POST /token/refresh` with `Authorization: Bearer <refreshToken>` — no
 * body, and Freqtrade does not rotate the refresh token, so we echo the one
 * passed in for callers that store both halves uniformly (`useAuthStore`).
 * (Also hand-rolled for the same header-clobber reason as `login`; the
 * *automatic* 401→refresh retry inside `request()` has its own copy of this
 * logic in `request.ts` since it can't call back out to this module without
 * a cycle — kept in sync deliberately, see that file.)
 */
export async function refresh(refreshToken: string): Promise<FreqtradeTokens> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/token/refresh`, {
      method: "POST",
      headers: { Authorization: `Bearer ${refreshToken}` },
    });
  } catch (err) {
    throw new ApiError(0, "NETWORK_ERROR", err instanceof Error ? err.message : "Network error");
  }
  const json = await res.json().catch(() => null);
  const accessToken = json?.access_token as string | undefined;
  if (!res.ok || !accessToken) {
    const detail = typeof json?.detail === "string" ? json.detail : res.statusText;
    throw new ApiError(res.status, "REFRESH_FAILED", detail);
  }
  return { accessToken, refreshToken };
}

// ── Authenticated REST (Bearer-attach + 401→refresh via request.ts) ────────

export interface AvailablePairsResponse {
  length: number;
  pairs: string[];
  pair_interval: [string, string, string][];
}
export const getAvailablePairs = () => request<AvailablePairsResponse>("/available_pairs");

export interface PairHistoryResponse {
  strategy?: string;
  pair: string;
  timeframe: string;
  /** Column names, in the same order as each `data` row — OHLCV plus
   *  whatever `populate_indicators` added (verified: rsi, vol_avg, bb_lower,
   *  bb_mid, bb_upper for RSIVolume). */
  columns: string[];
  /** Positional rows — MUST be zipped against `columns` (see mappers.ts). */
  data: (number | string | null)[][];
  length?: number;
}
export const getPairCandles = (pair: string, timeframe: string, limit?: number) => {
  const params = new URLSearchParams({ pair, timeframe });
  if (limit != null) params.set("limit", String(limit));
  return request<PairHistoryResponse>(`/pair_candles?${params.toString()}`);
};

/**
 * Chart data in **webserver mode**. `/pair_candles` only works with a running
 * bot ("Bot is not in the correct state" otherwise) — verified against the live
 * backend — so the terminal fetches history via `/pair_history`, which runs the
 * strategy's populate_indicators on demand and returns OHLCV **plus** the
 * authoritative indicator columns (rsi, vol_avg, bb_lower/mid/upper).
 * `timerange` is Freqtrade format: `YYYYMMDD-YYYYMMDD` (either bound optional).
 */
export const getPairHistory = (
  pair: string,
  timeframe: string,
  strategy: string,
  timerange: string,
) => {
  const params = new URLSearchParams({ pair, timeframe, strategy, timerange });
  return request<PairHistoryResponse>(`/pair_history?${params.toString()}`);
};

export interface StrategiesResponse {
  strategies: string[];
}
export const getStrategies = () => request<StrategiesResponse>("/strategies");

export interface StrategySourceResponse {
  strategy: string;
  /** Full `.py` source — seeds the U7 Python editor. */
  code: string;
  timeframe?: string;
}
export const getStrategySource = (name: string) =>
  request<StrategySourceResponse>(`/strategy/${encodeURIComponent(name)}`);
