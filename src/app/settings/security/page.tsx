"use client";

// settings/security/page.tsx
// Authenticated tenant security settings (spec §7.12): change password,
// MFA setup/enable/recovery-code regeneration/self-reset, sign out current
// session, sign out all sessions. Reachable from the UserChip menu.
//
// Two real backend actions here end every session for this user server-side
// the instant they succeed (password change, MFA reset) — per spec, the UI
// must clear local session state immediately on success, not wait for a
// future request to 401. Both call useAuth().logout() right after success
// (harmless even though the session is already dead server-side — logout()
// tolerates a failed /auth/logout call) and redirect straight to /login with
// the exact reason, rather than the generic message a later 401 would give.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import {
  KeyRound,
  ShieldCheck,
  ShieldOff,
  Loader2,
  Copy,
  Check,
  LogOut,
  Monitor,
} from "lucide-react";
import { useAuth } from "@/context/auth";
import { ApiError } from "@/lib/api";
import {
  setupMfa,
  enableMfa,
  regenerateRecoveryCodes,
  resetMfa,
  changePassword,
  type MFASetupResponse,
} from "@/lib/api/security";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message || fallback;
  return fallback;
}

export default function SecuritySettingsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-[20px] font-semibold tracking-tight text-ink">
        Security settings
      </h1>
      <p className="mt-1 text-[13px] text-ink-2">
        Manage your password, two-factor authentication, and active sessions.
      </p>

      <div className="mt-6 flex flex-col gap-5">
        <PasswordCard />
        <MfaCard />
        <SessionsCard />
      </div>
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
          <Icon size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14.5px] font-semibold text-ink">{title}</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-2">{description}</p>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

