// api.ts
// The single API client every module uses to talk to the deployed backend.
// Owns: the fetch call, the {success,data,error,meta} envelope unwrap, and
// auth/facility header injection from a module-level cache the AuthContext writes.
// Not a React hook — callable from anywhere.

import { recordApiTelemetry } from "@/lib/telemetry";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

// Token storage strategy (approved, documented — spec §7.5): localStorage.
//
// Why: this backend issues tenant tokens as plain JSON body fields
// (TokenResponse.access_token/refresh_token), authenticated via a bearer
// Authorization header — it never sets an httpOnly Set-Cookie for auth.
// A cookie-based strategy is therefore not available without a backend
// change; localStorage (or an equivalent JS-readable store) is the only
// option that lets this client attach the bearer header itself.
//
// Accepted risk: a successful XSS on this origin could read these tokens.
// Mitigations actually in place: React's default output escaping is used
// everywhere (no dangerouslySetInnerHTML anywhere in the codebase, verified),
// and clinical form content is never persisted to localStorage/sessionStorage
// (also verified) — only these three auth/facility keys are ever stored here.
// If a stricter posture is required later (e.g. in-memory-only access token,
// refreshed via a silent iframe/cookie-based refresh endpoint), that needs a
// corresponding backend change first, since the backend would have to start
// issuing the refresh token as an httpOnly cookie instead of a body field.
const STORAGE_TOKEN = "hms.auth.access_token";
const STORAGE_REFRESH = "hms.auth.refresh_token";
const STORAGE_FACILITY = "hms.auth.active_facility_id";

let authToken: string | null = null;
let refreshToken: string | null = null;
let activeFacilityId: string | null = null;

if (typeof window !== "undefined") {
  authToken = window.localStorage.getItem(STORAGE_TOKEN);
  refreshToken = window.localStorage.getItem(STORAGE_REFRESH);
  activeFacilityId = window.localStorage.getItem(STORAGE_FACILITY);
}

export function setAuthTokens(access: string, refresh: string | null): void {
  authToken = access;
  refreshToken = refresh;
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_TOKEN, access);
  if (refresh) window.localStorage.setItem(STORAGE_REFRESH, refresh);
  else window.localStorage.removeItem(STORAGE_REFRESH);
}

export function clearAuthTokens(): void {
  authToken = null;
  refreshToken = null;
  activeFacilityId = null;
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_TOKEN);
  window.localStorage.removeItem(STORAGE_REFRESH);
  window.localStorage.removeItem(STORAGE_FACILITY);
}

export function setActiveFacilityId(id: string | null): void {
  activeFacilityId = id;
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(STORAGE_FACILITY, id);
  else window.localStorage.removeItem(STORAGE_FACILITY);
}

export function getAuthToken(): string | null {
  return authToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

export function getActiveFacilityId(): string | null {
  return activeFacilityId;
}

/** Registered by AuthProvider so a failed refresh can flip its React auth
 *  state (this module only owns the token cache, not the UI's session
 *  state) — without this, AuthGuard would never notice tokens were cleared
 *  and wouldn't redirect to /login. `reason` — when available — comes from
 *  the backend's `classify_session_auth_failure` (e.g. "password_changed",
 *  "mfa_reset", "admin_mfa_reset", "logout_all", "session_revoked",
 *  "session_expired", "user_inactive") so the login screen can show a
 *  specific forced-logout message instead of a generic one. */
let onSessionExpired: ((reason?: string) => void) | null = null;
export function setOnSessionExpired(cb: ((reason?: string) => void) | null): void {
  onSessionExpired = cb;
}

function sessionExpiredReason(details: unknown): string | undefined {
  if (details && typeof details === "object" && "reason" in details) {
    const reason = (details as { reason?: unknown }).reason;
    return typeof reason === "string" ? reason : undefined;
  }
  return undefined;
}

// Stripped of any trailing slash so `${API_BASE_URL}${path}` (path always
// starts with "/") can never produce a double slash regardless of how the
// env var is set at build time — a misconfigured deploy env once shipped
// "https://host/" here instead of "https://host/api/v1", which combined with
// naive concatenation silently 404'd every request in production.
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");

interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
  meta?: Record<string, unknown>;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
  skipAuth?: boolean;
  skipFacility?: boolean;
  /** Cancel an in-flight request (route change, superseded search, etc.). */
  signal?: AbortSignal;
  /** Sent as the Idempotency-Key header — reuse the same key across a retry
   *  of the same logical operation (e.g. a payment after a timeout) so the
   *  backend can recognize it as the same attempt instead of a new one. */
  idempotencyKey?: string;
  /** Internal — set by apiFetch itself when retrying after a refresh, so
   *  the retried call can't trigger a second refresh attempt. Not meant to
   *  be passed by callers. */
  __isRetry?: boolean;
}

