// lib/api/insurance-consent.ts
// Typed calls for the Patient MPI insurance/consent/emergency-contact
// sub-module. Thin wrappers over the shared client — auth + X-Facility-ID +
// envelope unwrap, same as every other lib/api/*.ts file.
//
// Every call here goes through the same enforce_facility_access() guardrail
// as a plain patient read: for a patient already linked to the active
// facility, accessReason is not needed; for a genuine cross-facility lookup
// the backend 403s and requires one, exactly like getPatient().

import { apiGet, apiPost, apiPatch } from "@/lib/api";
import type { components } from "@/types/api";

export type Insurance = components["schemas"]["PatientInsuranceResponse"];
export type InsuranceCreate = components["schemas"]["PatientInsuranceCreate"];
export type InsuranceUpdate = components["schemas"]["PatientInsuranceUpdate"];

export type Consent = components["schemas"]["PatientConsentResponse"];
export type ConsentCreate = components["schemas"]["PatientConsentCreate"];

export type EmergencyContact =
  components["schemas"]["PatientEmergencyContactResponse"];
export type EmergencyContactCreate =
  components["schemas"]["PatientEmergencyContactCreate"];
export type EmergencyContactUpdate =
  components["schemas"]["PatientEmergencyContactUpdate"];

// ─── Insurance ─────────────────────────────────────────────────────────

export function listInsurance(
  patientId: string,
  accessReason?: string,
): Promise<Insurance[]> {
  return apiGet<Insurance[]>(
    `/patient-mpi/insurance-consent/patients/${patientId}/insurance`,
    { params: accessReason ? { access_reason: accessReason } : undefined },
  );
}

export function addInsurance(
  patientId: string,
  body: InsuranceCreate,
  accessReason?: string,
): Promise<Insurance> {
  return apiPost<Insurance>(
    `/patient-mpi/insurance-consent/patients/${patientId}/insurance`,
    body,
    { params: accessReason ? { access_reason: accessReason } : undefined },
  );
}

export function updateInsurance(
  insuranceId: string,
  body: InsuranceUpdate,
  accessReason?: string,
): Promise<Insurance> {
  return apiPatch<Insurance>(
    `/patient-mpi/insurance-consent/insurance/${insuranceId}`,
    body,
    { params: accessReason ? { access_reason: accessReason } : undefined },
  );
}

// ─── Consents ──────────────────────────────────────────────────────────

export function listConsents(
  patientId: string,
  accessReason?: string,
): Promise<Consent[]> {
  return apiGet<Consent[]>(
    `/patient-mpi/insurance-consent/patients/${patientId}/consents`,
    { params: accessReason ? { access_reason: accessReason } : undefined },
  );
}

export function recordConsent(
  patientId: string,
  body: ConsentCreate,
  accessReason?: string,
): Promise<Consent> {
  return apiPost<Consent>(
    `/patient-mpi/insurance-consent/patients/${patientId}/consents`,
    body,
    { params: accessReason ? { access_reason: accessReason } : undefined },
  );
}

export function revokeConsent(
  consentId: string,
  accessReason?: string,
): Promise<Consent> {
  return apiPost<Consent>(
    `/patient-mpi/insurance-consent/consents/${consentId}/revoke`,
    undefined,
    { params: accessReason ? { access_reason: accessReason } : undefined },
  );
}

// ─── Emergency contacts ──────────────────────────────────────────────────

export function listEmergencyContacts(
  patientId: string,
  accessReason?: string,
): Promise<EmergencyContact[]> {
  return apiGet<EmergencyContact[]>(
    `/patient-mpi/insurance-consent/patients/${patientId}/emergency-contacts`,
    { params: accessReason ? { access_reason: accessReason } : undefined },
  );
}

export function addEmergencyContact(
  patientId: string,
  body: EmergencyContactCreate,
  accessReason?: string,
): Promise<EmergencyContact> {
  return apiPost<EmergencyContact>(
    `/patient-mpi/insurance-consent/patients/${patientId}/emergency-contacts`,
    body,
    { params: accessReason ? { access_reason: accessReason } : undefined },
  );
}

export function updateEmergencyContact(
  contactId: string,
  body: EmergencyContactUpdate,
  accessReason?: string,
): Promise<EmergencyContact> {
  return apiPatch<EmergencyContact>(
    `/patient-mpi/insurance-consent/emergency-contacts/${contactId}`,
    body,
    { params: accessReason ? { access_reason: accessReason } : undefined },
  );
}
