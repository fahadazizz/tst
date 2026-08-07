"use client";

// PasswordResetConfirmForm.tsx
// Shared by both frontend callback routes spec §7.11 requires — password
// reset (/auth/password-reset) and first-owner account setup
// (/auth/account-setup). Both receive organisation_id + reset_token as query
// parameters (never typed by the user) and both call the same
// POST /auth/password/reset/confirm; only the copy differs between the two
// pages, so the mechanics live here once.

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, Loader2, ShieldAlert, CheckCircle2 } from "lucide-react";
import { apiPost, ApiError } from "@/lib/api";

interface Props {
  title: string;
  description: string;
  successMessage: string;
}

export function PasswordResetConfirmForm({ title, description, successMessage }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const organisationId = searchParams.get("organisation_id");
  const resetToken = searchParams.get("reset_token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Spec §7.11: if either query parameter is missing, show a real
  // invalid/expired-link state — never a raw crash or a form asking the
  // user to supply what should have come from the link itself.
  if (!organisationId || !resetToken) {
    return (
      <div className="w-full max-w-[400px] text-center">
        <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-alert-tint text-alert">
          <ShieldAlert size={22} />
        </span>
        <h1 className="text-[20px] font-semibold tracking-tight text-ink">
          This link is invalid or has expired
        </h1>
        <p className="mt-2 text-[13px] text-ink-2">
          Request a new link from the sign-in page and try again.
        </p>
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="mt-6 rounded-lg border border-line bg-surface px-4 py-2.5 text-[13.5px] font-medium text-ink transition-colors hover:bg-surface-2"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Only the backend's real policy (8–72 characters) is enforced here —
    // no invented uppercase/digit/symbol rules (spec §7.11).
    if (password.length < 8 || password.length > 72) {
      setError("Password must be 8–72 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await apiPost(
        "/foundation/auth/password/reset/confirm",
        {
          organisation_id: organisationId,
          reset_token: resetToken,
          new_password: password,
        },
        { skipAuth: true, skipFacility: true },
      );
      router.push(`/login?resetSuccess=${encodeURIComponent(successMessage)}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.httpStatus === 400) {
          setError("This link is invalid or has expired. Request a new one from the sign-in page.");
        } else if (err.httpStatus === 409) {
          setError("This link has already been used. Request a new one from the sign-in page.");
        } else if (err.httpStatus === 422) {
          setError(err.message || "Your new password must be different from your current one.");
        } else if (err.httpStatus === 429) {
          setError("Too many attempts. Please wait a minute and try again.");
        } else {
          setError(err.message || "Something went wrong. Please try again.");
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-[400px]">
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-brand text-white">
          <KeyRound size={22} />
        </span>
        <h1 className="text-[20px] font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-1.5 text-[13px] text-ink-2">{description}</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-alert-line bg-alert-tint px-3.5 py-2.5 text-[12.5px] text-alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-2">New password</span>
          <div className="flex items-center gap-2.5 rounded-lg border border-line-2 bg-surface px-3.5 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-tint">
            <KeyRound size={15} className="shrink-0 text-ink-3" />
            <input
              type="password"
              required
              autoFocus
              minLength={8}
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8–72 characters"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-[13.5px] text-ink outline-none placeholder:text-ink-3"
            />
          </div>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-2">Confirm new password</span>
          <div className="flex items-center gap-2.5 rounded-lg border border-line-2 bg-surface px-3.5 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-tint">
            <CheckCircle2 size={15} className="shrink-0 text-ink-3" />
            <input
              type="password"
              required
              minLength={8}
              maxLength={72}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your new password"
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
          Set password
        </button>
      </form>
    </div>
  );
}
