// schema.ts
// TypeScript types mirroring the NexAura HMS Database Schema Review.
// Field names match the schema exactly so backend integration is a data-source
// swap, not a rewrite. This is a subset covering one full patient journey;
// extend table-by-table as screens are built.

// ---- shared ----
export type UUID = string; // UUIDv7 for patient-facing records in production
export type ISODateTime = string; // e.g. "2026-07-21T09:30:00+05:00"
export type ISODate = string; // "1990-04-17"
export type Locale = "en" | "ur";

// Audit columns present on every operational table.
export interface AuditColumns {
  created_at: ISODateTime;
  created_by: UUID | null; // null = system-generated
  updated_at: ISODateTime;
  updated_by?: UUID | null;
  deleted_at: ISODateTime | null; // soft delete; null = active
}

// ---- Phase 2: organisation hierarchy ----
export interface Organisation {
  organisation_id: UUID;
  group_id: UUID | null;
  legal_name: string;
  display_name: string;
  tax_identifier: string | null;
  country_code: string;
  default_currency: string; // "PKR"
  default_locale: Locale;
  timezone: string; // "Asia/Karachi"
  status: "active" | "trial" | "suspended" | "archived";
}

export interface Facility {
  facility_id: UUID;
  organisation_id: UUID;
  facility_name: string;
  facility_code: string; // "MDC-LHR" — prefixes MRNs / invoice numbers
  facility_type: "clinic" | "hospital" | "lab" | "diagnostic_centre";
  city: string;
  province: string;
  country_code: string;
  timezone: string | null; // falls back to org timezone
  is_active: boolean;
}

// ---- Phase 3: identity & RBAC ----
export type UserType = "doctor" | "receptionist" | "admin" | "finance" | "other";

export interface User {
  user_id: UUID;
  organisation_id: UUID;
  primary_facility_id: UUID;
  email: string; // unique within org, not globally
  full_name: string;
  designation: string | null;
  preferred_locale: Locale;
  is_active: boolean;
  user_type: UserType; // UI defaults only — real permissions come from roles
}

export interface Role {
  role_id: UUID;
  organisation_id: UUID;
  role_name: string; // "Receptionist", "Consultant"
  code: string;
}

// A permission code, e.g. "patient.read", "consultation_note.approve".
export type PermissionCode = string;

// Which roles a user holds AT a given facility (the soft, app-enforced scope).
export interface UserFacilityRole {
  user_id: UUID;
  facility_id: UUID;
  role_id: UUID;
}

// ---- Phase 4: patient master index ----
export type IdentifierType =
  | "cnic"
  | "passport"
  | "mrn_external"
  | "insurance"
  | "other";

// High-risk. Stored encrypted + hashed in production; masked-by-default in UI.
export interface PatientIdentifier {
  identifier_id: UUID;
  patient_id: UUID;
  organisation_id: UUID;
  identifier_type: IdentifierType;
  identifier_value: string;
  issuing_country: string | null;
  is_primary: boolean;
  verified_at: ISODateTime | null;
}

export interface Patient extends AuditColumns {
  patient_id: UUID;
  organisation_id: UUID;
  originating_facility_id: UUID;
  mrn: string; // human-readable, facility-prefixed
  first_name: string;
  last_name: string;
  name_urdu: string | null;
  date_of_birth: ISODate;
  gender: "male" | "female" | "other";
  blood_group: string | null;
  phone_number: string;
  city: string | null;
  province: string | null;
  country_code: string;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  preferred_language: Locale;
  is_active: boolean;
  registration_source: "walk_in" | "appointment" | "referral" | "import";
}

export interface Allergy extends AuditColumns {
  allergy_id: UUID;
  patient_id: UUID;
  organisation_id: UUID;
  substance: string;
  reaction: string | null;
  severity: "mild" | "moderate" | "severe";
}

export interface PatientConsent extends AuditColumns {
  consent_id: UUID;
  patient_id: UUID;
  organisation_id: UUID;
  consent_type: string; // "data_processing", "cross_org_share", "ai_processing"
  granted: boolean;
  granted_at: ISODateTime | null;
  // INTENTIONAL SCHEMA EXTENSION (Module 2): consent revocation must be
  // auditable — when a consent is withdrawn we flip `granted` to false and
  // stamp when it happened, rather than deleting the row. Flag for the backend
  // team to mirror on patient_consents.
  revoked_at?: ISODateTime | null;
}

// ---- Phase 7: clinical consultation pipeline ----
// The three lifecycle stages MUST stay distinct in the UI. See RULE 2.

export interface Consultation extends AuditColumns {
  consultation_id: UUID;
  organisation_id: UUID;
  facility_id: UUID;
  patient_id: UUID;
  doctor_id: UUID;
  status: "scheduled" | "in_progress" | "awaiting_review" | "completed";
  started_at: ISODateTime | null;
}

// A diarised turn in a transcript.
export interface TranscriptSegment {
  speaker: string; // "Doctor" | "Patient" | staff role label
  at: string; // mm:ss offset from the start of the recording
  text: string;
}

// STAGE 1 — raw source material. Never the clinical record.
export interface ConsultationTranscript {
  transcript_id: UUID;
  consultation_id: UUID;
  organisation_id: UUID;
  content: string;
  language: Locale;
  created_at: ISODateTime;
  // INTENTIONAL EXTENSION (Module 3): diarised speaker turns for display.
  // `content` remains the flat text; `segments` is the turn-by-turn view.
  segments?: TranscriptSegment[];
}

