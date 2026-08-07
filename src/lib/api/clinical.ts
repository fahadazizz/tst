// lib/api/clinical.ts
// Typed calls for the Clinical AI module (Module 3). Thin wrappers over the
// shared client (auth + X-Facility-ID + envelope). These are the DOCTOR's
// workflow — the clinical permissions belong to the doctor role.
//
// NOTE: verified against the OpenAPI spec, but end-to-end untested until a real
// visit_id exists (created by a same-day check-in during clinic hours).

import { apiGet, apiPost, getAuthToken, getActiveFacilityId } from "@/lib/api";
import type { components } from "@/types/api";

export type ConsultationWorkspace =
  components["schemas"]["ConsultationWorkspaceResponse"];
export type Consultation = components["schemas"]["ConsultationResponse"];
export type ConsultationDraft =
  components["schemas"]["ConsultationDraftResponse"];
export type Transcript = components["schemas"]["TranscriptResponse"];
export type STTJob = components["schemas"]["STTJobResponse"];
export type RecordingSegment =
  components["schemas"]["RecordingSegmentStatusResponse"];
export type ConsultationApprove =
  components["schemas"]["ConsultationApproveResponse"];
export type Prescription = components["schemas"]["PrescriptionResponse"];
export type LabOrder = components["schemas"]["LabOrderResponse"];
export type LabResult = components["schemas"]["LabResultResponse"];
export type LabResultCreate = components["schemas"]["LabResultCreateRequest"];

/** The 4-field SOAP note shape used when editing a draft. */
export interface SoapNote {
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
}

/** POST /clinical-ai/consultations — open a consultation for a visit. */
export function createConsultation(visitId: string): Promise<Consultation> {
  return apiPost<Consultation>("/clinical-ai/consultations", {
    visit_id: visitId,
  });
}

/** Creates a consultation for a visit and returns the route to open it.
 *  Shared by /consultations' openConsultation() and /queue's "Start
 *  service" action so a doctor reaches the same destination from either
 *  entry point, instead of /queue leaving them stranded after a click that
 *  only updates queue status with no navigation. */
export async function openConsultationRoute(visitId: string): Promise<string> {
  const consult = await createConsultation(visitId);
  return `/consultations/${consult.consultation_id}`;
}

/** GET /clinical-ai/consultations/{id} */
export function getConsultation(consultationId: string): Promise<Consultation> {
  return apiGet<Consultation>(`/clinical-ai/consultations/${consultationId}`);
}

/** GET /clinical-ai/consultations/{id}/workspace — the whole consultation state. */
export function getWorkspace(
  consultationId: string,
): Promise<ConsultationWorkspace> {
  return apiGet<ConsultationWorkspace>(
    `/clinical-ai/consultations/${consultationId}/workspace`,
  );
}

/** POST /clinical-ai/consultations/{id}/drafts — generate a SOAP draft. */
export function generateDraft(
  consultationId: string,
  opts: { transcript_id?: string; transcript_text?: string } = {},
): Promise<ConsultationDraft> {
  return apiPost<ConsultationDraft>(
    `/clinical-ai/consultations/${consultationId}/drafts`,
    { consultation_id: consultationId, ...opts },
  );
}

export type ProposedDiagnosis = components["schemas"]["ProposedDiagnosis"];
export type ProposedPrescriptionItem =
  components["schemas"]["ProposedPrescriptionItem"];
export type ProposedLabOrder = components["schemas"]["ProposedLabOrder"];
export type ProposedFollowUp = components["schemas"]["ProposedFollowUp"];

/** POST /clinical-ai/consultations/{id}/drafts/edit — doctor edits the SOAP.
 *  The backend merges: any of `proposed_diagnoses`/`proposed_prescription`/
 *  `proposed_lab_orders`/`proposed_follow_up` left out here is carried
 *  forward unchanged from `sourceDraftId`, not wiped — only pass the ones
 *  this call is actually changing. */