/** Raw, non-enveloped error shape used only by the rate limiter (slowapi) —
 *  confirmed live: HTTP 429 with body `{"error": "Rate limit exceeded: ..."}`,
 *  no success/data/meta fields at all. This is the one response type in the
 *  whole API that isn't wrapped by the backend's success/error envelope
 *  middleware (which only wraps 2xx-<300 JSON responses), so it needs its
 *  own detection distinct from the normal `error: {code,message,details}`
 *  object shape. */
function isRawRateLimitBody(payload: unknown): payload is { error: string } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as { error?: unknown }).error === "string"
  );
}

// Single in-flight refresh shared by every concurrent 401 — the backend
// rotates the refresh token on every use (single-use), so two independent
// refresh calls racing would make the second one fail with a token the
// first call already consumed.
let refreshInFlight: Promise<boolean> | null = null;

async function performTokenRefresh(): Promise<boolean> {
  const currentRefresh = refreshToken;
  if (!currentRefresh || !API_BASE_URL) return false;
  try {
    const response = await fetch(`${API_BASE_URL}/foundation/auth/refresh`, {
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
    setAuthTokens(payload.data.access_token, payload.data.refresh_token ?? null);
    return true;
  } catch {
    return false;
  }
}

/** Real pagination metadata the backend attaches to list responses
 *  (page/page_size/total_count) — see PaginationParams on the backend. */
export interface PageMeta {
  page?: number;
  page_size?: number;
  total_count?: number;
  [key: string]: unknown;
}

interface FetchResult<T> {
  data: T;
  meta: PageMeta;
}

/** Shared implementation — apiFetch (below) is just this with meta dropped,
 *  kept for every existing caller that only ever wanted the data. */
async function apiFetchRaw<T>(
  path: string,
  options: RequestOptions = {},
): Promise<FetchResult<T>> {
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
    for (const [k, v] of Object.entries(options.params)) {
      if (v === undefined || v === null) continue;
      search.set(k, String(v));
    }
    const qs = search.toString();
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (!options.skipAuth && authToken) headers.Authorization = `Bearer ${authToken}`;
  if (!options.skipFacility && activeFacilityId) headers["X-Facility-ID"] = activeFacilityId;
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  const method = options.method ?? "GET";
  const startedAt = performance.now();
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
      realm: "tenant",
      method,
      path,
      outcome: aborted ? "aborted" : "network_error",
      durationMs: Math.round(performance.now() - startedAt),
    });
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("REQUEST_ABORTED", "Request was cancelled.", 0);
    }
    throw new ApiError(
      "NETWORK_ERROR",
      err instanceof Error ? err.message : "Network request failed",
      0,
    );
  }

  // 204 No Content (e.g. the Organisation deactivation route) has no body
  // to parse — response.json() throws on an empty body, which would
  // otherwise turn a successful delete into a reported "malformed response"
  // error. Treat it as success with no data instead.
  if (response.status === 204) {
    recordApiTelemetry({
      realm: "tenant",
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
      realm: "tenant",
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

  // The rate limiter's raw {"error": "..."} body is the one response shape
  // in the whole API not wrapped by the backend's envelope middleware
  // (confirmed live: HTTP 429 with no success/data/meta at all).
  if (response.status === 429 && isRawRateLimitBody(rawPayload)) {
    recordApiTelemetry({
      realm: "tenant",
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

    // skipAuth calls (login, resolve-organisations, mfa/*, password reset)
    // never carry a bearer token — a 401 there is a real credential
    // failure, not a stale-token case, so never attempt a refresh for them.
    if (
      response.status === 401 &&
      !options.skipAuth &&
      !options.__isRetry &&
      refreshToken
    ) {
      refreshInFlight ??= performTokenRefresh().finally(() => {
        refreshInFlight = null;
      });
      const refreshed = await refreshInFlight;
      if (refreshed) {
        return apiFetchRaw<T>(path, { ...options, __isRetry: true });
      }
      clearAuthTokens();
      onSessionExpired?.(sessionExpiredReason(e.details));
    }

    if (response.status === 401 && !options.skipAuth && !refreshToken) {
      clearAuthTokens();
      onSessionExpired?.(sessionExpiredReason(e.details));
    }

    recordApiTelemetry({
      realm: "tenant",
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
    realm: "tenant",
    method,
    path,
    outcome: "success",
    status: response.status,
    requestId,
    durationMs: Math.round(performance.now() - startedAt),
  });
  return { data: payload.data as T, meta: payload.meta ?? {} };
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { data } = await apiFetchRaw<T>(path, options);
  return data;
}

/** Same as apiFetch, but also returns the response's real pagination
 *  metadata (page/page_size/total_count) instead of discarding it — use
 *  for any list endpoint a screen needs to paginate or show a real count
 *  for, rather than inferring totals from the current page's length. */
export async function apiFetchWithMeta<T>(
  path: string,
  options: RequestOptions = {},
): Promise<FetchResult<T>> {
  return apiFetchRaw<T>(path, options);
}

export const apiGet = <T>(
  path: string,
  options?: Omit<RequestOptions, "method" | "body">,
) => apiFetch<T>(path, { ...options, method: "GET" });

export const apiGetWithMeta = <T>(
  path: string,
  options?: Omit<RequestOptions, "method" | "body">,
) => apiFetchWithMeta<T>(path, { ...options, method: "GET" });

export const apiPost = <T>(
  path: string,
  body?: unknown,
  options?: Omit<RequestOptions, "method" | "body">,
) => apiFetch<T>(path, { ...options, method: "POST", body });

export const apiPatch = <T>(
  path: string,
  body?: unknown,
  options?: Omit<RequestOptions, "method" | "body">,
) => apiFetch<T>(path, { ...options, method: "PATCH", body });

export const apiPut = <T>(
  path: string,
  body?: unknown,
  options?: Omit<RequestOptions, "method" | "body">,
) => apiFetch<T>(path, { ...options, method: "PUT", body });

export const apiDelete = <T>(
  path: string,
  options?: Omit<RequestOptions, "method" | "body">,
) => apiFetch<T>(path, { ...options, method: "DELETE" });

/** For binary responses (receipts, exports) — these aren't JSON and aren't
 *  wrapped in the success/error envelope, so they need their own fetch path
 *  rather than going through apiFetchRaw's JSON parsing. Still attaches
 *  auth/facility headers and goes through the same 401-refresh-retry logic. */
export async function apiDownload(
  path: string,
  options: Omit<RequestOptions, "method" | "body"> = {},
): Promise<Blob> {
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
    for (const [k, v] of Object.entries(options.params)) {
      if (v === undefined || v === null) continue;
      search.set(k, String(v));
    }
    const qs = search.toString();
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }

  const headers: Record<string, string> = {};
  if (!options.skipAuth && authToken) headers.Authorization = `Bearer ${authToken}`;
  if (!options.skipFacility && activeFacilityId) headers["X-Facility-ID"] = activeFacilityId;

  let response: Response;
  try {
    response = await fetch(url, { headers, signal: options.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("REQUEST_ABORTED", "Request was cancelled.", 0);
    }
    throw new ApiError(
      "NETWORK_ERROR",
      err instanceof Error ? err.message : "Network request failed",
      0,
    );
  }

  if (response.status === 401 && !options.skipAuth && !options.__isRetry && refreshToken) {
    refreshInFlight ??= performTokenRefresh().finally(() => {
      refreshInFlight = null;
    });
    const refreshed = await refreshInFlight;
    if (refreshed) {
      return apiDownload(path, { ...options, __isRetry: true });
    }
    clearAuthTokens();
    onSessionExpired?.();
  }

  if (!response.ok) {
    // Error responses here are still JSON-enveloped (only success bodies
    // are binary), so parse them the normal way for a real message.
    let message = `Download failed (HTTP ${response.status})`;
    let code = "DOWNLOAD_FAILED";
    try {
      const payload = (await response.json()) as Envelope<unknown>;
      if (payload.error) {
        message = payload.error.message;
        code = payload.error.code;
      }
    } catch {
      // fall through with the generic message
    }
    throw new ApiError(code, message, response.status);
  }

  return response.blob();
}
