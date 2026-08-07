"use client";

// Historical consultation view for a patient. This route reloads the real
// consultation workspace and verifies the returned
// consultation belongs to the route patient before rendering read-only details.

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, FileText, FlaskConical, Loader2, Pill, TriangleAlert } from "lucide-react";
import { isApiError } from "@/lib/api";
import {
  getWorkspace,
  type ConsultationWorkspace,
} from "@/lib/api/clinical";
import { formatDateTime } from "@/lib/format";

const SOAP_FIELDS = [
  ["subjective", "Subjective"],
  ["objective", "Objective"],
  ["assessment", "Assessment"],
  ["plan", "Plan"],
] as const;

export default function PatientConsultationPage({
  params,
}: {
  params: Promise<{ patientId: string; consultationId: string }>;
}) {
  const { patientId, consultationId } = use(params);
  const [workspace, setWorkspace] = useState<ConsultationWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getWorkspace(consultationId);
      if (next.consultation.patient_id !== patientId) {
        setError("This consultation does not belong to the selected patient.");
        setWorkspace(null);
        return;
      }
      setWorkspace(next);
    } catch (e) {
      setError(
        isApiError(e)
          ? e.httpStatus === 404
            ? "Consultation not found."
            : e.message
          : "Couldn't load the consultation.",
      );
      setWorkspace(null);
    } finally {
      setLoading(false);
    }
  }, [consultationId, patientId]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-5">
      <Link
        href={`/patients/${patientId}`}
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2 hover:text-ink"
      >
        <ArrowLeft size={15} />
        Back to patient
      </Link>

      {loading ? (
        <Center>
          <Loader2 size={16} className="animate-spin" /> Loading consultation...
        </Center>
      ) : error ? (
        <Center tone="alert">
          <TriangleAlert size={16} /> {error}
        </Center>
      ) : workspace ? (
        <ReadOnlyConsultation workspace={workspace} />
      ) : null}
    </div>
  );
}

function ReadOnlyConsultation({
  workspace,
}: {
  workspace: ConsultationWorkspace;
}) {
  const consultation = workspace.consultation;
  const draft = workspace.latest_draft;
  const prescriptions = workspace.prescriptions ?? [];
  const labOrders = workspace.lab_orders ?? [];
  const approved =
    String(consultation.status).toLowerCase() === "completed" ||
    String(draft?.status ?? "").toLowerCase() === "approved";

  return (
    <>
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-ink">
          Consultation
        </h1>
        <p className="mt-0.5 text-[12.5px] text-ink-2">
          {formatDateTime(consultation.started_at)} ·{" "}
          <span className="capitalize">{consultation.status.replace(/_/g, " ")}</span>
        </p>
      </div>

      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          {approved ? (
            <BadgeCheck size={16} className="text-approved" />
          ) : (
            <FileText size={16} className="text-ink-3" />
          )}
          <div className="text-[13px] font-semibold text-ink">
            {approved ? "Approved SOAP note" : "Latest SOAP draft"}
          </div>
          {draft && (
            <span className="ml-auto rounded bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-ink-3">
              v{draft.version_number} · {draft.status}
            </span>
          )}
        </div>
        {draft ? (
          <div className="grid gap-3 px-4 py-4">
            {SOAP_FIELDS.map(([key, label]) => (
              <div key={key}>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  {label}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-6 text-ink">
                  {draft[key] || "Not recorded."}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-[12.5px] text-ink-2">
            No draft or approved note is available for this consultation yet.
          </div>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            <Pill size={14} /> Prescriptions
          </div>
          {prescriptions.length === 0 ? (
            <Empty>No prescriptions found.</Empty>
          ) : (
            prescriptions.map((p) => (
              <div key={p.prescription_id} className="border-b border-line px-4 py-3 last:border-b-0">
                <div className="text-[12.5px] font-medium text-ink">
                  {p.items?.[0]?.medication_name ?? "Prescription"}
                </div>
                <div className="text-[11.5px] capitalize text-ink-3">{p.status}</div>
              </div>
            ))
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            <FlaskConical size={14} /> Lab orders
          </div>
          {labOrders.length === 0 ? (
            <Empty>No lab orders found.</Empty>
          ) : (
            labOrders.map((o) => (
              <div key={o.lab_order_id} className="border-b border-line px-4 py-3 last:border-b-0">
                <div className="text-[12.5px] font-medium text-ink">
                  {(o.items ?? []).map((item) => item.test_name).join(", ") || "Lab order"}
                </div>
                <div className="text-[11.5px] capitalize text-ink-3">{o.status}</div>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-6 text-center text-[12.5px] text-ink-2">{children}</div>;
}

function Center({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "alert";
}) {
  return (
    <div
      className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-16 text-[13px] ${
        tone === "alert"
          ? "border-alert-line bg-alert-tint text-alert"
          : "border-line bg-surface text-ink-2"
      }`}
    >
      {children}
    </div>
  );
}