export function editDraft(
  consultationId: string,
  sourceDraftId: string,
  soapNote: SoapNote,
  extra: {
    proposed_diagnoses?: ProposedDiagnosis[];
    proposed_prescription?: ProposedPrescriptionItem[];
    proposed_lab_orders?: ProposedLabOrder[];
    proposed_follow_up?: ProposedFollowUp;
  } = {},
): Promise<ConsultationDraft> {
  return apiPost<ConsultationDraft>(
    `/clinical-ai/consultations/${consultationId}/drafts/edit`,
    { source_draft_id: sourceDraftId, soap_note: soapNote, ...extra },
  );
}

/** POST /clinical-ai/consultations/{id}/drafts/regenerate-section */
export function regenerateSection(
  consultationId: string,
  section: "subjective" | "objective" | "assessment" | "plan",
  sourceDraftId: string,
): Promise<ConsultationDraft> {
  return apiPost<ConsultationDraft>(
    `/clinical-ai/consultations/${consultationId}/drafts/regenerate-section`,
    { source_draft_id: sourceDraftId, section },
  );
}

/** POST /clinical-ai/consultations/{id}/approve — doctor approves the SOAP draft.
 *  expected_version guards against approving a stale draft (optimistic lock).
 *  medication_safety_acknowledged confirms the doctor reviewed drug safety. */
export function approveNote(
  consultationId: string,
  draftId: string,
  expectedVersion: number,
): Promise<ConsultationApprove> {
  return apiPost<ConsultationApprove>(
    `/clinical-ai/consultations/${consultationId}/approve`,
    {
      draft_id: draftId,
      expected_version: expectedVersion,
      medication_safety_acknowledged: true,
    },
  );
}
/** GET /clinical-ai/consultations/{id}/prescriptions */
export function getPrescriptions(
  consultationId: string,
): Promise<Prescription[]> {
  return apiGet<Prescription[]>(
    `/clinical-ai/consultations/${consultationId}/prescriptions`,
  );
}

/** GET /clinical-ai/consultations/{id}/lab-orders */
export function getLabOrders(consultationId: string): Promise<LabOrder[]> {
  return apiGet<LabOrder[]>(
    `/clinical-ai/consultations/${consultationId}/lab-orders`,
  );
}

// ─── Laboratory worklist / result lifecycle ───────────────────────────

export interface LabOrderFilters
  extends Record<string, string | number | boolean | null | undefined> {
  status?: string | null;
  date?: string | null;
  patient_id?: string | null;
  doctor_id?: string | null;
  page?: number;
  page_size?: number;
}

export interface LabResultFilters
  extends Record<string, string | number | boolean | null | undefined> {
  review_status?: string | null;
  patient_id?: string | null;
  page?: number;
  page_size?: number;
}

/** GET /clinical-ai/lab-orders — facility lab worklist; bare array response. */
export function listLabOrders(
  filters: LabOrderFilters = {},
): Promise<LabOrder[]> {
  return apiGet<LabOrder[]>("/clinical-ai/lab-orders", { params: filters });
}

/** GET /clinical-ai/lab-orders/{id} */
export function getLabOrder(labOrderId: string): Promise<LabOrder> {
  return apiGet<LabOrder>(`/clinical-ai/lab-orders/${labOrderId}`);
}

/** GET /clinical-ai/lab-results — facility lab-results worklist. */
export function listLabResults(
  filters: LabResultFilters = {},
): Promise<LabResult[]> {
  return apiGet<LabResult[]>("/clinical-ai/lab-results", { params: filters });
}

/** GET /clinical-ai/lab-results/{id} */
export function getLabResult(labResultId: string): Promise<LabResult> {
  return apiGet<LabResult>(`/clinical-ai/lab-results/${labResultId}`);
}

/** POST /clinical-ai/lab-orders/{id}/route */
export function routeLabOrder(labOrderId: string): Promise<LabOrder> {
  return apiPost<LabOrder>(`/clinical-ai/lab-orders/${labOrderId}/route`);
}

