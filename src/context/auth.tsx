"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  apiGetWithMeta,
  apiPost,
  clearAuthTokens,
  getAuthToken,
  setActiveFacilityId,
  setAuthTokens,
  setOnSessionExpired,
} from "@/lib/api";
import { endPlatformImpersonation } from "@/lib/api/platform";
import type { components } from "@/types/api";
import { clearAllCached } from "@/lib/queryCache";
import { teardownAllRealtime } from "@/lib/realtime";

type LoginRequest = components["schemas"]["LoginRequest"];
type TokenResponse = components["schemas"]["TokenResponse"];
type UserResponse = components["schemas"]["UserResponse"];
type MFAVerifyRequest = components["schemas"]["MFAVerifyRequest"];
type ImpersonationStartResponse =
  components["schemas"]["ImpersonationStartResponse"];

/** GET /auth/users/me carries impersonation state in the envelope's `meta`,
 *  not in the UserResponse body — a platform operator impersonating a
 *  tenant user is otherwise indistinguishable from that user's own session. */
interface ImpersonationState {
  isImpersonation: boolean;
  impersonatedByPlatformUserId: string | null;
}

const NOT_IMPERSONATED: ImpersonationState = {
  isImpersonation: false,
  impersonatedByPlatformUserId: null,
};

/** Reasons the backend's classify_session_auth_failure() can return when a
 *  request's session turns out to be no longer valid (surfaced via the
 *  401's error.details.reason) — used to show a specific forced-logout
 *  message on the login screen instead of a generic "session expired". */
export type ForcedLogoutReason =
  | "password_changed"
  | "mfa_reset"
  | "admin_mfa_reset"
  | "logout_all"
  | "logout"
  | "session_revoked"
  | "session_expired"
  | "session_not_found"
  | "user_inactive"
  | (string & {});

interface AuthValue {
  isReady: boolean;
  isAuthenticated: boolean;
  currentUser: UserResponse | null;
  impersonation: ImpersonationState;
  /** Set only when the session ended involuntarily (password change, MFA
   *  reset, admin revocation, logout-all from elsewhere, natural expiry) —
   *  never set by this tab's own explicit logout()/logoutAll() call.
   *  Cleared on the next successful login. */
  forcedLogoutReason: ForcedLogoutReason | null;
  login: (credentials: LoginRequest) => Promise<TokenResponse>;
  verifyMfa: (payload: MFAVerifyRequest) => Promise<TokenResponse>;
  reissueMfaChallenge: (mfaChallengeToken: string) => Promise<TokenResponse>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshCurrentUser: () => Promise<void>;
  applyImpersonationSession: (
    session: ImpersonationStartResponse,
  ) => Promise<void>;
  endImpersonation: () => Promise<void>;
}

