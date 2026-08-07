"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Activity, ArrowLeft, Building2, KeyRound, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { ApiError } from "@/lib/api";
import { usePlatformAuth } from "@/context/platform-auth";

type Stage = "password" | "mfa";

const GENERIC =
  "We couldn't sign you in with those details. Check your email and password and try again.";

export default function PlatformLoginPage() {
  return (
    <Suspense fallback={null}>
      <PlatformLoginForm />
    </Suspense>
  );
}

function PlatformLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, verifyMfa } = usePlatformAuth();
  const [stage, setStage] = useState<Stage>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaChallengeToken, setMfaChallengeToken] = useState<string | null>(null);
  const [mfaMode, setMfaMode] = useState<"totp" | "recovery">("totp");
  const [mfaCode, setMfaCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Seeded once from the redirect that landed here, e.g. a just-completed
  // password change from the Account panel — not re-derived on every
  // render, since it's only meaningful at the moment of the redirect.
  const [info] = useState<string | null>(() => searchParams.get("resetSuccess"));

  async function handlePasswordSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const tokens = await login({ email: email.trim(), password });
      if (tokens.mfa_required) {
        if (!tokens.mfa_challenge_token) {
          setError(GENERIC);
          return;
        }
        setMfaChallengeToken(tokens.mfa_challenge_token);
        setMfaMode("totp");
        setMfaCode("");
        setStage("mfa");
        return;
      }
      if (tokens.mfa_enrollment_required) {
        router.push("/platform/mfa-enroll");
        return;
      }
      router.push("/platform");
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleMfaSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!mfaChallengeToken) return;
    setError(null);
    setBusy(true);
    try {
      const tokens = await verifyMfa({
        mfa_challenge_token: mfaChallengeToken,
        ...(mfaMode === "totp"
          ? { totp_code: mfaCode.trim() }
          : { recovery_code: mfaCode.trim() }),
      });
      if (!tokens.access_token) {
        setError(GENERIC);
        return;
      }
      if (tokens.mfa_enrollment_required) {
        router.push("/platform/mfa-enroll");
      } else {
        router.push("/platform");
      }
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen grid-cols-1 bg-bg lg:grid-cols-[0.95fr_1.05fr]">
      <section className="hidden bg-brand px-12 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-white/15">
            <Building2 size={20} />
          </span>
          <div>
            <div className="text-[15px] font-semibold">NexAura Platform</div>
            <div className="text-[12px] text-white/75">Operator console</div>
          </div>
        </div>
        <div className="max-w-md">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-[12px] text-white/80">
            <ShieldCheck size={14} />
            Separate platform authentication realm
          </div>
          <h1 className="text-[32px] font-semibold leading-tight tracking-tight">
            Manage the platform without crossing tenant sessions.
          </h1>
          <p className="mt-4 text-[14px] leading-6 text-white/78">
            Platform access uses dedicated tokens, refresh handling, and route
            guards. Tenant Facility context is never attached to these requests.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-white/70">
          <Activity size={14} />
          Platform Console foundation
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-7">
            <p className="text-[12px] font-medium uppercase tracking-wide text-brand">
              Platform sign in
            </p>
            <h2 className="mt-1 text-[22px] font-semibold tracking-tight text-ink">
              {stage === "mfa" ? "Verify platform MFA" : "Enter platform credentials"}
            </h2>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-alert-line bg-alert-tint px-4 py-3 text-[12.5px] text-alert">
              {error}
            </div>
          )}
          {info && (
            <div className="mb-4 rounded-xl border border-brand-line bg-brand-tint px-4 py-3 text-[12.5px] text-brand">
              {info}
            </div>
          )}

          {stage === "password" ? (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <Field icon={Mail} label="Email">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full bg-transparent text-[14px] text-ink outline-none"
                  autoComplete="email"
                  required
                />
              </Field>
              <Field icon={Lock} label="Password">
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full bg-transparent text-[14px] text-ink outline-none"
                  autoComplete="current-password"
                  required
                />
              </Field>
              <button
                type="submit"
                disabled={busy}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-[13px] font-semibold text-white disabled:opacity-60"
              >
                {busy && <Loader2 size={16} className="animate-spin" />}
                Continue
              </button>
            </form>
          ) : (
            <form onSubmit={handleMfaSubmit} className="space-y-4">
              <div className="flex rounded-xl border border-line bg-surface p-1">
                <button
                  type="button"
                  onClick={() => setMfaMode("totp")}
                  className={`flex-1 rounded-lg px-3 py-2 text-[12.5px] font-medium ${
                    mfaMode === "totp" ? "bg-brand-tint text-brand" : "text-ink-2"
                  }`}
                >
                  Authenticator
                </button>
                <button
                  type="button"
                  onClick={() => setMfaMode("recovery")}
                  className={`flex-1 rounded-lg px-3 py-2 text-[12.5px] font-medium ${
                    mfaMode === "recovery" ? "bg-brand-tint text-brand" : "text-ink-2"
                  }`}
                >
                  Recovery code
                </button>
              </div>
              <Field icon={KeyRound} label={mfaMode === "totp" ? "Code" : "Recovery code"}>
                <input
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value)}
                  className="w-full bg-transparent text-[14px] text-ink outline-none"
                  autoComplete="one-time-code"
                  required
                />
              </Field>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStage("password");
                    setMfaCode("");
                    setMfaChallengeToken(null);
                    setError(null);
                  }}
                  className="grid size-11 place-items-center rounded-xl border border-line bg-surface text-ink-2"
                  aria-label="Back"
                >
                  <ArrowLeft size={17} />
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-[13px] font-semibold text-white disabled:opacity-60"
                >
                  {busy && <Loader2 size={16} className="animate-spin" />}
                  Verify
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block rounded-xl border border-line bg-surface px-3.5 py-2.5 focus-within:border-brand-line">
      <span className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-ink-3">
        <Icon size={13} />
        {label}
      </span>
      {children}
    </label>
  );
}

function messageFor(err: unknown): string {
  if (!(err instanceof ApiError)) return "Something went wrong. Please try again.";
  if (err.httpStatus === 423) {
    return "This platform account is temporarily locked. Please try again later.";
  }
  if (err.httpStatus === 429) return "Too many attempts. Please wait and try again.";
  if (err.httpStatus === 401) return err.message || GENERIC;
  return err.message || GENERIC;
}