/** POST /clinical-ai/lab-orders/{id}/collect */
export function collectLabOrder(labOrderId: string): Promise<LabOrder> {
  return apiPost<LabOrder>(`/clinical-ai/lab-orders/${labOrderId}/collect`);
}

/** POST /clinical-ai/lab-orders/{id}/start */
export function startLabOrder(labOrderId: string): Promise<LabOrder> {
  return apiPost<LabOrder>(`/clinical-ai/lab-orders/${labOrderId}/start`);
}

/** POST /clinical-ai/lab-orders/{id}/cancel */
export function cancelLabOrder(
  labOrderId: string,
  reason?: string,
): Promise<LabOrder> {
  return apiPost<LabOrder>(`/clinical-ai/lab-orders/${labOrderId}/cancel`, {
    reason: reason || null,
  });
}

/** POST /clinical-ai/lab-orders/{id}/results */
export function createLabResult(
  labOrderId: string,
  payload: LabResultCreate,
): Promise<LabResult> {
  return apiPost<LabResult>(
    `/clinical-ai/lab-orders/${labOrderId}/results`,
    payload,
  );
}

/** POST /clinical-ai/lab-results/{id}/review */
export function reviewLabResult(
  labResultId: string,
  reviewNote?: string,
): Promise<LabResult> {
  return apiPost<LabResult>(`/clinical-ai/lab-results/${labResultId}/review`, {
    review_note: reviewNote || null,
  });
}
// ─── Audio recording → transcription pipeline ────────────────────────
// Flow: record in browser → upload file (multipart) → create STT job →
// poll job status → fetch transcript → feed raw_text into generateDraft.

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

/** POST /recordings — upload an audio blob (multipart/form-data). Returns the
 *  attached recording (with recording_id). Uses a raw fetch because the shared
 *  client is JSON-only; we still inject the same auth + facility headers via
 *  api.ts's accessors (not raw localStorage reads — the storage keys are
 *  private to api.ts and this must not duplicate/drift from them). */
export async function uploadRecording(
  consultationId: string,
  file: Blob,
  durationSeconds: number,
): Promise<{ recording_id: string; [k: string]: unknown }> {
  const token = getAuthToken();
  const facility = getActiveFacilityId();

  const form = new FormData();
  form.append("file", file, "recording.webm");
  form.append("duration_seconds", String(Math.round(durationSeconds)));

  const res = await fetch(
    `${API_BASE}/clinical-ai/consultations/${consultationId}/recordings`,
    {
      method: "POST",
      headers: {
        // NOTE: do NOT set Content-Type — the browser sets the multipart
        // boundary automatically.
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(facility ? { "X-Facility-ID": facility } : {}),
      },
      body: form,
    },
  );
  const payload = await res.json();
  if (!res.ok || !payload.success) {
    throw new Error(
      payload?.error?.message || `Upload failed (HTTP ${res.status})`,
    );
  }
  return payload.data;
}

/** POST /stt-jobs — start transcription for an uploaded recording. */
export function createSttJob(
  consultationId: string,
  recordingId: string,
): Promise<STTJob> {
  return apiPost<STTJob>(
    `/clinical-ai/consultations/${consultationId}/stt-jobs`,
    { recording_id: recordingId },
  );
}

/** GET /clinical-ai/stt-jobs/{jobId} — poll transcription status. */
export function getSttJob(jobId: string): Promise<STTJob> {
  return apiGet<STTJob>(`/clinical-ai/stt-jobs/${jobId}`);
}

/** GET /consultations/{id}/transcripts — all transcripts (latest first useful). */
export function getTranscripts(consultationId: string): Promise<Transcript[]> {
  return apiGet<Transcript[]>(
    `/clinical-ai/consultations/${consultationId}/transcripts`,
  );
}