function readImpersonation(meta: Record<string, unknown>): ImpersonationState {
  return {
    isImpersonation: Boolean(meta.is_impersonation),
    impersonatedByPlatformUserId:
      (meta.impersonated_by_platform_user_id as string | null | undefined) ?? null,
  };
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserResponse | null>(null);
  const [impersonation, setImpersonation] =
    useState<ImpersonationState>(NOT_IMPERSONATED);
  const [forcedLogoutReason, setForcedLogoutReason] =
    useState<ForcedLogoutReason | null>(null);

  useEffect(() => {
    // apiFetch owns the token cache, not React state — when a background
    // refresh attempt fails outright (refresh token itself expired/revoked),
    // it clears the cache but has no way to flip isAuthenticated here on its
    // own, so it calls this instead. `reason` (from the failing request's
    // classify_session_auth_failure detail) differentiates *why* — a
    // password change or admin revocation elsewhere, not just a stale token.
    setOnSessionExpired((reason) => {
      setHasToken(false);
      setCurrentUser(null);
      setImpersonation(NOT_IMPERSONATED);
      // Session revocation/expiry (spec §7.15/§7.10) — never leave a stale
      // Facility-scoped cache entry or a live real-time connection alive
      // after the session that opened it is gone.
      clearAllCached();
      teardownAllRealtime();
      if (reason && reason !== "logout") {
        setForcedLogoutReason(reason);
      }
    });
    return () => setOnSessionExpired(null);
  }, []);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      queueMicrotask(() => setIsReady(true));
      return;
    }
    queueMicrotask(() => setHasToken(true));
    apiGetWithMeta<UserResponse>("/foundation/auth/users/me")
      .then(({ data, meta }) => {
        setCurrentUser(data);
        setImpersonation(readImpersonation(meta));
      })
      .catch(() => {
        clearAuthTokens();
        setHasToken(false);
      })
      .finally(() => setIsReady(true));
  }, []);

  // Shared by login() and verifyMfa(): a TokenResponse only represents a
  // real, completed sign-in when it carries an access_token. mfa_required
  // responses (from either endpoint) never do — the caller must leave the
  // session unauthenticated and continue the MFA challenge instead of
  // storing an undefined token as if sign-in had actually succeeded.
  const applyTokensIfComplete = useCallback(async (tokens: TokenResponse) => {
    if (!tokens.access_token) return;
    setAuthTokens(tokens.access_token, tokens.refresh_token ?? null);
    setHasToken(true);
    setForcedLogoutReason(null);
    try {
      const { data, meta } = await apiGetWithMeta<UserResponse>(
        "/foundation/auth/users/me",
      );
      setCurrentUser(data);
      setImpersonation(readImpersonation(meta));
    } catch {
      // Token accepted but /me failed — leave currentUser null.
    }
  }, []);

  const login = useCallback(
    async (credentials: LoginRequest) => {
      const tokens = await apiPost<TokenResponse>(
        "/foundation/auth/login",
        credentials,
        { skipAuth: true, skipFacility: true },
      );
      await applyTokensIfComplete(tokens);
      return tokens;
    },
    [applyTokensIfComplete],
  );

  /** POST /auth/mfa/verify — TOTP or recovery-code after password login. */
  const verifyMfa = useCallback(
    async (payload: MFAVerifyRequest) => {
      const tokens = await apiPost<TokenResponse>(
        "/foundation/auth/mfa/verify",
        payload,
        { skipAuth: true, skipFacility: true },
      );
      await applyTokensIfComplete(tokens);
      return tokens;
    },
    [applyTokensIfComplete],
  );

  /** POST /auth/mfa/challenge/reissue — fresh challenge window, e.g. after
   *  the original one expired; still mfa_required, never authenticates. */
  const reissueMfaChallenge = useCallback(async (mfaChallengeToken: string) => {
    return apiPost<TokenResponse>(
      "/foundation/auth/mfa/challenge/reissue",
      { mfa_challenge_token: mfaChallengeToken },
      { skipAuth: true, skipFacility: true },
    );
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiPost("/foundation/auth/logout");
    } catch {
      // Local cleanup is what matters.
    }
    clearAuthTokens();
    setHasToken(false);
    setCurrentUser(null);
    setImpersonation(NOT_IMPERSONATED);
    clearAllCached(); // spec §7.15 — logout is one of the named cache-clear triggers.
    teardownAllRealtime(); // spec §7.10/§7.16 — close real-time connections on logout.
  }, []);

  /** POST /auth/logout-all — ends every active session for this user across
   *  all devices/tabs, including this one (LogoutAllResponse.ended_sessions
   *  / caller_session_ended). This tab clears its own state locally same as
   *  logout(); other tabs/devices find out the next time they make a
   *  request and get classified as session_end_reason "logout_all". */
  const logoutAll = useCallback(async () => {
    try {
      await apiPost("/foundation/auth/logout-all");
    } catch {
      // Local cleanup is what matters.
    }
    clearAuthTokens();
    setHasToken(false);
    setCurrentUser(null);
    setImpersonation(NOT_IMPERSONATED);
    clearAllCached();
    teardownAllRealtime();
  }, []);

  const refreshCurrentUser = useCallback(async () => {
    if (!getAuthToken()) return;
    const { data, meta } = await apiGetWithMeta<UserResponse>(
      "/foundation/auth/users/me",
    );
    setCurrentUser(data);
    setImpersonation(readImpersonation(meta));
  }, []);

  const applyImpersonationSession = useCallback(
    async (session: ImpersonationStartResponse) => {
      clearAllCached();
      teardownAllRealtime();
      setActiveFacilityId(null);
      setAuthTokens(session.access_token, null);
      setHasToken(true);
      setForcedLogoutReason(null);
      const { data, meta } = await apiGetWithMeta<UserResponse>(
        "/foundation/auth/users/me",
        { skipFacility: true },
      );
      setCurrentUser(data);
      setImpersonation(readImpersonation(meta));
    },
    [],
  );

  const endImpersonation = useCallback(async () => {
    try {
      await endPlatformImpersonation();
    } catch {
      // Local cleanup and return to Platform Console still matter if the
      // backend link already expired or was ended from another tab.
    } finally {
      clearAuthTokens();
      setHasToken(false);
      setCurrentUser(null);
      setImpersonation(NOT_IMPERSONATED);
      clearAllCached();
      teardownAllRealtime();
    }
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      isReady,
      isAuthenticated: hasToken,
      currentUser,
      impersonation,
      forcedLogoutReason,
      login,
      verifyMfa,
      reissueMfaChallenge,
      logout,
      logoutAll,
      refreshCurrentUser,
      applyImpersonationSession,
      endImpersonation,
    }),
    [
      isReady,
      hasToken,
      currentUser,
      impersonation,
      forcedLogoutReason,
      login,
      verifyMfa,
      reissueMfaChallenge,
      logout,
      logoutAll,
      refreshCurrentUser,
      applyImpersonationSession,
      endImpersonation,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
