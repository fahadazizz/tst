"use client";

// login/page.tsx
// Two-panel tenant sign-in (Fahad's ONBD-1 design):
//   Left  — brand panel (teal), product framing + trust signals. Hidden on
//           narrow viewports so the form gets the full width on mobile.
//   Right — the two-step form:
//     Step 1  email only → POST /auth/resolve-organisations (no raw UUID typed).
//     Step 2  password → POST /auth/login. Success (no MFA) → token → dashboard.
//
// Logic is unchanged from the working version; this pass only enriches the
// visual layer (depth on the brand panel, a step indicator, refined inputs).

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  Building2,
  ArrowLeft,
  Loader2,
  ShieldCheck,
  Activity,
  Lock,
  Mail,
  KeyRound,
  Check,
} from "lucide-react";
import { apiPost, ApiError } from "@/lib/api";
import { useAuth } from "@/context/auth";
import { useSession } from "@/context/session";
import { resolvePersonaLanding } from "@/lib/personaLanding";
import type { components } from "@/types/api";

type OrganisationOption = { organisation_id: string; organisation_name: string };
type ResolveResponse = { organisations: OrganisationOption[] };
type TokenResponse = components["schemas"]["TokenResponse"];

type Stage = "email" | "pick-org" | "password" | "mfa" | "forgot-password";

