// lib/api/patients.ts
// Typed calls for the Patient MPI module. Thin wrappers over the shared client
// (src/lib/api.ts), which injects auth + X-Facility-ID and unwraps the
// { success, data, error } envelope. Every function returns the real backend
// shape from the generated OpenAPI types, so callers stay in sync with the API.

import { apiDownload, apiGet, apiPost } from "@/lib/api";
import type { components } from "@/types/api";

export type Patient = components["schemas"]["PatientResponse"];
export type PatientCreate = components["schemas"]["PatientCreate"];
export type PatientFacilityLink =
  components["schemas"]["PatientFacilityLinkResponse"];
export type PatientDocument = components["schemas"]["PatientDocumentResponse"];

export interface PatientSearchParams {
  /** Fuzzy name / free-text query. */
  q?: string;
  /** Exact DOB filter (YYYY-MM-DD). */
  date_of_birth?: string;
  limit?: number;
  offset?: number;
}

/** GET /patient-mpi/mpi-core/patients — server-side patient search, scoped
 *  to the active facility. The backend unconditionally 403s if an
 *  access_reason is supplied here — cross-facility discovery goes through
 *  discoverPatientIdentities()/getPatient(id, reason) instead. */
export function searchPatients(params: PatientSearchParams = {}): Promise<Patient[]> {
  return apiGet<Patient[]>("/patient-mpi/mpi-core/patients", {
    params: {
      q: params.q || undefined,
      date_of_birth: params.date_of_birth || undefined,
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    },
  });
}

/** GET /patient-mpi/mpi-core/patients/{id} — single patient by id. */
export function getPatient(patientId: string, accessReason?: string): Promise<Patient> {
  return apiGet<Patient>(`/patient-mpi/mpi-core/patients/${patientId}`, {
    params: accessReason ? { access_reason: accessReason } : undefined,
  });
}

/** POST /patient-mpi/mpi-core/patients — register a new patient. */
export function createPatient(body: PatientCreate): Promise<Patient> {
  return apiPost<Patient>("/patient-mpi/mpi-core/patients", body);
}

export type PatientIdentityCandidate =
  components["schemas"]["PatientIdentityDiscoveryResponse"];

export interface IdentityDiscoveryParams {
  /** Free-text: name, CNIC, or phone — matched org-wide, not facility-scoped. */
  q: string;
  date_of_birth?: string;
  limit?: number;
}

/** GET /patient-mpi/mpi-core/patients/identity-discovery — masked, ranked
 *  duplicate-candidate search across the WHOLE organisation (not just the
 *  active facility), so a patient registered at a different facility still
 *  surfaces here instead of silently reading as "not found". Returns minimal
 *  masked fields only — never opens the full record. */
export function discoverPatientIdentities(
  params: IdentityDiscoveryParams,
): Promise<PatientIdentityCandidate[]> {
  return apiGet<PatientIdentityCandidate[]>(
    "/patient-mpi/mpi-core/patients/identity-discovery",
    {
      params: {
        q: params.q,
        date_of_birth: params.date_of_birth || undefined,
        limit: params.limit ?? 20,
      },
    },
  );
}
// ─── Patient clinical history (allergies, medications) ───────────────

export interface Allergy {
  allergy_id: string;
  allergen: string;
  reaction?: string | null;
  severity?: string | null;
  recorded_at?: string | null;
}

export interface PatientMedication {
  id: string;
  medication_name: string;
  generic_name?: string | null;
  strength?: string | null;
  dosage?: string | null;
  frequency?: string | null;
  route?: string | null;
  is_active?: boolean;
  prescribed_by_name?: string | null;
  start_date?: string | null;
}

/** GET a patient's declared allergies. */
export function getPatientAllergies(patientId: string): Promise<Allergy[]> {
  return apiGet<Allergy[]>(
    `/patient-mpi/clinical-history/patients/${patientId}/allergies`,
  );
}

/** GET a patient's medications. */
export function getPatientMedications(
  patientId: string,
): Promise<PatientMedication[]> {
  return apiGet<PatientMedication[]>(
    `/patient-mpi/clinical-history/patients/${patientId}/medications`,
  );
}

/** GET /patient-mpi/mpi-core/patients/{id}/facility-links */
export function listPatientFacilityLinks(
  patientId: string,
): Promise<PatientFacilityLink[]> {
  return apiGet<PatientFacilityLink[]>(
    `/patient-mpi/mpi-core/patients/${patientId}/facility-links`,
  );
}

/** GET /patient-mpi/clinical-history/patients/{id}/documents */
export function listPatientDocuments(
  patientId: string,
): Promise<PatientDocument[]> {
  return apiGet<PatientDocument[]>(
    `/patient-mpi/clinical-history/patients/${patientId}/documents`,
  );
}

/** GET /patient-mpi/clinical-history/patients/{id}/documents/{documentId}/download */
export function downloadPatientDocument(
  patientId: string,
  documentId: string,
): Promise<Blob> {
  return apiDownload(
    `/patient-mpi/clinical-history/patients/${patientId}/documents/${documentId}/download`,
  );
}