/** POST /clinical-ai/consultations/{id}/transcripts — persist manual notes. */
export function createManualTranscript(
  consultationId: string,
  rawText: string,
): Promise<Transcript> {
  return apiPost<Transcript>(
    `/clinical-ai/consultations/${consultationId}/transcripts`,
    { raw_text: rawText },
  );
}

/** GET /clinical-ai/consultations/{id}/recordings — durable segment timeline. */
export function listRecordings(
  consultationId: string,
): Promise<RecordingSegment[]> {
  return apiGet<RecordingSegment[]>(
    `/clinical-ai/consultations/${consultationId}/recordings`,
  );
}

/** POST /clinical-ai/consultations/{id}/recordings/combine-segments */
export function combineSegmentTranscripts(
  consultationId: string,
): Promise<Transcript> {
  return apiPost<Transcript>(
    `/clinical-ai/consultations/${consultationId}/recordings/combine-segments`,
  );
}

/** Poll an STT job until it reaches a terminal state. Resolves with the job. */
export async function pollSttJob(
  jobId: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<STTJob> {
  const interval = opts.intervalMs ?? 3000;
  const timeout = opts.timeoutMs ?? 120000; // 2 min ceiling
  const start = Date.now();
  // Terminal statuses we might see — accept a range since exact strings vary.
  const done = new Set([
    "completed",
    "succeeded",
    "success",
    "failed",
    "error",
  ]);
  while (true) {
    const job = await getSttJob(jobId);
    const status = String(job.status ?? "").toLowerCase();
    if (done.has(status)) return job;
    if (Date.now() - start > timeout) {
      throw new Error("Transcription timed out. Please try again.");
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}
// ─── Prescriptions (create / approve / issue) ────────────────────────

export interface PrescriptionItem {
  medication_name: string;
  dose: string;
  frequency: string;
  generic_name?: string | null;
  brand_name?: string | null;
  form?: string | null;
  strength?: string | null;
  route?: string | null;
  duration_value?: number | null;
  duration_unit?: string | null;
  quantity?: number | null;
  patient_instructions?: string | null;
}

/** POST /consultations/{id}/prescriptions/drafts — create a prescription draft. */
export function createPrescriptionDraft(
  consultationId: string,
  items: PrescriptionItem[],
  notes?: string,
): Promise<Prescription> {
  return apiPost<Prescription>(
    `/clinical-ai/consultations/${consultationId}/prescriptions/drafts`,
    { items, ...(notes ? { notes } : {}) },
  );
}

/** POST /prescriptions/{id}/approve — expected_version guards against approving
 *  a stale prescription draft (optimistic lock). */
export function approvePrescription(
  prescriptionId: string,
  expectedVersion: number,
): Promise<Prescription> {
  return apiPost<Prescription>(
    `/clinical-ai/prescriptions/${prescriptionId}/approve`,
    { expected_version: expectedVersion },
  );
}

/** POST /prescriptions/{id}/issue — finalize/issue an approved prescription.
 *  expected_version guards against issuing a stale (already-changed)
 *  prescription (optimistic lock), same as approve. */
export function issuePrescription(
  prescriptionId: string,
  expectedVersion: number,
): Promise<Prescription> {
  return apiPost<Prescription>(
    `/clinical-ai/prescriptions/${prescriptionId}/issue`,
    { expected_version: expectedVersion },
  );
}

/** POST /prescriptions/{id}/cancel — reason is required by the backend
 *  (min 1 char) and recorded on the cancelled prescription. */
export function cancelPrescription(
  prescriptionId: string,
  reason: string,
): Promise<Prescription> {
  return apiPost<Prescription>(
    `/clinical-ai/prescriptions/${prescriptionId}/cancel`,
    { reason },
  );
}
// ─── Doctor's active queue (entry point to consultations) ────────────

/** GET /operations/my-active-queue — the doctor's own open queue for today,
 *  or null if none is active. */
export function getMyActiveQueue(): Promise<components["schemas"]["QueueResponse"] | null> {
  return apiGet<components["schemas"]["QueueResponse"] | null>(
    "/operations/my-active-queue",
  );
}
