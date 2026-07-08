/**
 * Thin HTTP client — timeout, Bearer attach, single-flight 401→refresh retry.
 *
 * Originally built for a PropSim-style `/api` backend (see the still-present
 * but currently-unused `accountsApi`/`marketdataApi`/`journalApi`/`authApi`
 * modules in this directory, called only by the dormant PropSim query hooks
 * in `services/queries.ts` — see the Trading Lab plan's "PropSim residue"
 * note, deferred/ignored). Trading Lab (U8) repoints this plumbing at the
 * verified Freqtrade webserver contract instead: base `/api/v1`, and the
 * 401→refresh interceptor now speaks Freqtrade's `POST /token/refresh`
 * (`Authorization: Bearer <refresh_token>`, no body) rather than the old
 * PropSim `/auth/refresh` JSON-body shape. Those PropSim modules already had
 * no live backend to talk to (nothing here regresses them further — see
 * `docs/plans/2026-07-08-001-feat-trading-lab-terminal-plan.md` U8).
 */
import { toast as globalToast } from "../toast.ts";

/** API base URL — uses VITE_API_URL env var (Freqtrade webserver origin) or
 *  falls back to a relative `/api/v1` (harmless 404s when unset, e.g. local
 *  dev without a `.env`). See `docs/plans/VERIFIED-API-CONTRACT.md`. */
export const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, "")}/api/v1`
  : "/api/v1";

const BASE = API_BASE;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Singleton promise prevents concurrent token refresh calls (e.g. multiple
// simultaneous 401s triggering parallel /auth/refresh requests).
let _refreshPromise: Promise<string | null> | null = null;

async function tryTokenRefresh(): Promise<string | null> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    const rt = localStorage.getItem("refresh_token");
    if (!rt) return null;
    // Give the refresh its own 10 s deadline so a slow /token/refresh
    // can't hold any caller past its own timeoutMs.
    const refreshController = new AbortController();
    const refreshTid = setTimeout(() => refreshController.abort(), 10_000);
    try {
      // Freqtrade contract (verified): POST /token/refresh with the refresh
      // token as a Bearer header — no JSON body, no refresh-token rotation.
      const res = await fetch(`${BASE}/token/refresh`, {
        method: "POST",
        headers: { Authorization: `Bearer ${rt}` },
        signal: refreshController.signal,
      });
      clearTimeout(refreshTid);
      if (!res.ok) return null;
      const json = await res.json().catch(() => null);
      // Freqtrade returns the token envelope directly (no `.data` wrapper).
      const accessToken = json?.access_token as string | undefined;
      if (!accessToken) return null;
      localStorage.setItem("access_token", accessToken);
      return accessToken;
    } catch {
      return null;
    } finally {
      clearTimeout(refreshTid);
      _refreshPromise = null;
    }
  })();
  return _refreshPromise;
}

async function resolveResponse<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = json?.error || {};
    const code = err.code || "UNKNOWN";
    if (code === "DEMO_READ_ONLY") {
      globalToast.warning("Demo Mode", "This action is disabled in the read-only demo");
    }
    // Zod validation errors bury field-level messages in details.validation.fieldErrors.
    // Surface the first field message so the user sees something actionable
    // (e.g. "Invalid email address") instead of the generic "Request validation failed."
    const fieldErrors = (err.details?.validation?.fieldErrors ?? {}) as Record<string, string[]>;
    const firstFieldMessage = Object.values(fieldErrors).flat()[0];
    // FastAPI (Freqtrade) error shape is `{detail: string | Array<{msg,...}>}`,
    // not this client's original `{error:{code,message}}` shape — fall back
    // to it so 401/422 responses surface something readable.
    const detail = json?.detail;
    const detailMessage = Array.isArray(detail)
      ? detail.map((d) => (typeof d?.msg === "string" ? d.msg : JSON.stringify(d))).join("; ")
      : typeof detail === "string"
        ? detail
        : undefined;
    const message = firstFieldMessage || err.message || detailMessage || res.statusText;
    throw new ApiError(res.status, code, message, err.details);
  }
  return json?.data ?? json;
}

export interface RequestOptions extends RequestInit {
  /** Request timeout in milliseconds. Defaults to 20 000 ms. Pass 0 to disable. */
  timeoutMs?: number;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { timeoutMs = 20_000, ...fetchOpts } = opts;

  const token = localStorage.getItem("access_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((fetchOpts.headers as Record<string, string>) || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  // Abort controller for timeout — ensures the button never hangs forever
  // when the server is slow or the connection drops mid-request.
  const controller = new AbortController();
  let tid: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs > 0) {
    tid = setTimeout(() => controller.abort(), timeoutMs);
  }

  const doFetch = (hdrs: Record<string, string>) =>
    fetch(`${BASE}${path}`, { ...fetchOpts, headers: hdrs, signal: controller.signal });

  try {
    const res = await doFetch(headers);

    if (res.status === 401) {
      // Only attempt a token refresh when we actually sent an Authorization header.
      // Without one (e.g. POST /auth/login with wrong credentials) a 401 simply
      // means "bad credentials" — we must NOT dispatch session:expired or show
      // "Session expired" to the user; the server error message should surface instead.
      if (token) {
        const newToken = await tryTokenRefresh();
        if (newToken) {
          const retryRes = await doFetch({ ...headers, Authorization: `Bearer ${newToken}` });
          return resolveResponse<T>(retryRes);
        }
        window.dispatchEvent(new CustomEvent("session:expired"));
        throw new ApiError(401, "UNAUTHORIZED", "Session expired");
      }
      // No auth token → fall through; resolveResponse will surface the server error message
    }

    return resolveResponse<T>(res);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(408, "REQUEST_TIMEOUT", "Request timed out — please try again");
    }
    throw err;
  } finally {
    clearTimeout(tid);
  }
}
