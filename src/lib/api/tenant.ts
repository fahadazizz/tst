// lib/api/tenant.ts
// Typed calls for the Foundation Tenant Hierarchy module (organisation,
// facilities, facility configuration). Thin wrappers over the shared client
// — auth + X-Facility-ID + envelope unwrap, same as every other
// lib/api/*.ts file.
//
// Organisation scope always comes from the authenticated token, never from
// frontend state (spec §9.1) — every call here uses the self-scoped
// /organisation endpoints, not /organisations/{id}, except deactivation
// (which has no self-scoped route) where organisation_id is always the ID
// this same module just fetched from GET /organisation, never user-typed.

import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { components } from "@/types/api";

export type Organisation = components["schemas"]["OrganisationResponse"];
export type OrganisationUpdate = components["schemas"]["OrganisationUpdate"];
export type Facility = components["schemas"]["FacilityResponse"];
export type FacilityCreate = components["schemas"]["FacilityCreate"];
export type FacilityUpdate = components["schemas"]["FacilityUpdate"];
export type FacilityDeactivation =
  components["schemas"]["FacilityDeactivationResponse"];
export type FacilitySetupOverview =
  components["schemas"]["FacilitySetupOverviewResponse"];
export type FacilityConfiguration =
  components["schemas"]["FacilityConfigurationResponse"];
export type FacilityConfigurationSave =
  components["schemas"]["FacilityConfigurationCreate"];
export type Department = components["schemas"]["DepartmentResponse"];
export type DepartmentCreate = components["schemas"]["DepartmentCreate"];
export type DepartmentUpdate = components["schemas"]["DepartmentUpdate"];
export type Specialty = components["schemas"]["SpecialtyResponse"];
export type SpecialtyCreate = components["schemas"]["SpecialtyCreate"];
export type SpecialtyUpdate = components["schemas"]["SpecialtyUpdate"];

// ─── Organisation ──────────────────────────────────────────────────────

/** GET /foundation/tenant-hierarchy/organisation — the authenticated
 *  Organisation. Requires tenant:organisation:read. */
export function getOrganisation(): Promise<Organisation> {
  return apiGet<Organisation>("/foundation/tenant-hierarchy/organisation");
}

/** PATCH /foundation/tenant-hierarchy/organisation — partial update.
 *  Requires tenant:organisation:update. */
export function updateOrganisation(
  payload: OrganisationUpdate,
): Promise<Organisation> {
  return apiPatch<Organisation>(
    "/foundation/tenant-hierarchy/organisation",
    payload,
  );
}

/** DELETE /foundation/tenant-hierarchy/organisations/{organisation_id} —
 *  soft-deactivates the Organisation. No self-scoped route exists for
 *  delete; `organisationId` must be the caller's own (from getOrganisation),
 *  never a user-typed value — the backend rejects any other ID anyway
 *  (`_reject_cross_org_path`). Requires tenant:organisation:delete.
 *  204 No Content on success — nothing to return. */
export function deactivateOrganisation(organisationId: string): Promise<void> {
  return apiDelete<void>(
    `/foundation/tenant-hierarchy/organisations/${organisationId}`,
  );
}

// ─── Facilities ────────────────────────────────────────────────────────

/** GET /foundation/tenant-hierarchy/facilities — all active facilities in the
 *  authenticated organisation. Requires tenant:facility:read — not every
 *  role holds it, so callers should handle a 403 gracefully (e.g. disable
 *  whatever picker needed this list) rather than assume it always succeeds. */
export function listFacilities(): Promise<Facility[]> {
  return apiGet<Facility[]>("/foundation/tenant-hierarchy/facilities", {
    params: { limit: 200 },
  });
}

/** POST /foundation/tenant-hierarchy/facilities — requires tenant:facility:create. */
export function createFacility(payload: FacilityCreate): Promise<Facility> {
  return apiPost<Facility>("/foundation/tenant-hierarchy/facilities", payload);
}

/** GET /foundation/tenant-hierarchy/facilities/{id} — requires tenant:facility:read. */
export function getFacility(facilityId: string): Promise<Facility> {
  return apiGet<Facility>(`/foundation/tenant-hierarchy/facilities/${facilityId}`);
}

/** GET /foundation/tenant-hierarchy/facilities/{id}/setup-overview — the
 *  primary Facility setup boot request (spec §9.2): aggregates identity,
 *  configuration (null if never configured), and departments in one call.
 *  Requires tenant:facility:read. */
export function getFacilitySetupOverview(
  facilityId: string,
): Promise<FacilitySetupOverview> {
  return apiGet<FacilitySetupOverview>(
    `/foundation/tenant-hierarchy/facilities/${facilityId}/setup-overview`,
  );
}

