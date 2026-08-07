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
import type { components } from "@/types/api";
import {
  clearPlatformAuthTokens,
  getPlatformAuthToken,
  platformPost,
  setOnPlatformSessionExpired,
  setPlatformAuthTokens,
} from "@/lib/platform-api";
import { listPlatformUsers, type PlatformUser } from "@/lib/api/platform";
import { clearAllCached } from "@/lib/queryCache";
import { teardownAllRealtime } from "@/lib/realtime";

type PlatformLoginRequest = components["schemas"]["PlatformLoginRequest"];
type PlatformTokenResponse = components["schemas"]["PlatformTokenResponse"];
type PlatformMFAVerifyRequest = components["schemas"]["PlatformMFAVerifyRequest"];
type PlatformMFASetupResponse = components["schemas"]["PlatformMFASetupResponse"];
type PlatformMFAEnableRequest = components["schemas"]["PlatformMFAEnableRequest"];
type PlatformMFAEnableResponse = components["schemas"]["PlatformMFAEnableResponse"];
type PlatformLogoutResponse = components["schemas"]["PlatformLogoutResponse"];

const LOGIN_EMAIL_KEY = "hms.platform.login_email";

export type PlatformIdentity = Pick<
  PlatformUser,
  "full_name" | "email" | "platform_role"
>;

interface PlatformAuthValue {
  isReady: boolean;
  isAuthenticated: boolean;
  login: (payload: PlatformLoginRequest) => Promise<PlatformTokenResponse>;
  verifyMfa: (payload: PlatformMFAVerifyRequest) => Promise<PlatformTokenResponse>;
  setupMfa: () => Promise<PlatformMFASetupResponse>;
  enableMfa: (payload: PlatformMFAEnableRequest) => Promise<PlatformMFAEnableResponse>;
  logout: () => Promise<void>;
  /** There is no backend self-profile endpoint (GET /users/{id} requires
   *  platform:user:read, which not every platform role holds reliably as a
   *  self-lookup). Instead: the platform API's list-users read is granted
   *  to every real platform role (admin/super_admin bypass entirely;
   *  auditor passes because it ends in ":read"), so this resolves identity
   *  by listing all platform users and matching the email used at login
   *  (the one piece of "who this is" the client already has, from the
   *  login form itself) — a real permission-respecting lookup, not a guess. */
  identity: PlatformIdentity | null;
  identityState: "loading" | "ready" | "unavailable";
}

const PlatformAuthContext = createContext<PlatformAuthValue | null>(null);

export function PlatformAuthProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [hasToken, setHasToken] = useState(() => Boolean(getPlatformAuthToken()));
  const [loginEmail, setLoginEmail] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem(LOGIN_EMAIL_KEY),
  );
  const [identity, setIdentity] = useState<PlatformIdentity | null>(null);
  const [identityState, setIdentityState] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");

  useEffect(() => {
    setOnPlatformSessionExpired(() => {
      setHasToken(false);
      clearAllCached();
      teardownAllRealtime();
    });
    queueMicrotask(() => setIsReady(true));
    return () => setOnPlatformSessionExpired(null);
  }, []);

  // Resolves once per (token, email) pair, not on every render — listing
  // every platform user is real work server-side, not a cheap call to repeat.
  useEffect(() => {
    if (!hasToken || !loginEmail) {
      queueMicrotask(() => {
        setIdentity(null);
        setIdentityState(hasToken ? "unavailable" : "loading");
      });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => setIdentityState("loading"));
    queueMicrotask(async () => {
      try {
        const users = await listPlatformUsers();
        if (cancelled) return;
        const self = users.find(
          (u) => u.email.toLowerCase() === loginEmail.toLowerCase(),
        );
        if (self) {
          setIdentity({
            full_name: self.full_name,
            email: self.email,
            platform_role: self.platform_role,
          });
          setIdentityState("ready");
        } else {
          // Genuinely can't happen for a real authenticated user — the
          // list is global, not paginated per-org — but fail visibly
          // rather than silently, since this drives role-gated UI.
          setIdentity(null);
          setIdentityState("unavailable");
        }
      } catch {
        if (!cancelled) {
          setIdentity(null);
          setIdentityState("unavailable");
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [hasToken, loginEmail]);

  const applyTokensIfComplete = useCallback((tokens: PlatformTokenResponse) => {
    if (!tokens.access_token) return;
    setPlatformAuthTokens(tokens.access_token, tokens.refresh_token ?? null);
    setHasToken(true);
  }, []);

  const login = useCallback(
    async (payload: PlatformLoginRequest) => {
      const tokens = await platformPost<PlatformTokenResponse>(
        "/foundation/platform/login",
        payload,
        { skipAuth: true },
      );
      applyTokensIfComplete(tokens);
      // Persist the email regardless of whether this specific call already
      // yielded the final access token — an MFA-required response has no
      // token yet, but the email is already known and needed once
      // verifyMfa() completes the flow.
      window.localStorage.setItem(LOGIN_EMAIL_KEY, payload.email);
      setLoginEmail(payload.email);
      return tokens;
    },
    [applyTokensIfComplete],
  );

  const verifyMfa = useCallback(
    async (payload: PlatformMFAVerifyRequest) => {
      const tokens = await platformPost<PlatformTokenResponse>(
        "/foundation/platform/mfa/verify",
        payload,
        { skipAuth: true },
      );
      applyTokensIfComplete(tokens);
      return tokens;
    },
    [applyTokensIfComplete],
  );

  const setupMfa = useCallback(() => {
    return platformPost<PlatformMFASetupResponse>(
      "/foundation/platform/mfa/setup",
    );
  }, []);

  const enableMfa = useCallback((payload: PlatformMFAEnableRequest) => {
    return platformPost<PlatformMFAEnableResponse>(
      "/foundation/platform/mfa/enable",
      payload,
    );
  }, []);

  const logout = useCallback(async () => {
    try {
      await platformPost<PlatformLogoutResponse>("/foundation/platform/logout");
    } catch {
      // Local cleanup is still required if the server session already ended.
    }
    clearPlatformAuthTokens();
    window.localStorage.removeItem(LOGIN_EMAIL_KEY);
    setLoginEmail(null);
    setIdentity(null);
    setHasToken(false);
    clearAllCached();
    teardownAllRealtime();
  }, []);

  const value = useMemo<PlatformAuthValue>(
    () => ({
      isReady,
      isAuthenticated: hasToken,
      login,
      verifyMfa,
      setupMfa,
      enableMfa,
      logout,
      identity,
      identityState,
    }),
    [isReady, hasToken, login, verifyMfa, setupMfa, enableMfa, logout, identity, identityState],
  );

  return (
    <PlatformAuthContext.Provider value={value}>
      {children}
    </PlatformAuthContext.Provider>
  );
}

export function usePlatformAuth(): PlatformAuthValue {
  const ctx = useContext(PlatformAuthContext);
  if (!ctx) {
    throw new Error("usePlatformAuth must be used within a PlatformAuthProvider");
  }
  return ctx;
}
