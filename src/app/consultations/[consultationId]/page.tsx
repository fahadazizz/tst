"use client";

// /consultations/[consultationId] — the clinical consultation workspace
// (Module 3, doctor's workflow). Driven by GET /workspace. The doctor records
// or types what was discussed (the transcript), the AI generates a 4-field SOAP
// draft (S/O/A/P) plus proposed diagnoses/prescriptions, the doctor edits, then
// approves. AI drafts are additive and never auto-final — approval is required
// (governance). The transcript box here is the interim input; the audio pipeline
// will later produce the transcript automatically.

import { use, useCallback, useEffect, useState } from "react";
import { RecorderPanel } from "@/components/clinical/RecorderPanel";
import { PrescriptionPanel } from "@/components/clinical/PrescriptionPanel";
import { LabOrderPanel } from "@/components/clinical/LabOrderPanel";

import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  TriangleAlert,
  Sparkles,
  Check,
  FileText,
  Mic,
  ReceiptText,
} from "lucide-react";
import { useSession } from "@/context/session";
import { hasPermission } from "@/lib/permissions";
import { isApiError } from "@/lib/api";
import { getFacilityConfiguration } from "@/lib/api/tenant";
import {
  getVisitInvoiceSummary,
  type VisitInvoiceSummary,
} from "@/lib/api/billing";
import {
  getWorkspace,
  generateDraft,
  editDraft,
  approveNote,
  type ConsultationWorkspace,
  type SoapNote,
} from "@/lib/api/clinical";

const SOAP_FIELDS: { key: keyof SoapNote; label: string }[] = [
  { key: "subjective", label: "Subjective" },
  { key: "objective", label: "Objective" },
  { key: "assessment", label: "Assessment" },
  { key: "plan", label: "Plan" },
];

export default function ConsultationWorkspacePage({
  params,
}: {
  params: Promise<{ consultationId: string }>;
}) {
  const { consultationId } = use(params);
  const { activeFacility, scope } = useSession();
  const canApprove = hasPermission(scope, "consultation_note.approve");
  const canReadInvoice = hasPermission(scope, "invoice.read");

  const [ws, setWs] = useState<ConsultationWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getWorkspace(consultationId);
      setWs(next);
      return next;
    } catch (e) {
      setError(
        isApiError(e)
          ? e.code === "PERMISSION_DENIED"
            ? "You don't have permission to view consultations."
            : e.httpStatus === 404
              ? "Consultation not found."
              : e.message
          : "Couldn't load the consultation.",
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, [consultationId]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-5">
      <Link
        href="/consultations"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2 hover:text-ink"
      >
        <ArrowLeft size={15} />
        Back
      </Link>

      {loading ? (
        <Center>
          <Loader2 size={16} className="animate-spin" /> Loading consultation…
        </Center>
      ) : error ? (
        <Center tone="alert">
          <TriangleAlert size={16} /> {error}
        </Center>
      ) : ws ? (
        <Workspace
          ws={ws}
          canApprove={canApprove}
          canReadInvoice={canReadInvoice}
          activeFacilityId={activeFacility.facility_id}
          reload={load}
        />
      ) : null}
    </div>
  );
}