// STAGE 2 — AI draft. Advisory only. Never styled as authoritative.
export interface LlmExtraction {
  extraction_id: UUID;
  consultation_id: UUID;
  organisation_id: UUID;
  model_provider: string; // "azure_openai" preferred for PHI
  model_name: string;
  prompt_version: string;
  status: "pending" | "draft" | "superseded" | "error";
  soap_draft: SoapFields;
  diagnosis_hints: { label: string; icd10?: string }[];
}

// The edit diff captured when a draft is approved into a note: which SOAP
// fields the clinician changed vs accepted verbatim from the AI draft.
export interface AiEditsSummary {
  edited: (keyof SoapFields)[];
  accepted: (keyof SoapFields)[];
}

// STAGE 3 — doctor-approved authoritative note. Versioned.
export interface ConsultationNote extends AuditColumns, SoapFields {
  note_id: UUID;
  consultation_id: UUID;
  organisation_id: UUID;
  version: number; // increments on amendment
  is_current: boolean;
  ai_extraction_id: UUID | null; // provenance link to the draft it came from
  approved_by: UUID | null;
  approved_at: ISODateTime | null;
  amendment_reason: string | null;
  // INTENTIONAL EXTENSION (Rule 2): the edit diff captured at approval. Null
  // for notes authored without an AI draft.
  ai_edits_summary_json?: AiEditsSummary | null;
}

// Expanded SOAP structure shared by draft + approved note.
export interface SoapFields {
  chief_complaint: string;
  history_present_illness: string;
  history_past_medical: string;
  history_surgical: string;
  history_family: string;
  history_social: string;
  history_medications: string;
  history_allergies: string;
  ros_summary: string;
  physical_exam_summary: string;
  assessment: string;
  clinical_reasoning: string;
  plan: string;
  patient_education: string;
}

export interface VitalsObservation {
  vitals_id: UUID;
  consultation_id: UUID;
  organisation_id: UUID;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  heart_rate: number | null;
  temperature_c: number | null;
  spo2: number | null;
  recorded_at: ISODateTime;
}

export interface Diagnosis {
  diagnosis_id: UUID;
  consultation_id: UUID;
  organisation_id: UUID;
  icd10_code: string;
  description: string;
  is_primary: boolean;
}

// ---- Phase 8: prescriptions ----
export interface Prescription extends AuditColumns {
  prescription_id: UUID;
  consultation_id: UUID;
  organisation_id: UUID;
  patient_id: UUID;
  prescribed_by: UUID;
}

export interface PrescriptionLine {
  line_id: UUID;
  prescription_id: UUID;
  drug_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string | null;
}

// Reference/lookup data for the prescribing typeahead — not an audited
// clinical record, just a small mock catalogue.
export interface DrugCatalogueEntry {
  drug_name: string;
  common_dosages?: string[];
}

// A known pairwise interaction between two drugs. Order-independent when
// matched (drug_a/drug_b is not itself clinically meaningful).
export interface DrugInteraction {
  interaction_id: UUID;
  drug_a: string;
  drug_b: string;
  effect: string;
  severity: "mild" | "moderate" | "severe";
}

// A recorded allergy conflict on a prescription line. Real Phase 8 table per
// CLAUDE.md's module list — the clinician's override reason is captured here
// so it is a reviewable record, not just a console log.
export interface AllergyAlert {
  alert_id: UUID;
  organisation_id: UUID;
  consultation_id: UUID;
  patient_id: UUID;
  allergy_id: UUID;
  drug_name: string;
  substance: string;
  severity: Allergy["severity"];
  override_reason: string;
  overridden_by: UUID;
  overridden_at: ISODateTime;
}

// Reference/lookup catalogue for lab_orders.test_name.
export interface LabTestCatalogueEntry {
  test_code: string;
  test_name: string;
}

export interface LabOrder extends AuditColumns {
  lab_order_id: UUID;
  consultation_id: UUID;
  organisation_id: UUID;
  patient_id: UUID;
  ordered_by: UUID;
  test_name: string;
  priority: "routine" | "urgent" | "stat";
  clinical_notes: string | null;
  status: "ordered" | "in_progress" | "completed" | "cancelled";
}

// ---- Phase 6 / 10: operations ----
export interface Appointment extends AuditColumns {
  appointment_id: UUID;
  organisation_id: UUID;
  facility_id: UUID;
  patient_id: UUID;
  doctor_id: UUID;
  scheduled_at: ISODateTime;
  status: "booked" | "arrived" | "in_consultation" | "completed" | "cancelled" | "no_show";
  // INTENTIONAL SCHEMA EXTENSION (Module 4): the booking form needs a slot
  // length and a free-text reason, neither of which exist on the reviewed
  // Appointment columns. Flagged rather than silently invented.
  duration_minutes: number;
  reason: string | null;
}

export interface QueueEntry {
  queue_entry_id: UUID;
  organisation_id: UUID;
  facility_id: UUID;
  patient_id: UUID;
  token_number: number; // resets daily
  // INTENTIONAL SCHEMA EXTENSION (Module 4): "skipped" — the token was called
  // but the patient didn't respond. Distinct from "done" (seen) so the queue
  // board can re-surface it, and distinct from silently reverting to
  // "waiting" (which would erase that a skip happened).
  status: "waiting" | "called" | "in_room" | "done" | "skipped";
  joined_at: ISODateTime;
}

export interface Referral extends AuditColumns {
  referral_id: UUID;
  organisation_id: UUID;
  patient_id: UUID;
  from_facility_id: UUID;
  to_facility_id: UUID;
  reason: string;
  status: "pending" | "accepted" | "completed" | "declined";
}

export interface FollowUpTask extends AuditColumns {
  task_id: UUID;
  organisation_id: UUID;
  facility_id: UUID;
  patient_id: UUID;
  assigned_to: UUID | null;
  description: string;
  due_at: ISODateTime | null;
  status: "open" | "in_progress" | "done";
}
