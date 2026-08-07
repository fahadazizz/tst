// lib/realtime.ts
// Real-time transport foundation (spec §7.16). Queue events are the first
// (and, so far, only) real-time resource in the API:
//   GET /operations/queue/{queue_id}/events/stream   — SSE
//   GET /operations/queue/{queue_id}/events           — polling fallback,
//                                                        cursor-paginated
//                                                        via since_event_id
// Both require bearer auth + X-Facility-ID, which native EventSource cannot
// send — spec explicitly calls this out, so this is a manual fetch-based SSE
// reader (parses `text/event-stream` frames by hand), not EventSource.
//
// This module is infra only: it isn't wired into the queue board UI yet
// (that's spec §10.10 / tracking task T2-5) — it's built now, with a real
// endpoint confirmed against the backend, so that screen has a tested
// foundation to consume instead of inventing its own ad hoc SSE handling.

import { apiGet, getAuthToken, getActiveFacilityId } from "@/lib/api";
import type { components } from "@/types/api";

export type QueueEvent = components["schemas"]["QueueEventResponse"];

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export interface QueueEventStreamHandlers {
  onEvent: (event: QueueEvent) => void;
  /** Called whenever the transport falls back from SSE to polling, or back —
   *  useful for a small "live"/"polling" indicator in the UI. */
  onTransportChange?: (transport: "sse" | "polling") => void;
  onError?: (err: unknown) => void;
}

/** Parses one `text/event-stream` frame's raw lines into {id, event, data}. */
function parseSseFrame(raw: string): { id?: string; event?: string; data: string } {
  let id: string | undefined;
  let event: string | undefined;
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("id:")) id = line.slice(3).trim();
    else if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  return { id, event, data: dataLines.join("\n") };
}

/** Reads one SSE connection to completion (server closes, network drop, or
 *  `signal` aborts) — reconnection/backoff is the caller's job (see
 *  `subscribeToQueueEvents` below), this just reads one attempt. */
async function readSseStream(
  queueId: string,
  lastEventId: string | undefined,
  handlers: QueueEventStreamHandlers,
  signal: AbortSignal,
): Promise<void> {
  const token = getAuthToken();
  const facilityId = getActiveFacilityId();
  const res = await fetch(`${API_BASE}/operations/queue/${queueId}/events/stream`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(facilityId ? { "X-Facility-ID": facilityId } : {}),
      ...(lastEventId ? { "Last-Event-ID": lastEventId } : {}),
      Accept: "text/event-stream",
    },
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Queue event stream failed (HTTP ${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let sepIndex: number;
      while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);
        if (!frame.trim()) continue;
        const { id, data } = parseSseFrame(frame);
        if (!data) continue;
        try {
          const event = JSON.parse(data) as QueueEvent;
          if (id) lastEventId = id;
          handlers.onEvent(event);
        } catch {
          // Malformed frame — skip it rather than killing the connection.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Polling fallback (spec: required, not optional) — used both when SSE
 *  isn't available at all and as the retry path between failed SSE
 *  reconnect attempts, so the queue board always keeps updating one way or
 *  another. */
export async function pollQueueEvents(
  queueId: string,
  sinceEventId?: string,
): Promise<QueueEvent[]> {
  return apiGet<QueueEvent[]>(`/operations/queue/${queueId}/events`, {
    params: sinceEventId ? { since_event_id: sinceEventId } : undefined,
  });
}

export interface QueueEventSubscription {
  /** Tears down the connection (SSE abort or polling interval) immediately —
   *  call on unmount, Facility change, or logout (spec §7.16). Safe to call
   *  more than once. */
  close: () => void;
}

const POLL_INTERVAL_MS = 3000;
const SSE_RETRY_BACKOFF_MS = [1000, 3000, 8000, 15000];

/** Subscribes to one queue's live events: SSE first, with the event cursor
 *  (last_event_id) tracked across reconnects so a dropped connection resumes
 *  instead of replaying or missing events (spec's explicit requirement — "no
 *  duplicate rendering"). After repeated SSE failures, falls back to
 *  polling on the same cursor so the board keeps updating either way; a
 *  polling cycle that succeeds does not automatically retry SSE — the
 *  caller can call `subscribeToQueueEvents` again (e.g. on next screen
 *  mount) to give SSE another chance. */
export function subscribeToQueueEvents(
  queueId: string,
  handlers: QueueEventStreamHandlers,
): QueueEventSubscription {
  const controller = new AbortController();
  let closed = false;
  let lastEventId: string | undefined;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let retryAttempt = 0;

  function stopPolling() {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPolling() {
    if (pollTimer !== null || closed) return;
    handlers.onTransportChange?.("polling");
    pollTimer = setInterval(async () => {
      try {
        const events = await pollQueueEvents(queueId, lastEventId);
        for (const event of events) {
          lastEventId = event.event_id;
          handlers.onEvent(event);
        }
      } catch (err) {
        handlers.onError?.(err);
      }
    }, POLL_INTERVAL_MS);
  }

  async function runSse(): Promise<void> {
    while (!closed) {
      try {
        handlers.onTransportChange?.("sse");
        stopPolling();
        await readSseStream(
          queueId,
          lastEventId,
          {
            ...handlers,
            onEvent: (event) => {
              lastEventId = event.event_id;
              handlers.onEvent(event);
            },
          },
          controller.signal,
        );
        if (closed) return;
        // Server closed the stream cleanly — reconnect immediately from
        // the last cursor rather than treating it as a failure.
        retryAttempt = 0;
      } catch (err) {
        if (closed || controller.signal.aborted) return;
        handlers.onError?.(err);
        const backoff =
          SSE_RETRY_BACKOFF_MS[Math.min(retryAttempt, SSE_RETRY_BACKOFF_MS.length - 1)];
        retryAttempt += 1;
        // Keep the board updating via polling while SSE is down/retrying.
        startPolling();
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }

  void runSse();

  return {
    close: () => {
      if (closed) return;
      closed = true;
      stopPolling();
      controller.abort();
    },
  };
}

// ─── Global teardown registry ──────────────────────────────────────────
// Spec §7.10/§7.16: close real-time connections on logout/session
// revocation/Facility change. Screens register their live subscription's
// `close` here; auth.tsx/session.tsx call `teardownAllRealtime()` at those
// exact trigger points (same pattern as lib/queryCache.ts's cache clearing)
// without needing to know which screen, if any, currently has one open.

const activeSubscriptions = new Set<() => void>();

export function registerRealtimeTeardown(close: () => void): () => void {
  activeSubscriptions.add(close);
  return () => activeSubscriptions.delete(close);
}

export function teardownAllRealtime(): void {
  for (const close of activeSubscriptions) close();
  activeSubscriptions.clear();
}
