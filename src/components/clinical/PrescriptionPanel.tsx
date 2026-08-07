"use client";

// PrescriptionPanel — create and manage prescriptions on a consultation.
// A doctor adds one or more medication items → creates a draft → can approve it.
// The AI-proposed prescriptions (from the SOAP draft) already appear on
// approval; this lets the doctor add/adjust prescriptions explicitly.

import { useState } from "react";
import { Pill, Plus, Loader2, TriangleAlert, X, Check, Send, Ban } from "lucide-react";
import {
  createPrescriptionDraft,
  approvePrescription,
  issuePrescription,
  cancelPrescription,
  type PrescriptionItem,
} from "@/lib/api/clinical";
import { isApiError } from "@/lib/api";
import { RoleGate } from "@/components/design-system/RoleGate";
import { useSession } from "@/context/session";

const CANCELLABLE_STATUSES = new Set(["draft", "pending", "approved", "issued", "active"]);

export function PrescriptionPanel({
  consultationId,
  prescriptions,
  reload,
}: {
  consultationId: string;
  prescriptions: Record<string, unknown>[];
  reload: () => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          <Pill size={14} /> Prescriptions ({prescriptions.length})
        </div>
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[11.5px] font-medium text-ink-2 hover:bg-surface-2"
        >
          <Plus size={13} /> Add
        </button>
      </div>

      {prescriptions.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12.5px] text-ink-2">
          No prescriptions on this consultation.
        </div>
      ) : (
        prescriptions.map((p, i) => (
          <PrescriptionRow
            key={String(p.prescription_id ?? i)}
            p={p}
            reload={reload}
            hasApproved={prescriptions.some(
              (x) =>
                String(x.status) === "approved" || String(x.status) === "issued",
            )}
          />
        ))
      )}

      {adding && (
        <AddPrescriptionModal
          consultationId={consultationId}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function PrescriptionRow({
  p,
  reload,
  hasApproved,
}: {
  p: Record<string, unknown>;
  reload: () => void;
  hasApproved: boolean;
}) {
  const { scope } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const id = String(p.prescription_id ?? "");
  const status = String(p.status ?? "");
  const version = Number(p.version_number ?? p.version ?? 1);
  const items = (p.items as Record<string, unknown>[]) ?? [];
  const label =
    items.length > 0
      ? items
          .map((it) => String(it.medication_name ?? it.generic_name ?? "med"))
          .join(", ")
      : String(p.medication_name ?? "Prescription");

  const isDraft = status === "draft" || status === "pending";
  // Only offer approve if this row is a draft AND no other prescription on the
  // consultation is already approved (backend allows one approved per consult).
  const canApprove = isDraft && !hasApproved;
  const canIssue = status === "approved";
  const canCancel = CANCELLABLE_STATUSES.has(status);

  async function handleApprove() {
    setBusy(true);
    setError(null);
    try {
      await approvePrescription(id, version);
      reload();
    } catch (e) {
      setError(
        isApiError(e)
          ? e.code === "CONFLICT_STATE_MISMATCH"
            ? "This consultation already has an approved prescription."
            : e.message
          : "Couldn't approve the prescription.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleIssue() {
    setBusy(true);
    setError(null);
    try {
      await issuePrescription(id, version);
      reload();
    } catch (e) {
      setError(isApiError(e) ? e.message : "Couldn't issue the prescription.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!cancelReason.trim()) {
      setError("A cancellation reason is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await cancelPrescription(id, cancelReason.trim());
      setCancelling(false);
      reload();
    } catch (e) {
      setError(isApiError(e) ? e.message : "Couldn't cancel the prescription.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-line px-4 py-2.5 last:border-b-0">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] text-ink">{label}</div>
        </div>
        <span
          className={`rounded px-1.5 py-0.5 text-[10.5px] font-medium capitalize ${
            status === "approved" || status === "issued"
              ? "bg-[#e6f4ea] text-approved"
              : status === "cancelled"
                ? "bg-alert-tint text-alert"
                : "bg-[#fdf6ec] text-draft"
          }`}
        >
          {status.replace(/_/g, " ")}
        </span>
        {canApprove && (
          <RoleGate scope={scope} permission="prescription.approve">
            <button
              onClick={handleApprove}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[11.5px] font-medium text-approved hover:bg-[#e6f4ea] disabled:opacity-60"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Approve
            </button>
          </RoleGate>
        )}
        {canIssue && (
          <RoleGate scope={scope} permission="prescription.issue">
            <button
              onClick={handleIssue}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[11.5px] font-medium text-brand hover:bg-brand-tint disabled:opacity-60"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Issue
            </button>
          </RoleGate>
        )}
        {canCancel && !cancelling && (
          <RoleGate scope={scope} permission="prescription.cancel">
            <button
              onClick={() => setCancelling(true)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[11.5px] font-medium text-alert hover:bg-alert-tint disabled:opacity-60"
            >
              <Ban size={12} />
              Cancel
            </button>
          </RoleGate>
        )}
        {isDraft && hasApproved && (
          <span className="text-[11px] text-ink-3">approved one exists</span>
        )}
      </div>
      {cancelling && (
        <div className="mt-2 flex items-center gap-2">
          <input
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason for cancellation"
            className="flex-1 rounded-md border border-line-2 bg-surface px-2.5 py-1.5 text-[12px] text-ink outline-none focus:border-brand"
          />
          <button
            onClick={handleCancel}
            disabled={busy}
            className="rounded-md border border-alert-line bg-alert-tint px-2.5 py-1.5 text-[11.5px] font-medium text-alert disabled:opacity-60"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : "Confirm"}
          </button>
          <button
            onClick={() => {
              setCancelling(false);
              setCancelReason("");
              setError(null);
            }}
            className="rounded-md border border-line-2 bg-surface px-2.5 py-1.5 text-[11.5px] font-medium text-ink-2"
          >
            Cancel
          </button>
        </div>
      )}
      {error && (
        <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-alert">
          <TriangleAlert size={12} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

const EMPTY_ITEM: PrescriptionItem = {
  medication_name: "",
  dose: "",
  frequency: "",
  route: "",
  duration_value: null,
  duration_unit: "days",
  patient_instructions: "",
};

function AddPrescriptionModal({
  consultationId,
  onClose,
  onDone,
}: {
  consultationId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [item, setItem] = useState<PrescriptionItem>({ ...EMPTY_ITEM });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof PrescriptionItem>(k: K, v: PrescriptionItem[K]) =>
    setItem((it) => ({ ...it, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!item.medication_name.trim() || !item.dose.trim() || !item.frequency.trim()) {
      setError("Medication, dose, and frequency are required.");
      return;
    }
    // Trim optional empties to null.
    const clean: PrescriptionItem = {
      medication_name: item.medication_name.trim(),
      dose: item.dose.trim(),
      frequency: item.frequency.trim(),
      ...(item.route?.trim() && { route: item.route.trim() }),
      ...(item.duration_value ? { duration_value: Number(item.duration_value) } : {}),
      ...(item.duration_unit?.trim() && { duration_unit: item.duration_unit.trim() }),
      ...(item.patient_instructions?.trim() && {
        patient_instructions: item.patient_instructions.trim(),
      }),
    };
    setBusy(true);
    try {
      await createPrescriptionDraft(consultationId, [clean]);
      onDone();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Couldn't create the prescription.");
    } finally {
      setBusy(false);
    }
  }

  const cls =
    "w-full rounded-lg border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-brand";

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/30 px-4">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">Add prescription</h2>
          <button onClick={onClose} className="text-ink-3 hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[12px] text-alert">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          <L label="Medication" req>
            <input value={item.medication_name} onChange={(e) => set("medication_name", e.target.value)} className={cls} placeholder="e.g. Amoxicillin" />
          </L>
          <div className="grid grid-cols-2 gap-3">
            <L label="Dose" req>
              <input value={item.dose} onChange={(e) => set("dose", e.target.value)} className={cls} placeholder="500 mg" />
            </L>
            <L label="Frequency" req>
              <input value={item.frequency} onChange={(e) => set("frequency", e.target.value)} className={cls} placeholder="3x daily" />
            </L>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <L label="Route">
              <input value={item.route ?? ""} onChange={(e) => set("route", e.target.value)} className={cls} placeholder="oral" />
            </L>
            <L label="Duration">
              <input type="number" min={1} value={item.duration_value ?? ""} onChange={(e) => set("duration_value", e.target.value ? Number(e.target.value) : null)} className={cls} placeholder="7" />
            </L>
            <L label="Unit">
              <input value={item.duration_unit ?? ""} onChange={(e) => set("duration_unit", e.target.value)} className={cls} placeholder="days" />
            </L>
          </div>
          <L label="Patient instructions">
            <input value={item.patient_instructions ?? ""} onChange={(e) => set("patient_instructions", e.target.value)} className={cls} placeholder="Take after meals" />
          </L>
          <button type="submit" disabled={busy} className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-60">
            {busy && <Loader2 size={15} className="animate-spin" />}
            Add prescription
          </button>
        </form>
      </div>
    </div>
  );
}

function L({ label, req, children }: { label: string; req?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] font-medium text-ink-2">
        {label}
        {req && <span className="text-alert"> *</span>}
      </span>
      {children}
    </label>
  );
}