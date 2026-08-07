// lib/api/staff-profiles.ts
// Typed calls for Doctor profiles, specialty links, schedules, and schedule
// exceptions (spec §9.9/§9.10) — hms-backend's staff_profiles module. Every
// route here requires X-Facility-ID (spec's explicit rule), which the
// shared client already attaches automatically from the active Facility.

import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { components } from "@/types/api";

export type DoctorProfile = components["schemas"]["DoctorProfileResponse"];
export type DoctorProfileCreate = components["schemas"]["DoctorProfileCreate"];
export type DoctorProfileUpdate = components["schemas"]["DoctorProfileUpdate"];
export type DoctorSpecialty = components["schemas"]["DoctorSpecialtyResponse"];
export type DoctorSpecialtyCreate = components["schemas"]["DoctorSpecialtyCreate"];
export type DoctorSchedule = components["schemas"]["DoctorScheduleResponse"];
export type DoctorScheduleCreate = components["schemas"]["DoctorScheduleCreate"];
export type DoctorScheduleUpdate = components["schemas"]["DoctorScheduleUpdate"];
export type DoctorScheduleBulkCreateRequest =
  components["schemas"]["DoctorScheduleBulkCreateRequest"];
export type DoctorScheduleException =
  components["schemas"]["DoctorScheduleExceptionResponse"];
export type DoctorScheduleExceptionCreate =
  components["schemas"]["DoctorScheduleExceptionCreate"];

// ─── Doctor profiles ─────────────────────────────────────────────────────

/** GET /foundation/staff-profiles/doctor-profiles — paginated list of every
 *  Doctor profile in the Organisation. Requires users:profile:read. */
export function listDoctorProfiles(page = 1, pageSize = 100): Promise<DoctorProfile[]> {
  return apiGet<DoctorProfile[]>("/foundation/staff-profiles/doctor-profiles", {
    params: { page, page_size: pageSize },
  });
}

/** POST /foundation/staff-profiles/doctor-profiles — creates a profile for
 *  an existing user (spec §9.5 step 3 / §9.9: "for an existing user with an
 *  active doctor role" — this screen does not create the user itself, that
 *  is /staff's job). Requires users:profile:create. */
export function createDoctorProfile(payload: DoctorProfileCreate): Promise<DoctorProfile> {
  return apiPost<DoctorProfile>(
    "/foundation/staff-profiles/doctor-profiles",
    payload,
  );
}

/** GET /foundation/staff-profiles/doctor-profiles/{id} — includes
 *  `specialties` nested directly in the response, so a doctor's specialty
 *  links never need a separate list call. Requires users:profile:read. */
export function getDoctorProfile(profileId: string): Promise<DoctorProfile> {
  return apiGet<DoctorProfile>(
    `/foundation/staff-profiles/doctor-profiles/${profileId}`,
  );
}

/** PATCH /foundation/staff-profiles/doctor-profiles/{id} — requires
 *  users:profile:update. */
export function updateDoctorProfile(
  profileId: string,
  payload: DoctorProfileUpdate,
): Promise<DoctorProfile> {
  return apiPatch<DoctorProfile>(
    `/foundation/staff-profiles/doctor-profiles/${profileId}`,
    payload,
  );
}

/** DELETE /foundation/staff-profiles/doctor-profiles/{id} — deactivates the
 *  profile (soft-delete only, per this module's documented invariant —
 *  never a hard delete). Requires users:profile:delete. */
export function deactivateDoctorProfile(profileId: string): Promise<void> {
  return apiDelete<void>(
    `/foundation/staff-profiles/doctor-profiles/${profileId}`,
  );
}

/** POST /foundation/staff-profiles/doctor-profiles/{id}/specialties —
 *  service enforces at most one primary specialty per doctor (spec-noted
 *  invariant carried over from the DoctorSpecialty model). Requires
 *  users:profile:update. */
export function addDoctorSpecialty(
  profileId: string,
  payload: DoctorSpecialtyCreate,
): Promise<DoctorSpecialty> {
  return apiPost<DoctorSpecialty>(
    `/foundation/staff-profiles/doctor-profiles/${profileId}/specialties`,
    payload,
  );
}

