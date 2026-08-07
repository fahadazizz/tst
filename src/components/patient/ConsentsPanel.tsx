"use client";

// ConsentsPanel.tsx
// Self-fetching: lists the patient's real consent decisions and lets an
// authorized user record a new one or revoke an active one. Wired to
// POST/GET /patient-mpi/insurance-consent/... — revoke calls the real
// /consents/{id}/revoke endpoint (no local mutation, no mock data).

import { useCallback, useEffect, useState } from "react";
import { Plus, ShieldCheck, ShieldX, X } from "lucide-react";
import {
  listConsents,
  recordConsent,
  revokeConsent,
  type Consent,
} from "@/lib/api/insurance-consent";
import { RoleGate } from "@/components/design-system/RoleGate";
import { useSession } from "@/context/session";
import { isApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";

const CONSENT_TYPES = ["treatment", "data_sharing", "marketing", "research"] as const;

const CONSENT_LABEL: Record<string, string> = {
  treatment: "Treatment",
  data_sharing: "Data sharing",
  marketing: "Marketing",
  research: "Research",
};

function label(type: string): string {
  return CONSENT_LABEL[type] ?? type;
}

export function ConsentsPanel({ patientId }: { patientId: string }) {
  const { scope } = useSession();
  const [items, setItems] = useState<Consent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listConsents(patientId));
    } catch (err) {
      setError(isApiError(err) ? err.message : "Couldn't load consents.");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  async function revoke(consentId: string) {
    setError(null);
    try {
      const updated = await revokeConsent(consentId);
      setItems((prev) =>
        prev.map((c) => (c.consent_id === updated.consent_id ? updated : c)),
      );
    } catch (err) {
      setError(isApiError(err) ? err.message : "Couldn't revoke consent.");
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-4.5 py-3.5">
        <h2 className="text-sm font-semibold text-ink">Consents</h2>
        <RoleGate scope={scope} permission="consent.write">
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-line-2 bg-surface px-2.5 py-1.5 text-[11.5px] font-medium text-ink-2 hover:bg-surface-2"
          >
            <Plus size={13} /> Record consent
          </button>
        </RoleGate>
      </div>

      {error && (
        <div className="border-b border-alert-line bg-alert-tint px-4.5 py-2 text-[12px] text-alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="px-4.5 py-6 text-center text-[12.5px] text-ink-2">Loading…</div>
      ) : items.length === 0 ? (
        <div className="grid place-items-center px-6 py-10 text-center text-[13px] text-ink-2">
          No consents recorded for this patient.
        </div>
      ) : (
        <ul>
          {items.map((c) => {
            const revoked = !!c.revoked_at;
            const active = c.granted && !revoked;

            return (
              <li
                key={c.consent_id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-line px-4.5 py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink">
                    {label(c.consent_type)}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-ink-3">
                    {revoked ? (
                      <span className="text-alert">
                        Revoked on {formatDate(c.revoked_at as string)}
                      </span>
                    ) : c.granted ? (
                      <>Granted on {formatDate(c.granted_at)}</>
                    ) : (
                      "Not granted"
                    )}
                  </div>
                </div>

                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold ${
                    active
                      ? "border-approved-line bg-approved-tint text-approved"
                      : "border-line-2 bg-surface-2 text-ink-3"
                  }`}
                >
                  {active ? <ShieldCheck size={12} /> : <ShieldX size={12} />}
                  {active ? "Active" : revoked ? "Revoked" : "Inactive"}
                </span>

                {active && (
                  <RoleGate scope={scope} permission="consent.revoke">
                    <button
                      type="button"
                      onClick={() => revoke(c.consent_id)}
                      className="shrink-0 rounded-lg border border-line-2 bg-surface px-3 py-1.5 text-[12px] font-medium text-alert transition-colors hover:border-alert-line hover:bg-alert-tint"
                    >
                      Revoke
                    </button>
                  </RoleGate>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {formOpen && (
        <RecordConsentForm
          patientId={patientId}
          onClose={() => setFormOpen(false)}
          onRecorded={() => {
            setFormOpen(false);
            load();
          }}
        />
      )}
    </section>
  );
}

function RecordConsentForm({
  patientId,
  onClose,
  onRecorded,
}: {
  patientId: string;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const [consentType, setConsentType] = useState<(typeof CONSENT_TYPES)[number]>("treatment");
  const [scopeText, setScopeText] = useState("");
  const [method, setMethod] = useState<"verbal" | "written" | "digital_signature">("verbal");
  const [sharingTarget, setSharingTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsSharingTarget = consentType === "data_sharing";
  const canSave = !needsSharingTarget || sharingTarget.trim();

  async function submit() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await recordConsent(patientId, {
        consent_type: consentType,
        granted: true,
        consent_method: method,
        ...(scopeText.trim() ? { scope: scopeText.trim() } : {}),
        ...(needsSharingTarget
          ? { sharing_target_organisation_id: sharingTarget.trim() }
          : {}),
      });
      onRecorded();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Couldn't record consent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/30 px-4">
      <div className="w-full max-w-sm overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
        <div className="flex items-center gap-2 border-b border-line px-4.5 py-3.5">
          <h2 className="text-sm font-semibold text-ink">Record consent</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto grid size-7 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-4.5 py-4">
          {error && (
            <div className="rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[12px] text-alert">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">
              Consent type
            </label>
            <select
              value={consentType}
              onChange={(e) => setConsentType(e.target.value as typeof consentType)}
              className="w-full rounded-lg border border-line-2 bg-surface px-2.5 py-2 text-[13px] text-ink focus:border-brand focus:outline-none"
            >
              {CONSENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {label(t)}
                </option>
              ))}
            </select>
          </div>

          {needsSharingTarget && (
            <div>
              <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">
                Sharing target organisation ID <span className="text-alert">*</span>
              </label>
              <input
                value={sharingTarget}
                onChange={(e) => setSharingTarget(e.target.value)}
                placeholder="Required for data-sharing consent"
                className="w-full rounded-lg border border-line-2 bg-surface px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">
              How was it obtained
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
              className="w-full rounded-lg border border-line-2 bg-surface px-2.5 py-2 text-[13px] text-ink focus:border-brand focus:outline-none"
            >
              <option value="verbal">Verbal</option>
              <option value="written">Written</option>
              <option value="digital_signature">Digital signature</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">
              Scope (optional)
            </label>
            <input
              value={scopeText}
              onChange={(e) => setScopeText(e.target.value)}
              placeholder="e.g. Limited to cardiology records"
              className="w-full rounded-lg border border-line-2 bg-surface px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-2.5 border-t border-line px-4.5 py-3">
          <button
            type="button"
            onClick={submit}
            disabled={!canSave || busy}
            className="rounded-lg border border-brand bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line-2 bg-surface px-3.5 py-2 text-[12.5px] font-medium text-ink-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
