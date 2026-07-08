/**
 * Freqtrade-era WS shim (plan U8 / KTD1).
 *
 * Freqtrade's webserver mode has no live trade/candle push stream (verified
 * contract: REST only — `/ping`, `/pair_candles`, `/backtest` poll; see
 * `docs/plans/VERIFIED-API-CONTRACT.md`). Meanwhile the paper Order panel is
 * explicitly staying on the in-browser demo engine for this unit (see
 * `api.ts`) — and that engine's mark-to-market plus its
 * `positions`/`orders`/`account` events are entirely driven by the existing
 * demo feed (`services/demo/feed.ts` → `services/demo/bus.ts`). So this
 * client keeps delegating those channels — and the feed that drives them —
 * to the demo bus unchanged ("paper trading still streams" per the plan),
 * while adding a one-shot `GET /ping` feature-detect on `connect()` so
 * callers can read `wsClient.backendOnline` to know whether the real
 * market-data REST layer (`api.ts`) is reachable.
 *
 * There is no Freqtrade-sourced live "market-data" push to relay: candle
 * freshness comes from TanStack Query's own poll (`services/queries.ts`
 * `useCandles` — 30s stale, 5min safety net, 3s while a response is flagged
 * partial). Per the plan ("for market-data either no-op or poll"), this is
 * the no-op choice — duplicating that cadence inside the WS layer would just
 * be two clocks driving the same fetch.
 */
import { publish, subscribeChannel, type ChannelHandler } from "./demo/bus.ts";
import { startDemoFeed } from "./demo/feed.ts";
import { ping } from "./freqtrade/client.ts";

export type ConnectionState = "connected" | "connecting" | "reconnecting" | "disconnected";
export type WsHandler = ChannelHandler;

class FreqtradeWsShim {
  private _state: ConnectionState = "disconnected";
  private stateListeners = new Set<(s: ConnectionState) => void>();
  private _backendOnline = true;

  get state(): ConnectionState {
    return this._state;
  }

  /** Whether the last `GET /ping` (fired on `connect()`) succeeded. Best
   *  used as a hint for degraded-state UI, not a hard gate — REST calls in
   *  `api.ts` already fail soft (empty results) on their own. */
  get backendOnline(): boolean {
    return this._backendOnline;
  }

  private setState(next: ConnectionState): void {
    this._state = next;
    for (const cb of this.stateListeners) cb(next);
  }

  connect(_token?: string): void {
    this.setState("connecting");
    // Paper-engine mark-to-market + positions/orders/account streaming (demo
    // bus) — unrelated to Freqtrade reachability, always starts.
    startDemoFeed();
    // Feature-detect the real backend so market-data callers can degrade
    // gracefully; fire-and-forget, never blocks or throws past boot.
    ping()
      .then((ok) => {
        this._backendOnline = ok;
        if (!ok) {
          console.warn("[freqtrade ws] backend unreachable at connect — degraded/offline market data.");
        }
      })
      .catch(() => {
        this._backendOnline = false;
      });
    // Resolve to connected on the next tick so onStateChange subscribers
    // registered synchronously after connect() still receive the transition.
    setTimeout(() => this.setState("connected"), 0);
  }

  disconnect(): void {
    this.setState("disconnected");
  }

  reauthenticate(_token: string): void {
    // Freqtrade's Bearer refresh happens inline on the next REST call's 401
    // (request.ts's interceptor) — nothing to push over a socket here.
  }

  subscribe(channel: string, handler: WsHandler): () => void {
    return subscribeChannel(channel, handler);
  }

  subscribeAccounts(_accountIds: string[]): void {
    // All account events already flow through the "account" channel (demo bus).
  }

  setSymbolInterest(_symbols: string[]): void {
    // No Freqtrade live push to gate; the demo feed streams every demo symbol.
  }

  onStateChange(cb: (s: ConnectionState) => void): () => void {
    this.stateListeners.add(cb);
    cb(this._state);
    return () => {
      this.stateListeners.delete(cb);
    };
  }

  /** Allow the engine/feed to push events through the same client (parity helper). */
  emit(channel: string, event: unknown): void {
    publish(channel, event);
  }
}

export const wsClient = new FreqtradeWsShim();