/** DELETE .../specialties/{specialty_link_id} — unlinks one specialty from
 *  a doctor. Requires users:profile:update. */
export function removeDoctorSpecialty(
  profileId: string,
  specialtyLinkId: string,
): Promise<void> {
  return apiDelete<void>(
    `/foundation/staff-profiles/doctor-profiles/${profileId}/specialties/${specialtyLinkId}`,
  );
}

// ─── Doctor schedules ────────────────────────────────────────────────────

/** GET /foundation/staff-profiles/doctor-schedules?doctor_id= — every
 *  schedule row for one doctor (the "weekly schedule" view — one row per
 *  configured day/session, not one row per weekday). Requires
 *  users:profile:read. */
export function listDoctorSchedules(doctorId: string): Promise<DoctorSchedule[]> {
  return apiGet<DoctorSchedule[]>("/foundation/staff-profiles/doctor-schedules", {
    params: { doctor_id: doctorId },
  });
}

/** POST /foundation/staff-profiles/doctor-schedules — single schedule
 *  block. Requires users:profile:update. Real conflict/capacity errors
 *  (time-window/date-window overlap) surface as a `409` — spec's explicit
 *  instruction to handle these, not hide them. */
export function createDoctorSchedule(
  payload: DoctorScheduleCreate,
): Promise<DoctorSchedule> {
  return apiPost<DoctorSchedule>(
    "/foundation/staff-profiles/doctor-schedules",
    payload,
  );
}

/** POST /foundation/staff-profiles/doctor-schedules/bulk — up to 21 blocks
 *  (spec's "bulk schedule creation", e.g. a full week in one call).
 *  Requires users:profile:update. */
export function bulkCreateDoctorSchedules(
  payload: DoctorScheduleBulkCreateRequest,
): Promise<DoctorSchedule[]> {
  return apiPost<DoctorSchedule[]>(
    "/foundation/staff-profiles/doctor-schedules/bulk",
    payload,
  );
}

/** PATCH /foundation/staff-profiles/doctor-schedules/{id} — single
 *  schedule edit. Requires users:profile:update. */
export function updateDoctorSchedule(
  scheduleId: string,
  payload: DoctorScheduleUpdate,
): Promise<DoctorSchedule> {
  return apiPatch<DoctorSchedule>(
    `/foundation/staff-profiles/doctor-schedules/${scheduleId}`,
    payload,
  );
}

/** DELETE /foundation/staff-profiles/doctor-schedules/{id}. Requires
 *  users:profile:update. */
export function deleteDoctorSchedule(scheduleId: string): Promise<void> {
  return apiDelete<void>(
    `/foundation/staff-profiles/doctor-schedules/${scheduleId}`,
  );
}

// ─── Doctor schedule exceptions ──────────────────────────────────────────

/** GET .../doctor-schedule-exceptions?doctor_id=&exception_date= — real,
 *  required params (both mandatory server-side, confirmed in router) — this
 *  is a per-date lookup, not an open-ended list. Requires users:profile:read. */
export function listDoctorScheduleExceptions(
  doctorId: string,
  exceptionDate: string,
): Promise<DoctorScheduleException[]> {
  return apiGet<DoctorScheduleException[]>(
    "/foundation/staff-profiles/doctor-schedule-exceptions",
    { params: { doctor_id: doctorId, exception_date: exceptionDate } },
  );
}

/** POST .../doctor-schedule-exceptions — leave/holiday/blocked. Requires
 *  users:profile:update. */
export function createDoctorScheduleException(
  payload: DoctorScheduleExceptionCreate,
): Promise<DoctorScheduleException> {
  return apiPost<DoctorScheduleException>(
    "/foundation/staff-profiles/doctor-schedule-exceptions",
    payload,
  );
}

/** DELETE .../doctor-schedule-exceptions/{id}. Requires users:profile:update. */
export function deleteDoctorScheduleException(exceptionId: string): Promise<void> {
  return apiDelete<void>(
    `/foundation/staff-profiles/doctor-schedule-exceptions/${exceptionId}`,
  );
}