function Banner({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  const cls =
    tone === "error"
      ? "border-alert-line bg-alert-tint text-alert"
      : "border-approved-line bg-approved-tint text-approved";
  return (
    <div className={`mb-3 rounded-lg border px-3.5 py-2.5 text-[12.5px] ${cls}`}>{children}</div>
  );
}

function TextField({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-ink-2">{label}</span>
      <input
        {...props}
        className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint placeholder:text-ink-3"
      />
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────

function PasswordCard() {
  const { logout } = useAuth();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8 || newPassword.length > 72) {
      setError("New password must be 8–72 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      // Server has already ended every session for this user — clear local
      // state immediately rather than waiting for the next request to 401.
      await logout();
      router.push(
        `/login?resetSuccess=${encodeURIComponent(
          "Your password was changed. Please sign in again.",
        )}`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.httpStatus === 401) {
        setError("Current password is incorrect.");
      } else if (err instanceof ApiError && err.httpStatus === 422) {
        setError(errorMessage(err, "Your new password must be different from your current one."));
      } else {
        setError(errorMessage(err, "Something went wrong. Please try again."));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      icon={KeyRound}
      title="Password"
      description="Choose a new password. You'll be signed out of this session and asked to sign in again."
    >
      {error && <Banner tone="error">{error}</Banner>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <TextField
          label="Current password"
          type="password"
          required
          maxLength={72}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        <TextField
          label="New password"
          type="password"
          required
          minLength={8}
          maxLength={72}
          placeholder="8–72 characters"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <TextField
          label="Confirm new password"
          type="password"
          required
          minLength={8}
          maxLength={72}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy}
          className="mt-1 flex items-center justify-center gap-2 self-start rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          Change password
        </button>
      </form>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────

type MfaStage = "idle" | "setup" | "recovery-shown" | "regenerate" | "reset";

function MfaCard() {
  const { currentUser, refreshCurrentUser, logout } = useAuth();
  const router = useRouter();
  const mfaEnabled = Boolean(currentUser?.mfa_enabled);

  const [stage, setStage] = useState<MfaStage>("idle");
  const [setupData, setSetupData] = useState<MFASetupResponse | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shared by regenerate/reset — both need current_password + one live factor.
  const [currentPassword, setCurrentPassword] = useState("");
  const [factorMode, setFactorMode] = useState<"totp" | "recovery">("totp");
  const [factorCode, setFactorCode] = useState("");

  function resetLocalState() {
    setStage("idle");
    setSetupData(null);
    setTotpCode("");
    setRecoveryCodes(null);
    setAcknowledged(false);
    setCurrentPassword("");
    setFactorCode("");
    setError(null);
  }

  async function handleStartSetup() {
    setError(null);
    setBusy(true);
    try {
      const data = await setupMfa();
      setSetupData(data);
      setStage("setup");
    } catch (err) {
      setError(errorMessage(err, "Couldn't start MFA setup. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function handleEnable(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await enableMfa(totpCode.trim());
      setRecoveryCodes(result.recovery_codes);
      setStage("recovery-shown");
      await refreshCurrentUser();
    } catch (err) {
      setError(errorMessage(err, "Invalid code. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function handleRegenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await regenerateRecoveryCodes({
        current_password: currentPassword,
        ...(factorMode === "totp"
          ? { totp_code: factorCode.trim() }
          : { recovery_code: factorCode.trim() }),
      });
      setRecoveryCodes(result.recovery_codes);
      setStage("recovery-shown");
    } catch (err) {
      if (err instanceof ApiError && err.httpStatus === 401) {
        setError(err.message || "Current password or code is incorrect.");
      } else {
        setError(errorMessage(err, "Something went wrong. Please try again."));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await resetMfa({
        current_password: currentPassword,
        ...(factorMode === "totp"
          ? { totp_code: factorCode.trim() }
          : { recovery_code: factorCode.trim() }),
      });
      // Ends every session for this user server-side — clear local state now.
      await logout();
      router.push(
        `/login?resetSuccess=${encodeURIComponent(
          "Two-factor authentication was reset. Please sign in again.",
        )}`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.httpStatus === 401) {
        setError(err.message || "Current password or code is incorrect.");
      } else {
        setError(errorMessage(err, "Something went wrong. Please try again."));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCopySecret() {
    if (!setupData) return;
    try {
      await navigator.clipboard.writeText(setupData.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied — the secret is still selectable as text.
    }
  }

  return (
    <Card
      icon={mfaEnabled ? ShieldCheck : ShieldOff}
      title="Two-factor authentication"
      description={
        mfaEnabled
          ? "Enabled — your account requires a second factor at sign-in."
          : "Not enabled. Add an authenticator app for a second sign-in factor."
      }
    >
      {error && <Banner tone="error">{error}</Banner>}

      {stage === "idle" && !mfaEnabled && (
        <button
          type="button"
          onClick={handleStartSetup}
          disabled={busy}
          className="flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          Set up two-factor authentication
        </button>
      )}

      {stage === "idle" && mfaEnabled && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              resetLocalState();
              setStage("regenerate");
            }}
            className="rounded-lg border border-line px-3.5 py-2 text-[12.5px] font-medium text-ink transition-colors hover:bg-surface-2"
          >
            Regenerate recovery codes
          </button>
          <button
            type="button"
            onClick={() => {
              resetLocalState();
              setStage("reset");
            }}
            className="rounded-lg border border-alert-line px-3.5 py-2 text-[12.5px] font-medium text-alert transition-colors hover:bg-alert-tint"
          >
            Reset two-factor authentication
          </button>
        </div>
      )}

      {stage === "setup" && setupData && (
        <form onSubmit={handleEnable} className="flex flex-col gap-3">
          <p className="text-[12.5px] text-ink-2">
            Scan this QR code with your authenticator app, or enter the setup
            key manually:
          </p>
          <div className="flex justify-center rounded-lg border border-line-2 bg-white p-4">
            <QRCodeSVG value={setupData.provisioning_uri} size={176} />
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-line-2 bg-surface-2 px-3.5 py-2.5">
            <code className="min-w-0 flex-1 select-all break-all font-mono text-[12.5px] text-ink">
              {setupData.secret}
            </code>
            <button
              type="button"
              onClick={handleCopySecret}
              className="shrink-0 rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface hover:text-ink-2"
              aria-label="Copy setup key"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <p className="text-[11.5px] text-ink-3">
            Issuer: NexAura HMS · Account:{" "}
            <span className="font-mono">
              {(() => {
                const raw = setupData.provisioning_uri.match(/:([^?]+)\?/)?.[1] ?? "";
                try {
                  return decodeURIComponent(raw);
                } catch {
                  return raw;
                }
              })()}
            </span>
          </p>
          <TextField
            label="6-digit code from your authenticator app"
            inputMode="numeric"
            required
            autoFocus
            maxLength={6}
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
            placeholder="123456"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              Enable
            </button>
            <button
              type="button"
              onClick={resetLocalState}
              className="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-2"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {stage === "recovery-shown" && recoveryCodes && (
        <div className="flex flex-col gap-3">
          <Banner tone="success">
            Save these recovery codes now — this is the only time they&apos;ll be shown.
          </Banner>
          <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-line-2 bg-surface-2 p-3.5 font-mono text-[12.5px] text-ink">
            {recoveryCodes.map((code) => (
              <div key={code}>{code}</div>
            ))}
          </div>
          <label className="flex items-start gap-2 text-[12.5px] text-ink-2">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5"
            />
            I&apos;ve saved these recovery codes somewhere safe.
          </label>
          <button
            type="button"
            disabled={!acknowledged}
            onClick={resetLocalState}
            className="self-start rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Done
          </button>
        </div>
      )}

      {(stage === "regenerate" || stage === "reset") && (
        <form
          onSubmit={stage === "regenerate" ? handleRegenerate : handleReset}
          className="flex flex-col gap-3"
        >
          {stage === "reset" && (
            <Banner tone="error">
              This disables two-factor authentication and signs you out of every
              session. You&apos;ll need to set it up again from scratch.
            </Banner>
          )}
          <TextField
            label="Current password"
            type="password"
            required
            maxLength={72}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <div className="flex items-center gap-3 text-[12px] font-medium text-ink-2">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={factorMode === "totp"}
                onChange={() => {
                  setFactorMode("totp");
                  setFactorCode("");
                }}
              />
              Authenticator code
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={factorMode === "recovery"}
                onChange={() => {
                  setFactorMode("recovery");
                  setFactorCode("");
                }}
              />
              Recovery code
            </label>
          </div>
          <TextField
            label={factorMode === "totp" ? "6-digit code" : "Recovery code"}
            required
            maxLength={factorMode === "totp" ? 6 : 32}
            inputMode={factorMode === "totp" ? "numeric" : "text"}
            value={factorCode}
            onChange={(e) => setFactorCode(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 ${
                stage === "reset" ? "bg-alert" : "bg-brand"
              }`}
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {stage === "reset" ? "Reset two-factor authentication" : "Regenerate codes"}
            </button>
            <button
              type="button"
              onClick={resetLocalState}
              className="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-2"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────

function SessionsCard() {
  const { logout, logoutAll } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState<"one" | "all" | null>(null);

  async function handleSignOut() {
    setBusy("one");
    try {
      await logout();
    } finally {
      router.push("/login");
    }
  }

  async function handleSignOutAll() {
    setBusy("all");
    try {
      await logoutAll();
    } finally {
      router.push("/login");
    }
  }

  return (
    <Card
      icon={Monitor}
      title="Sessions"
      description="Sign out of this device, or every device you're currently signed in on."
    >
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSignOut}
          disabled={busy !== null}
          className="flex items-center gap-2 rounded-lg border border-line px-3.5 py-2 text-[12.5px] font-medium text-ink transition-colors hover:bg-surface-2 disabled:opacity-60"
        >
          {busy === "one" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <LogOut size={14} />
          )}
          Sign out
        </button>
        <button
          type="button"
          onClick={handleSignOutAll}
          disabled={busy !== null}
          className="flex items-center gap-2 rounded-lg border border-alert-line px-3.5 py-2 text-[12.5px] font-medium text-alert transition-colors hover:bg-alert-tint disabled:opacity-60"
        >
          {busy === "all" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <LogOut size={14} />
          )}
          Sign out of all sessions
        </button>
      </div>
    </Card>
  );
}