// Specific, honest copy per forced-logout reason (spec §7.10/§7.12) instead
// of one generic "session expired" message for every involuntary sign-out.
const FORCED_LOGOUT_MESSAGES: Record<string, string> = {
  password_changed: "Your password was changed. Please sign in again.",
  password_reset: "Your password has been reset. Please sign in with your new password.",
  mfa_reset: "Your two-factor authentication was reset. Please sign in again.",
  admin_mfa_reset:
    "Your two-factor authentication was reset by an administrator. Please sign in again.",
  logout_all: "You were signed out of all sessions. Please sign in again.",
  session_revoked: "This session was ended by an administrator.",
  session_expired: "Your session expired. Please sign in again.",
  session_not_found: "Your session is no longer valid. Please sign in again.",
  user_inactive: "This account is no longer active. Contact your administrator.",
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, verifyMfa, reissueMfaChallenge, forcedLogoutReason } = useAuth();
  const session = useSession();

  const [stage, setStage] = useState<Stage>("email");
  // Sign-in/MFA succeeded but scope.permissions isn't populated yet —
  // SessionProvider only starts resolving it once isAuthenticated flips
  // true, and that's a multi-request async chain (facility -> permissions
  // -> org -> facilities). Redirecting immediately would always land on
  // /dashboard, since resolvePersonaLanding would see an empty permission
  // set. This flag defers the redirect to the effect below, which fires
  // once session.ready catches up.
  const [awaitingSession, setAwaitingSession] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgs, setOrgs] = useState<OrganisationOption[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<OrganisationOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Seeded once from whatever forced this page to load, if anything — not
  // re-derived on every render, since the reason is only meaningful at the
  // moment the redirect happened. resetSuccess (from the password-reset/
  // account-setup callback routes) takes priority over a stale forced-logout
  // reason, since it's the more specific, more recent event.
  const [info, setInfo] = useState<string | null>(() => {
    const resetSuccess = searchParams.get("resetSuccess");
    if (resetSuccess) return resetSuccess;
    return forcedLogoutReason
      ? (FORCED_LOGOUT_MESSAGES[forcedLogoutReason] ??
        "You were signed out. Please sign in again.")
      : null;
  });

  const [mfaChallengeToken, setMfaChallengeToken] = useState<string | null>(null);
  const [mfaMode, setMfaMode] = useState<"totp" | "recovery">("totp");
  const [mfaCode, setMfaCode] = useState("");

  const GENERIC =
    "We couldn't sign you in with those details. Check your email and password and try again.";

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await apiPost<ResolveResponse>(
        "/foundation/auth/resolve-organisations",
        { email: email.trim() },
        { skipAuth: true, skipFacility: true },
      );
      const list = res.organisations ?? [];
      if (list.length === 0) {
        setError(GENERIC);
      } else if (list.length === 1) {
        setSelectedOrg(list[0]);
        setStage("password");
      } else {
        setOrgs(list);
        setStage("pick-org");
      }
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "VALIDATION_SCHEMA_ERROR"
          ? "Please enter a valid email address."
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function handlePickOrg(org: OrganisationOption) {
    setSelectedOrg(org);
    setStage("password");
    setError(null);
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrg) return;
    setError(null);
    setBusy(true);
    try {
      const tokens = await login({
        organisation_id: selectedOrg.organisation_id,
        email: email.trim(),
        password,
      } as components["schemas"]["LoginRequest"]);

      if ((tokens as TokenResponse).mfa_required) {
        const challengeToken = (tokens as TokenResponse).mfa_challenge_token;
        if (!challengeToken) {
          // Shouldn't happen per the API contract, but fail safely rather
          // than sending the user into a stage with nothing to submit.
          setError(GENERIC);
          return;
        }
        setMfaChallengeToken(challengeToken);
        setMfaMode("totp");
        setMfaCode("");
        setStage("mfa");
        return;
      }
      setAwaitingSession(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.httpStatus === 423) {
          setError(
            "This account is temporarily locked after too many attempts. Please try again in a few minutes.",
          );
        } else if (err.httpStatus === 429) {
          setError("Too many attempts. Please wait a minute and try again.");
        } else if (err.httpStatus === 503) {
          setError(
            "This account needs a security reset. Please contact your administrator.",
          );
        } else {
          setError(GENERIC);
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaChallengeToken) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const tokens = await verifyMfa({
        mfa_challenge_token: mfaChallengeToken,
        ...(mfaMode === "totp"
          ? { totp_code: mfaCode.trim() }
          : { recovery_code: mfaCode.trim() }),
      });
      if (!tokens.access_token) {
        // API contract says a successful verify always returns one; treat
        // anything else as a failure rather than silently "succeeding".
        setError(GENERIC);
        return;
      }
      setAwaitingSession(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.httpStatus === 423) {
          setError(
            "Too many incorrect attempts — this sign-in attempt is locked. Please start again.",
          );
        } else if (err.httpStatus === 429) {
          setError("Too many attempts. Please wait a minute and try again.");
        } else if (err.httpStatus === 401) {
          // Backend messages here are safe to show as-is: "Invalid MFA code",
          // "MFA challenge expired or consumed", "Invalid MFA challenge" —
          // none leak account existence/enumeration info.
          setError(err.message || GENERIC);
        } else {
          setError(err.message || GENERIC);
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleReissueChallenge() {
    if (!mfaChallengeToken) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const tokens = await reissueMfaChallenge(mfaChallengeToken);
      if (tokens.mfa_challenge_token) {
        setMfaChallengeToken(tokens.mfa_challenge_token);
        setMfaCode("");
        setInfo("New challenge issued — enter a fresh code from your authenticator app.");
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message || GENERIC
          : "Couldn't request a new challenge. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  // Fires once sign-in/MFA succeeded AND the session bootstrap (facility ->
  // permissions -> org -> facilities) has actually caught up — only then is
  // session.scope.permissions the real, live set rather than an empty
  // placeholder from before this sign-in.
  useEffect(() => {
    if (awaitingSession && session.ready) {
      router.push(resolvePersonaLanding(session.scope.permissions));
    }
  }, [awaitingSession, session.ready, session.scope.permissions, router]);

  function resetToEmail() {
    setStage("email");
    setPassword("");
    setSelectedOrg(null);
    setOrgs([]);
    setError(null);
    setInfo(null);
    setMfaChallengeToken(null);
    setMfaCode("");
  }

  /** POST /auth/password/reset/request — organisation_id comes from the
   *  already-resolved selectedOrg (spec §7.11: never ask for the raw UUID).
   *  Response is always `{ accepted: true }` regardless of whether the
   *  email matches a real account, so the UI must show the same message
   *  either way — no account-existence enumeration. */
  async function handleForgotPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrg) return;
    setError(null);
    setBusy(true);
    try {
      await apiPost(
        "/foundation/auth/password/reset/request",
        { organisation_id: selectedOrg.organisation_id, email: email.trim() },
        { skipAuth: true, skipFacility: true },
      );
    } catch {
      // Deliberately ignored — the response is the same either way, and a
      // transient network failure here shouldn't reveal anything different
      // from success (retry is always safe: requesting again just issues
      // another token).
    } finally {
      setInfo(
        "If an account exists for that email, a password reset link has been sent.",
      );
      setBusy(false);
    }
  }

  const stepIndex = stage === "email" ? 0 : 1;

  return (
    <div className="flex min-h-screen">
      {/* LEFT — brand panel (hidden on small screens) */}
      <aside className="relative hidden w-[46%] flex-col justify-between overflow-hidden px-12 py-14 lg:flex">
        {/* layered teal background with depth */}
        <div className="absolute inset-0 bg-brand" />
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(120% 80% at 100% 0%, rgba(255,255,255,0.14), transparent 55%), radial-gradient(100% 90% at 0% 100%, rgba(0,0,0,0.18), transparent 50%)",
          }}
        />
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-8 -top-8 size-72 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-80 rounded-full bg-white/5" />

        <div className="relative flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-white/15 text-white ring-1 ring-white/20">
            <Activity size={18} />
          </span>
          <span className="text-[15px] font-semibold text-white">NexAura HMS</span>
        </div>

        <div className="relative">
          <h2 className="max-w-sm text-[27px] font-semibold leading-tight tracking-tight text-white">
            Every patient, every facility — one secure record.
          </h2>
          <p className="mt-3.5 max-w-sm text-[13px] leading-relaxed text-white/80">
            A multi-tenant healthcare platform with organisation-scoped access,
            immutable audit trails, and AI-assisted clinical workflows.
          </p>
        </div>

        <div className="relative flex flex-col gap-3.5">
          {[
            { icon: ShieldCheck, text: "Row-level tenant isolation on every record" },
            { icon: Lock, text: "Role-based access, resolved per request" },
            { icon: Activity, text: "AI as an additive layer — never load-bearing" },
          ].map(({ icon: Icon, text }) => (
            <div
              key={text}
              className="flex items-center gap-3 text-[12.5px] text-white/85"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/12 ring-1 ring-white/15">
                <Icon size={14} />
              </span>
              {text}
            </div>
          ))}
        </div>
      </aside>

      {/* RIGHT — form panel */}
      <main className="relative flex flex-1 items-center justify-center bg-bg px-6 py-12">
        <div className="w-full max-w-[400px]">
          {/* compact brand mark — small screens only */}
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-brand text-white">
              <Activity size={22} />
            </span>
            <h1 className="text-lg font-semibold text-ink">NexAura HMS</h1>
          </div>

          {/* Step indicator */}
          <div className="mb-6 flex items-center gap-2">
            <StepDot active={stepIndex >= 0} done={stepIndex > 0} icon={Mail} />
            <div
              className={`h-px flex-1 transition-colors ${
                stepIndex > 0 ? "bg-brand" : "bg-line"
              }`}
            />
            <StepDot active={stepIndex >= 1} done={false} icon={KeyRound} />
          </div>

          <div className="mb-6">
            <h1 className="text-[22px] font-semibold tracking-tight text-ink">
              {stage === "email" && "Welcome back"}
              {stage === "pick-org" && "Choose organisation"}
              {stage === "password" && "Enter your password"}
              {stage === "mfa" && "Two-factor verification"}
              {stage === "forgot-password" && "Reset your password"}
            </h1>
            <p className="mt-1 text-[13px] text-ink-2">
              {stage === "email" && "Sign in to continue to your facility."}
              {stage === "pick-org" &&
                "This email is registered at more than one organisation."}
              {stage === "password" && "Almost there — confirm it's you."}
              {stage === "mfa" &&
                (mfaMode === "totp"
                  ? "Enter the 6-digit code from your authenticator app."
                  : "Enter one of your unused recovery codes.")}
              {stage === "forgot-password" &&
                "We'll email a reset link to this address if an account exists."}
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-alert-line bg-alert-tint px-3.5 py-2.5 text-[12.5px] text-alert">
              {error}
            </div>
          )}
          {info && (
            <div className="mb-4 rounded-lg border border-brand-line bg-brand-tint px-3.5 py-2.5 text-[12.5px] text-brand">
              {info}
            </div>
          )}

          {/* STEP 1 — email */}
          {stage === "email" && (
            <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-ink-2">Email</span>
                <div className="flex items-center gap-2.5 rounded-lg border border-line-2 bg-surface px-3.5 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-tint">
                  <Mail size={15} className="shrink-0 text-ink-3" />
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@hospital.com"
                    className="min-w-0 flex-1 bg-transparent py-2.5 text-[13.5px] text-ink outline-none placeholder:text-ink-3"
                  />
                </div>
              </label>
              <button
                type="submit"
                disabled={busy}
                className="flex items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2.5 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy && <Loader2 size={15} className="animate-spin" />}
                Continue
              </button>
            </form>
          )}

          {/* STEP 1b — org picker */}
          {stage === "pick-org" && (
            <div className="flex flex-col gap-2">
              {orgs.map((org) => (
                <button
                  key={org.organisation_id}
                  onClick={() => handlePickOrg(org)}
                  className="group flex items-center gap-3 rounded-lg border border-line bg-surface px-3.5 py-3 text-left transition-all hover:border-brand-line hover:bg-brand-tint hover:shadow-sm"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
                    <Building2 size={17} />
                  </span>
                  <span className="flex-1 text-[13.5px] font-medium text-ink">
                    {org.organisation_name}
                  </span>
                  <ArrowLeft
                    size={15}
                    className="rotate-180 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100"
                  />
                </button>
              ))}
              <button
                onClick={resetToEmail}
                className="mt-2 flex items-center gap-1.5 self-start text-[12.5px] text-ink-3 transition-colors hover:text-ink-2"
              >
                <ArrowLeft size={13} /> Use a different email
              </button>
            </div>
          )}

          {/* STEP 2 — password */}
          {stage === "password" && selectedOrg && (
            <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
              <div className="flex items-center gap-2.5 rounded-lg border border-brand-line bg-brand-tint px-3.5 py-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-white/70 text-brand">
                  <Building2 size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] leading-tight text-brand/70">
                    Organisation
                  </span>
                  <span className="block truncate text-[12.5px] font-medium text-ink">
                    {selectedOrg.organisation_name}
                  </span>
                </span>
                <Check size={15} className="shrink-0 text-brand" />
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-ink-2">Password</span>
                <div className="flex items-center gap-2.5 rounded-lg border border-line-2 bg-surface px-3.5 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-tint">
                  <KeyRound size={15} className="shrink-0 text-ink-3" />
                  <input
                    type="password"
                    required
                    autoFocus
                    maxLength={72}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="min-w-0 flex-1 bg-transparent py-2.5 text-[13.5px] text-ink outline-none placeholder:text-ink-3"
                  />
                </div>
              </label>
              <button
                type="submit"
                disabled={busy || awaitingSession}
                className="flex items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2.5 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {(busy || awaitingSession) && <Loader2 size={15} className="animate-spin" />}
                Sign in
              </button>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={resetToEmail}
                  className="flex items-center gap-1.5 text-[12.5px] text-ink-3 transition-colors hover:text-ink-2"
                >
                  <ArrowLeft size={13} /> Use a different email
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setInfo(null);
                    setStage("forgot-password");
                  }}
                  className="text-[12.5px] text-ink-3 transition-colors hover:text-ink-2"
                >
                  Forgot password?
                </button>
              </div>
            </form>
          )}

          {/* Forgot password — request a reset link (organisation_id comes
              from selectedOrg, never typed by the user). */}
          {stage === "forgot-password" && selectedOrg && (
            <form onSubmit={handleForgotPasswordSubmit} className="flex flex-col gap-4">
              <div className="flex items-center gap-2.5 rounded-lg border border-brand-line bg-brand-tint px-3.5 py-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-white/70 text-brand">
                  <Building2 size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] leading-tight text-brand/70">
                    Organisation
                  </span>
                  <span className="block truncate text-[12.5px] font-medium text-ink">
                    {selectedOrg.organisation_name}
                  </span>
                </span>
                <Check size={15} className="shrink-0 text-brand" />
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-ink-2">Email</span>
                <div className="flex items-center gap-2.5 rounded-lg border border-line-2 bg-surface px-3.5 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-tint">
                  <Mail size={15} className="shrink-0 text-ink-3" />
                  <input
                    type="email"
                    required
                    value={email}
                    disabled
                    className="min-w-0 flex-1 bg-transparent py-2.5 text-[13.5px] text-ink outline-none placeholder:text-ink-3 disabled:opacity-70"
                  />
                </div>
              </label>
              <button
                type="submit"
                disabled={busy}
                className="flex items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2.5 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy && <Loader2 size={15} className="animate-spin" />}
                Send reset link
              </button>
              <button
                type="button"
                onClick={() => {
                  setStage("password");
                  setError(null);
                  setInfo(null);
                }}
                className="flex items-center gap-1.5 self-start text-[12.5px] text-ink-3 transition-colors hover:text-ink-2"
              >
                <ArrowLeft size={13} /> Back to sign in
              </button>
            </form>
          )}

          {/* STEP 3 — MFA challenge */}
          {stage === "mfa" && (
            <form onSubmit={handleMfaSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-ink-2">
                  {mfaMode === "totp" ? "Authenticator code" : "Recovery code"}
                </span>
                <div className="flex items-center gap-2.5 rounded-lg border border-line-2 bg-surface px-3.5 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-tint">
                  <ShieldCheck size={15} className="shrink-0 text-ink-3" />
                  <input
                    type="text"
                    inputMode={mfaMode === "totp" ? "numeric" : "text"}
                    required
                    autoFocus
                    maxLength={mfaMode === "totp" ? 6 : 32}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    placeholder={mfaMode === "totp" ? "123456" : "Recovery code"}
                    className="min-w-0 flex-1 bg-transparent py-2.5 text-[13.5px] text-ink outline-none placeholder:text-ink-3"
                  />
                </div>
              </label>
              <button
                type="submit"
                disabled={busy || awaitingSession}
                className="flex items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2.5 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {(busy || awaitingSession) && <Loader2 size={15} className="animate-spin" />}
                Verify
              </button>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setMfaMode((m) => (m === "totp" ? "recovery" : "totp"));
                    setMfaCode("");
                    setError(null);
                    setInfo(null);
                  }}
                  className="text-[12.5px] text-ink-3 transition-colors hover:text-ink-2"
                >
                  {mfaMode === "totp"
                    ? "Use a recovery code instead"
                    : "Use an authenticator code instead"}
                </button>
                {mfaMode === "totp" && (
                  <button
                    type="button"
                    onClick={handleReissueChallenge}
                    disabled={busy}
                    className="text-[12.5px] text-ink-3 transition-colors hover:text-ink-2 disabled:opacity-60"
                  >
                    Request new challenge
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={resetToEmail}
                className="flex items-center gap-1.5 self-start text-[12.5px] text-ink-3 transition-colors hover:text-ink-2"
              >
                <ArrowLeft size={13} /> Start over
              </button>
            </form>
          )}

          <p className="mt-8 flex items-center gap-1.5 text-[11px] text-ink-3">
            <ShieldCheck size={13} className="text-ink-3" />
            Protected by organisation-scoped access control.
          </p>
        </div>
      </main>
    </div>
  );
}

function StepDot({
  active,
  done,
  icon: Icon,
}: {
  active: boolean;
  done: boolean;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <span
      className={`grid size-8 shrink-0 place-items-center rounded-full border transition-colors ${
        done
          ? "border-brand bg-brand text-white"
          : active
            ? "border-brand bg-brand-tint text-brand"
            : "border-line bg-surface text-ink-3"
      }`}
    >
      {done ? <Check size={15} /> : <Icon size={15} />}
    </span>
  );
}