function Workspace({
  ws,
  canApprove,
  canReadInvoice,
  activeFacilityId,
  reload,
}: {
  ws: ConsultationWorkspace;
  canApprove: boolean;
  canReadInvoice: boolean;
  activeFacilityId: string;
  reload: () => Promise<ConsultationWorkspace | null>;
}) {
  const consultation = ws.consultation as Record<string, unknown> | null;
  const draft = ws.latest_draft as Record<string, unknown> | null;
  const prescriptions = (ws.prescriptions ?? []) as Record<string, unknown>[];
  const labOrders = (ws.lab_orders ?? []) as Record<string, unknown>[];

  const consultationId = String(consultation?.consultation_id ?? "");
  const draftId = draft ? String(draft.draft_id) : null;
  const draftStatus = draft ? String(draft.status) : null;
  const status = String(consultation?.status ?? "unknown");
  const isApproved = draftStatus === "approved" || status === "completed";

  const [transcript, setTranscript] = useState("");
  const [soap, setSoap] = useState<SoapNote>({
    subjective: (draft?.subjective as string) ?? "",
    objective: (draft?.objective as string) ?? "",
    assessment: (draft?.assessment as string) ?? "",
    plan: (draft?.plan as string) ?? "",
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "err" } | null>(
    null,
  );

  async function handleGenerate() {
    if (!transcript.trim()) {
      setMsg({ text: "Enter the consultation notes first, then generate.", tone: "err" });
      return;
    }
    setBusy("generate");
    setMsg({ text: "Generating with AI… this can take up to 30 seconds.", tone: "ok" });
    try {
      const d = await generateDraft(consultationId, {
        transcript_text: transcript.trim(),
      });
      setSoap({
        subjective: d.subjective ?? "",
        objective: d.objective ?? "",
        assessment: d.assessment ?? "",
        plan: d.plan ?? "",
      });
      setMsg({ text: "Draft generated. Review and edit before approving.", tone: "ok" });
      reload();
    } catch (e) {
      // The AI call can transiently 500 on a cold start — surface a retry hint.
      setMsg({
        text: isApiError(e)
          ? e.httpStatus >= 500
            ? "The AI service didn't respond (it may be waking up). Try generating again."
            : e.message
          : "Couldn't generate the draft.",
        tone: "err",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleSave() {
    if (!draftId) {
      setMsg({ text: "Generate a draft first.", tone: "err" });
      return;
    }
    setBusy("save");
    setMsg(null);
    try {
      await editDraft(consultationId, draftId, soap);
      setMsg({ text: "Saved.", tone: "ok" });
      await reload();
    } catch (e) {
      setMsg({ text: isApiError(e) ? e.message : "Couldn't save the note.", tone: "err" });
    } finally {
      setBusy(null);
    }
  }

  async function handleApprove() {
    if (!draftId) return;
    const version = Number(draft?.version_number ?? 1);
    setBusy("approve");
    setMsg(null);
    try {
      const approval = await approveNote(consultationId, draftId, version);
      const verified = await reload();
      const verifiedConsultation = verified?.consultation as
        | Record<string, unknown>
        | undefined;
      const verifiedDraft = verified?.latest_draft as
        | Record<string, unknown>
        | undefined;
      const complete =
        approval.status === "completed" &&
        String(verifiedConsultation?.status ?? "") === "completed" &&
        String(verifiedDraft?.status ?? "") === "approved";
      if (!complete) {
        setMsg({
          text: "Approval returned, but the completed record is not confirmed yet. Refresh and verify before continuing.",
          tone: "err",
        });
        return;
      }
      const artifacts = [
        approval.note_id ? "final note" : null,
        approval.prescription_id ? "prescription" : null,
        approval.lab_order_ids?.length ? "lab order" : null,
        approval.follow_up_task_id ? "follow-up" : null,
      ].filter(Boolean);
      setMsg({
        text: `Note approved and backend completion verified${
          artifacts.length ? ` (${artifacts.join(", ")})` : ""
        }.`,
        tone: "ok",
      });
    } catch (e) {
      const message =
        isApiError(e) &&
        (e.code === "CLINICAL_APPROVAL_PAYLOAD_INVALID" ||
          e.code === "CLINICAL_APPROVAL_CASCADE_FAILED")
          ? `${e.message} Review the generated diagnoses, prescription, lab, or follow-up details and save a corrected draft.`
          : isApiError(e)
            ? e.message
            : "Couldn't approve the note.";
      setMsg({ text: message, tone: "err" });
      if (isApiError(e) && e.httpStatus === 422) {
        await reload();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">
            Consultation
          </h1>
          <p className="mt-0.5 text-[12.5px] text-ink-2">
            Status:{" "}
            <span className="font-medium capitalize text-ink">
              {status.replace(/_/g, " ")}
            </span>
          </p>
        </div>
      </div>

      {msg && (
        <div
          className={`rounded-lg border px-3.5 py-2 text-[12.5px] ${
            msg.tone === "err"
              ? "border-alert-line bg-alert-tint text-alert"
              : "border-brand-line bg-brand-tint text-brand"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Transcript / notes input → AI generation. Hidden once approved. */}
      {!isApproved && (
        <div className="rounded-xl border border-line bg-surface p-5">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            <Mic size={14} /> Consultation notes
          </div>
          <div className="mb-3">
            <RecorderPanel
              consultationId={consultationId}
              onTranscript={(text) =>
                setTranscript((prev) => (prev ? prev + "\n" + text : text))
              }
            />
          </div>
          <p className="mb-2 text-[12px] text-ink-2">
            Or type/paste what was discussed. The AI will draft a SOAP note from
            it.
          </p>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
            placeholder="e.g. Patient reports dry cough for 5 days, no fever. Chest clear on exam…"
          />
          <div className="mt-3 flex justify-end">
            <button
              onClick={handleGenerate}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {busy === "generate" ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Sparkles size={15} />
              )}
              Generate SOAP draft
            </button>
          </div>
        </div>
      )}

      {/* SOAP note */}
      <div className="rounded-xl border border-line bg-surface p-5">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          <FileText size={14} /> SOAP note
          {draft && (
            <span className="ml-auto flex items-center gap-2 font-normal normal-case text-ink-3">
              v{String(draft.version_number ?? 1)}
              {draft.model_name ? <>· AI: {String(draft.model_name)}</> : null}
              {isApproved && (
                <span className="rounded bg-[#e6f4ea] px-1.5 py-0.5 text-[10.5px] font-medium text-approved">
                  Approved
                </span>
              )}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-3">
          {SOAP_FIELDS.map(({ key, label }) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-ink-2">{label}</span>
              <textarea
                value={(soap[key] as string) ?? ""}
                onChange={(e) => setSoap((s) => ({ ...s, [key]: e.target.value }))}
                rows={2}
                readOnly={isApproved}
                className={`rounded-lg border px-3 py-2 text-[13px] text-ink outline-none focus:border-brand ${
                  isApproved ? "border-line bg-surface-2" : "border-line-2 bg-surface"
                }`}
                placeholder={`${label}…`}
              />
            </label>
          ))}
        </div>
        {!isApproved && (
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              onClick={handleSave}
              disabled={busy !== null || !draftId}
              className="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-60"
            >
              {busy === "save" ? "Saving…" : "Save note"}
            </button>
            {canApprove && (
              <button
                onClick={handleApprove}
                disabled={busy !== null || !draftId}
                className="inline-flex items-center gap-2 rounded-lg bg-approved px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {busy === "approve" ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Check size={15} />
                )}
                Approve note
              </button>
            )}
          </div>
        )}
      </div>

     {/* Prescriptions */}
      <PrescriptionPanel
        consultationId={consultationId}
        prescriptions={prescriptions}
        reload={reload}
      />

      {/* Lab orders */}
      <LabOrderPanel
        consultationId={consultationId}
        draft={draft}
        labOrders={labOrders}
        reload={reload}
        disabled={isApproved}
      />

      {isApproved && (
        <PostConsultationBilling
          activeFacilityId={activeFacilityId}
          visitId={String(consultation?.visit_id ?? "")}
          canReadInvoice={canReadInvoice}
        />
      )}
    </div>
  );
}

function PostConsultationBilling({
  activeFacilityId,
  visitId,
  canReadInvoice,
}: {
  activeFacilityId: string;
  visitId: string;
  canReadInvoice: boolean;
}) {
  const [summary, setSummary] = useState<VisitInvoiceSummary | null>(null);
  const [timing, setTiming] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!visitId || !canReadInvoice) return;
      setLoading(true);
      try {
        const config = await getFacilityConfiguration(activeFacilityId);
        const collectionTiming = String(
          config.payment_collection_timing ?? "prepaid",
        );
        if (cancelled) return;
        setTiming(collectionTiming);
        if (collectionTiming !== "prepaid") {
          setSummary(await getVisitInvoiceSummary(visitId));
        }
      } catch {
        if (!cancelled) {
          setTiming(null);
          setSummary(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    queueMicrotask(load);
    return () => {
      cancelled = true;
    };
  }, [activeFacilityId, canReadInvoice, visitId]);

  if (!canReadInvoice || timing === "prepaid") return null;

  return (
    <Section icon={ReceiptText} title="Post-consultation billing">
      <div className="px-4 py-4 text-[12.5px] text-ink-2">
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 size={13} className="animate-spin" /> Loading invoice…
          </span>
        ) : summary ? (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-ink-3">
                  Timing
                </div>
                <div className="font-medium capitalize text-ink">
                  {String(timing).replace(/_/g, " ")}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-ink-3">
                  Status
                </div>
                <div className="font-medium capitalize text-ink">
                  {String(summary.invoice_status ?? "pending").replace(/_/g, " ")}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-ink-3">
                  Outstanding
                </div>
                <div className="font-medium text-ink">
                  {String(summary.currency ?? "PKR")}{" "}
                  {Number(summary.outstanding_amount ?? 0).toLocaleString()}
                </div>
              </div>
            </div>
            {summary.billing_status === "pricing_required" && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-draft-line bg-draft-tint px-3 py-2.5">
                <div className="text-[12px] text-draft">
                  No fee schedule was found for this visit — an invoice
                  couldn&apos;t be created automatically.
                </div>
                <Link
                  href={`/billing?visitId=${visitId}`}
                  className="shrink-0 whitespace-nowrap rounded-lg bg-draft px-3 py-1.5 text-[11.5px] font-medium text-white hover:opacity-90"
                >
                  Resolve now
                </Link>
              </div>
            )}
          </>
        ) : (
          "Invoice summary is not available for this completed visit yet."
        )}
      </div>
    </Section>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        <Icon size={14} /> {title}
      </div>
      {children}
    </div>
  );
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
