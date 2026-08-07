// lib/platform-api.ts
// Separate Platform realm API client (spec §4.3 / §7.13). Platform tokens use
// different storage keys, refresh path, auth callback, and never attach
// X-Facility-ID. Tenant code must keep using lib/api.ts.

import { ApiError } from "@/lib/api";
import { recordApiTelemetry } from "@/lib/telemetry";

const STORAGE_TOKEN = "hms.platform.access_token";
const STORAGE_REFRESH = "hms.platform.refresh_token";

let platformAuthToken: string | null = null;
let platformRefreshToken: string | null = null;

if (typeof window !== "undefined") {
  platformAuthToken = window.localStorage.getItem(STORAGE_TOKEN);
  platformRefreshToken = window.localStorage.getItem(STORAGE_REFRESH);
}

export function setPlatformAuthTokens(access: string, refresh: string | null): void {
  platformAuthToken = access;
  platformRefreshToken = refresh;
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_TOKEN, access);
  if (refresh) window.localStorage.setItem(STORAGE_REFRESH, refresh);
  else window.localStorage.removeItem(STORAGE_REFRESH);
}

export function clearPlatformAuthTokens(): void {
  platformAuthToken = null;
  platformRefreshToken = null;
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_TOKEN);
  window.localStorage.removeItem(STORAGE_REFRESH);
}

export function getPlatformAuthToken(): string | null {
  return platformAuthToken;
}

export function getPlatformRefreshToken(): string | null {
  return platformRefreshToken;
}

let onPlatformSessionExpired: (() => void) | null = null;
export function setOnPlatformSessionExpired(cb: (() => void) | null): void {
  onPlatformSessionExpired = cb;
}

// Stripped of any trailing slash so `${API_BASE_URL}${path}` (path always
// starts with "/") can never produce a double slash regardless of how the
// env var is set at build time — see src/lib/api.ts for the exact incident
// this guards against.
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");

interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
  meta?: Record<string, unknown>;
}

export interface PlatformRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
  skipAuth?: boolean;
  signal?: AbortSignal;
  __isRetry?: boolean;
}

function isRawRateLimitBody(payload: unknown): payload is { error: string } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as { error?: unknown }).error === "string"
  );
}

let refreshInFlight: Promise<boolean> | null = null;

async function performPlatformTokenRefresh(): Promise<boolean> {
  const currentRefresh = platformRefreshToken;
  if (!currentRefresh || !API_BASE_URL) return false;
  try {
    const response = await fetch(`${API_BASE_URL}/foundation/platform/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refresh_token: currentRefresh }),
    });
    const payload = (await response.json().catch(() => null)) as Envelope<{
      access_token?: string | null;
      refresh_token?: string | null;
    }> | null;
    if (!response.ok || !payload?.success || !payload.data?.access_token) {
      return false;
    }
    setPlatformAuthTokens(
      payload.data.access_token,
      payload.data.refresh_token ?? null,
    );
    return true;
  } catch {
    return false;
  }
}

async function platformFetchRaw<T>(
  path: string,
  options: PlatformRequestOptions = {},
): Promise<{ data: T; meta: Record<string, unknown> }> {
  if (!API_BASE_URL) {
    throw new ApiError(
      "CONFIG_MISSING",
      "NEXT_PUBLIC_API_BASE_URL is not set. Add it to .env.local.",
      0,
    );
  }

  let url = `${API_BASE_URL}${path}`;
  if (options.params) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params)) {
      if (value === undefined || value === null) continue;
      search.set(key, String(value));
    }
    const qs = search.toString();
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }

  const method = options.method ?? "GET";
  const startedAt = performance.now();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (!options.skipAuth && platformAuthToken) {
    headers.Authorization = `Bearer ${platformAuthToken}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    recordApiTelemetry({
      realm: "platform",
      method,
      path,
      outcome: aborted ? "aborted" : "network_error",
      durationMs: Math.round(performance.now() - startedAt),
    });
    if (aborted) throw new ApiError("REQUEST_ABORTED", "Request was cancelled.", 0);
    throw new ApiError(
      "NETWORK_ERROR",
      err instanceof Error ? err.message : "Network request failed",
      0,
    );
  }

  if (response.status === 204) {
    recordApiTelemetry({
      realm: "platform",
      method,
      path,
      outcome: "success",
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return { data: undefined as T, meta: {} };
  }

  let rawPayload: unknown;
  try {
    rawPayload = await response.json();
  } catch {
    recordApiTelemetry({
      realm: "platform",
      method,
      path,
      outcome: "error",
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      errorCode: "MALFORMED_RESPONSE",
    });
    throw new ApiError(
      "MALFORMED_RESPONSE",
      `Non-JSON response from ${path} (HTTP ${response.status})`,
      response.status,
    );
  }

  if (response.status === 429 && isRawRateLimitBody(rawPayload)) {
    recordApiTelemetry({
      realm: "platform",
      method,
      path,
      outcome: "error",
      status: 429,
      durationMs: Math.round(performance.now() - startedAt),
      errorCode: "RATE_LIMIT_EXCEEDED",
    });
    throw new ApiError("RATE_LIMIT_EXCEEDED", rawPayload.error, 429);
  }

  const payload = rawPayload as Envelope<T>;
  const requestId =
    typeof payload.meta?.request_id === "string" ? payload.meta.request_id : undefined;

  if (!payload.success || payload.error) {
    const e = payload.error ?? { code: "UNKNOWN_ERROR", message: "Unknown error" };
    if (
      response.status === 401 &&
      !options.skipAuth &&
      !options.__isRetry &&
      platformRefreshToken
    ) {
      refreshInFlight ??= performPlatformTokenRefresh().finally(() => {
        refreshInFlight = null;
      });
      const refreshed = await refreshInFlight;
      if (refreshed) {
        return platformFetchRaw<T>(path, { ...options, __isRetry: true });
      }
      clearPlatformAuthTokens();
      onPlatformSessionExpired?.();
    }

    recordApiTelemetry({
      realm: "platform",
      method,
      path,
      outcome: "error",
      status: response.status,
      requestId,
      durationMs: Math.round(performance.now() - startedAt),
      errorCode: e.code,
    });
    throw new ApiError(e.code, e.message, response.status, e.details, requestId);
  }

  recordApiTelemetry({
    realm: "platform",
    method,
    path,
    outcome: "success",
    status: response.status,
    requestId,
    durationMs: Math.round(performance.now() - startedAt),
  });
  return { data: payload.data as T, meta: payload.meta ?? {} };
}

export async function platformFetch<T>(
  path: string,
  options: PlatformRequestOptions = {},
): Promise<T> {
  const { data } = await platformFetchRaw<T>(path, options);
  return data;
}

export const platformGet = <T>(
  path: string,
  options?: Omit<PlatformRequestOptions, "method" | "body">,
) => platformFetch<T>(path, { ...options, method: "GET" });

export const platformPost = <T>(
  path: string,
  body?: unknown,
  options?: Omit<PlatformRequestOptions, "method" | "body">,
) => platformFetch<T>(path, { ...options, method: "POST", body });

export const platformPatch = <T>(
  path: string,
  body?: unknown,
  options?: Omit<PlatformRequestOptions, "method" | "body">,
) => platformFetch<T>(path, { ...options, method: "PATCH", body });

export const platformDelete = <T>(
  path: string,
  options?: Omit<PlatformRequestOptions, "method" | "body">,
) => platformFetch<T>(path, { ...options, method: "DELETE" });
