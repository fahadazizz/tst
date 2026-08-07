// access-log.ts
// RULE 4 — audit-worthy actions are real, discrete, interceptable points.
//
// Not every event below needs this module to ever become a real network
// call — the backend now writes its own audit rows automatically, as a
// server-side side effect of the real API call itself, for:
//   - patient.search        (search_patients — metadata only: result count,
//                             whether a date-of-birth filter was used, never
//                             the raw query text)
//   - patient.view          (get_patient — same-facility included, not just
//                             cross-facility as before)
//   - patient.identity_discovery (discover_patient_identities — deliberately
//                             organisation-wide, no facility_id, matching
//                             its actual cross-facility-by-design behavior)
//   - patient.register      (register_patient, pre-existing)
//   - cross_facility.access (enforce_facility_access, pre-existing)
// For these, this function is a dev-only supplementary trace — remove the
// "becomes an API call" assumption for them specifically, it doesn't apply.
//
// `identifier.reveal` and `access.denied` remain genuine no-ops with no
// backend counterpart, by the backend team's own explicit, deliberate
// decision (documented 2026-08-06): identifier.reveal has no backend
// mutation to hang an audit event on as currently built, and access.denied
// isn't a "record access" event in the same sense — both flagged as
// separate, lower-priority MVP follow-ups, not silently dropped.
export type AccessEventType =
  | "patient.search"
  | "patient.view"
  | "patient.register"
  | "patient.identity_discovery" // org-wide identifier lookup, distinct from patient.search
  | "clinical_note.view"
  | "clinical_note.write" // approving/amending an authoritative note (Module 3)
  | "identifier.reveal"
  | "transcript.access"
  | "recording.access"
  | "export.pdf"
  | "access.denied"
  | "cross_facility.access"
  | "ai.access_patient_data"
  | "allergy_alert.override" // prescribing despite a flagged allergy conflict
  | "drug_interaction.override"; // prescribing despite a flagged severe interaction

export interface AccessEventContext {
  organisation_id?: string;
  facility_id?: string;
  user_id?: string;
  patient_id?: string;
  // Required for cross_facility.access — the doc mandates a reason.
  reason?: string;
  [key: string]: unknown;
}

export function logAccess(
  event: AccessEventType,
  context: AccessEventContext = {}
): void {
  if (event === "cross_facility.access" && !context.reason) {
    // Fail loudly in dev: cross-facility access without a reason is a bug.
    console.warn("[access-log] cross_facility.access logged without a reason", context);
  }
  if (process.env.NODE_ENV !== "production") {
    console.info(`[access-log] ${event}`, context);
  }
  // No generic ingestion endpoint exists, and one is not needed for
  // patient.search/patient.view/patient.identity_discovery/patient.register/
  // cross_facility.access — those are already real audit_events rows,
  // written server-side automatically by the corresponding read/write
  // endpoint (see module comment above). identifier.reveal/access.denied
  // remain unaudited by explicit backend decision, not a missing TODO here.
}
