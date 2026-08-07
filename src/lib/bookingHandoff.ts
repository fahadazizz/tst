// lib/bookingHandoff.ts — the pure piece of the patient-registration ->
// booking handoff (patients/new/page.tsx redirects to /appointments?
// patientId=&openBooking=1; BookingModal in appointments/page.tsx consumes
// it). Extracted so this is testable without jsdom/React-rendering infra
// (vitest.config.ts: pure-logic tests only, for now).
//
// The bug this exists to prevent: BookingModal used to auto-select
// pats[0] — the first row of an arbitrary 100-row search — as the default
// patient. A receptionist who just registered someone and didn't notice
// the dropdown could book the appointment for a stranger. When a handoff
// patient is present, it must always win over that default, and it must
// not depend on the new patient happening to appear in the search results
// (no ordering guarantee) — it's fetched by id independently.

import type { Patient } from "@/lib/api/patients";

export interface BookingPatientList {
  patients: Patient[];
  /** "" when there's nothing to select (e.g. empty search, no handoff). */
  selectedPatientId: string;
}

/**
 * Combines the generic patient search results with an optional handoff
 * patient (fetched by id from a ?patientId= redirect). The handoff patient,
 * when present, is always the selection — never the arbitrary first search
 * result — and is deduped into the list rather than appearing twice.
 */
export function resolveBookingPatients(
  searchResults: Patient[],
  handoffPatient: Patient | null,
): BookingPatientList {
  if (!handoffPatient) {
    return {
      patients: searchResults,
      selectedPatientId: searchResults[0]?.patient_id ?? "",
    };
  }
  const deduped = searchResults.filter(
    (p) => p.patient_id !== handoffPatient.patient_id,
  );
  return {
    patients: [handoffPatient, ...deduped],
    selectedPatientId: handoffPatient.patient_id,
  };
}
