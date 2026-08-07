"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Check, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { ApiError } from "@/lib/api";
import { usePlatformAuth } from "@/context/platform-auth";

export default function PlatformMfaEnrollPage() {
  const router = useRouter();
  const { setupMfa, enableMfa } = usePlatformAuth();
  const [secret, setSecret] = useState<string | null>(null);
  const [provisioningUri, setProvisioningUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setupMfa()
      .then((response) => {
        if (cancelled) return;
        setSecret(response.secret);
        setProvisioningUri(response.provisioning_uri);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Couldn't start MFA setup.");
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setupMfa]);

  async function handleEnable(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const response = await enableMfa({ totp_code: code.trim() });
      setRecoveryCodes(response.recovery_codes);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't enable platform two-factor authentication.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 py-10">
      <section className="w-full max-w-[560px] rounded-2xl border border-line bg-surface p-6">
        <div className="mb-5 flex items-start gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-brand-tint text-brand">
            <ShieldCheck size={18} />
          </span>
          <div>
            <h1 className="text-[20px] font-semibold text-ink">
              Set up platform MFA
            </h1>
            <p className="mt-1 text-[12.5px] text-ink-2">
              Add this platform account to an authenticator app before
              continuing into the Platform Console.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-alert-line bg-alert-tint px-4 py-3 text-[12.5px] text-alert">
            {error}
          </div>
        )}

        {busy && !secret ? (
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-5 text-[13px] text-ink-2">
            <Loader2 size={16} className="animate-spin" />
            Loading MFA setup
          </div>
        ) : recoveryCodes.length > 0 ? (
          <div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {recoveryCodes.map((item) => (
                <code
                  key={item}
                  className="rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-[12px] text-ink"
                >
                  {item}
                </code>
              ))}
            </div>
            <label className="mt-5 flex items-center gap-2 text-[12.5px] text-ink-2">
              <input
                type="checkbox"
                checked={saved}
                onChange={(event) => setSaved(event.target.checked)}
                className="size-4"
              />
              I have securely saved these recovery codes.
            </label>
            <button
              type="button"
              disabled={!saved}
              onClick={() => router.push("/platform")}
              className="mt-4 flex h-10 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-[13px] font-semibold text-white disabled:opacity-60"
            >
              <Check size={16} />
              Continue
            </button>
          </div>
        ) : (
          <form onSubmit={handleEnable} className="space-y-4">
            {provisioningUri && (
              <div className="flex justify-center rounded-xl border border-line bg-white p-4">
                <QRCodeSVG value={provisioningUri} size={176} />
              </div>
            )}
            <div className="rounded-xl border border-line bg-surface-2 p-4">
              <div className="text-[11px] font-medium uppercase tracking-wide text-ink-3">
                Manual setup key
              </div>
              <code className="mt-2 block break-all font-mono text-[13px] text-ink">
                {secret ?? "—"}
              </code>
              <div className="mt-3 text-[11.5px] text-ink-3">
                Scan the QR code above, or enter this key manually if your
                app cannot scan from this screen.
              </div>
            </div>
            <label className="block rounded-xl border border-line bg-surface px-3.5 py-2.5 focus-within:border-brand-line">
              <span className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-ink-3">
                <KeyRound size={13} />
                Authenticator code
              </span>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="w-full bg-transparent text-[14px] text-ink outline-none"
                autoComplete="one-time-code"
                required
              />
            </label>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={busy}
                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-[13px] font-semibold text-white disabled:opacity-60"
              >
                {busy && <Loader2 size={16} className="animate-spin" />}
                Enable MFA
              </button>
              <button
                type="button"
                onClick={() => router.push("/platform")}
                className="text-[12.5px] font-medium text-ink-3 transition-colors hover:text-ink-2"
              >
                Skip for now
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