/** PATCH /foundation/tenant-hierarchy/facilities/{id} — requires tenant:facility:update. */
export function updateFacility(
  facilityId: string,
  payload: FacilityUpdate,
): Promise<Facility> {
  return apiPatch<Facility>(
    `/foundation/tenant-hierarchy/facilities/${facilityId}`,
    payload,
  );
}

/** DELETE /foundation/tenant-hierarchy/facilities/{id} — deactivates the
 *  Facility. Has a real security blast radius (spec §9.2): the response
 *  reports how many Facility-role assignments were deactivated and how many
 *  sessions were ended, which the UI must show, not silently discard.
 *  Requires tenant:facility:delete. */
export function deactivateFacility(
  facilityId: string,
): Promise<FacilityDeactivation> {
  return apiDelete<FacilityDeactivation>(
    `/foundation/tenant-hierarchy/facilities/${facilityId}`,
  );
}

// ─── Facility configuration ────────────────────────────────────────────

/** GET /foundation/tenant-hierarchy/facility-configurations/{facility_id} —
 *  requires tenant:facility-configuration:read. 404 if never configured. */
export function getFacilityConfiguration(
  facilityId: string,
): Promise<FacilityConfiguration> {
  return apiGet<FacilityConfiguration>(
    `/foundation/tenant-hierarchy/facility-configurations/${facilityId}`,
  );
}

/** POST /foundation/tenant-hierarchy/facility-configurations — this is a
 *  real upsert (`upsert_configuration` in the backend service, confirmed
 *  via source), not create-only: the same call both creates a Facility's
 *  first configuration and updates an existing one, so the UI needs no
 *  separate create-vs-update branch. Requires tenant:facility-configuration:create. */
export function saveFacilityConfiguration(
  payload: FacilityConfigurationSave,
): Promise<FacilityConfiguration> {
  return apiPost<FacilityConfiguration>(
    "/foundation/tenant-hierarchy/facility-configurations",
    payload,
  );
}

// ─── Departments (Facility-scoped) ─────────────────────────────────────

/** GET /foundation/tenant-hierarchy/departments?facility_id= — all active
 *  Departments in one Facility. Requires tenant:department:read. */
export function listDepartments(facilityId: string): Promise<Department[]> {
  return apiGet<Department[]>("/foundation/tenant-hierarchy/departments", {
    params: { facility_id: facilityId },
  });
}

/** POST /foundation/tenant-hierarchy/departments — requires tenant:department:create.
 *  `department_code` must be unique per Facility (spec: "respect ... duplicate-code
 *  conflicts" — the backend enforces this; surface its error, don't hide it). */
export function createDepartment(payload: DepartmentCreate): Promise<Department> {
  return apiPost<Department>("/foundation/tenant-hierarchy/departments", payload);
}

/** PATCH /foundation/tenant-hierarchy/departments/{id} — requires
 *  tenant:department:update. Also how a Department is linked to (or
 *  unlinked from) a Specialty and deactivated (`is_active: false`) — there
 *  is no separate deactivate endpoint for Departments. */
export function updateDepartment(
  departmentId: string,
  payload: DepartmentUpdate,
): Promise<Department> {
  return apiPatch<Department>(
    `/foundation/tenant-hierarchy/departments/${departmentId}`,
    payload,
  );
}

// ─── Specialties (Organisation-wide, not Facility-scoped) ──────────────

/** GET /foundation/tenant-hierarchy/specialties — every active Specialty in
 *  the Organisation (shared across all Facilities, unlike Departments).
 *  Requires tenant:specialty:read. */
export function listSpecialties(): Promise<Specialty[]> {
  return apiGet<Specialty[]>("/foundation/tenant-hierarchy/specialties");
}

/** POST /foundation/tenant-hierarchy/specialties — requires
 *  tenant:specialty:create. `specialty_code` must be unique per
 *  Organisation; the backend raises a real 409 on conflict. */
export function createSpecialty(payload: SpecialtyCreate): Promise<Specialty> {
  return apiPost<Specialty>("/foundation/tenant-hierarchy/specialties", payload);
}

/** PATCH /foundation/tenant-hierarchy/specialties/{id} — requires
 *  tenant:specialty:update. Also how a Specialty is deactivated
 *  (`is_active: false`) — no separate deactivate endpoint. */
export function updateSpecialty(
  specialtyId: string,
  payload: SpecialtyUpdate,
): Promise<Specialty> {
  return apiPatch<Specialty>(
    `/foundation/tenant-hierarchy/specialties/${specialtyId}`,
    payload,
  );
}
