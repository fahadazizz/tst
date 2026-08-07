// lib/api/rbac.ts
// Typed calls for the permission catalogue, role-permission assignment, and
// Organisation/Facility role assignment (spec §9.7/§9.8) — hms-backend's
// rbac_auth module. Thin wrappers over the shared client, same as every
// other lib/api/*.ts file.
//
// §9.7's role-PERMISSION assignment (which permissions a role holds) was
// previously blocked: the API had POST/DELETE for granting/revoking a
// role-permission link but no endpoint that listed which permissions a role
// currently held, so a grant/revoke editor couldn't show pre-checked current
// state on reload (spec §6.5's exact "don't reconstruct from frontend
// memory" concern). The backend has since added
// GET /foundation/auth/roles/{role_id}/permissions for exactly this —
// confirmed live against the deployed schema — so a real editor is now
// buildable.

import { apiDelete, apiGet, apiPost } from "@/lib/api";
import type { components } from "@/types/api";

export type Permission = components["schemas"]["PermissionResponse"];
export type RolePermissionDetail =
  components["schemas"]["RolePermissionDetailResponse"];
export type RolePermissionAssignment =
  components["schemas"]["RolePermissionResponse"];
export type OrganisationRoleAssignment =
  components["schemas"]["UserOrganisationRoleResponse"];
export type FacilityRoleAssignment =
  components["schemas"]["UserFacilityRoleResponse"];

/** GET /foundation/auth/permissions — the full permission catalogue.
 *  Requires no special permission beyond being authenticated (read-only
 *  reference data). A generous page_size since spec wants this grouped by
 *  top_level_domain/module_name client-side, i.e. the whole catalogue at
 *  once, not one page at a time. */
export function listPermissionCatalogue(): Promise<Permission[]> {
  return apiGet<Permission[]>("/foundation/auth/permissions", {
    params: { page_size: 100 },
  });
}

// ─── Role-permission assignment (spec §9.7) ─────────────────────────────

/** GET /foundation/auth/roles/{role_id}/permissions — the permissions a
 *  role currently holds, each with the permission's own detail embedded
 *  plus role_permission_id (needed for the DELETE call below). This is the
 *  read side that makes a real pre-checked grant/revoke editor possible. */
export function listRolePermissions(roleId: string): Promise<RolePermissionDetail[]> {
  return apiGet<RolePermissionDetail[]>(
    `/foundation/auth/roles/${roleId}/permissions`,
  );
}

/** POST /foundation/auth/role-permissions — grant a permission to a role. */
export function assignRolePermission(payload: {
  role_id: string;
  permission_id: string;
}): Promise<RolePermissionAssignment> {
  return apiPost<RolePermissionAssignment>(
    "/foundation/auth/role-permissions",
    payload,
  );
}

/** DELETE /foundation/auth/role-permissions/{role_permission_id} — revoke a
 *  previously granted permission from a role. */
export function removeRolePermission(rolePermissionId: string): Promise<void> {
  return apiDelete<void>(
    `/foundation/auth/role-permissions/${rolePermissionId}`,
  );
}

// ─── Organisation-scoped role assignment ────────────────────────────────

/** GET /foundation/auth/organisation-roles (no user_id) — every active
 *  Organisation-role assignment in the Organisation. Requires whatever
 *  permission governs reading others' assignments (self-reads bypass this,
 *  but an admin listing everyone's needs the real permission). */
export function listOrganisationRoleAssignments(): Promise<
  OrganisationRoleAssignment[]
> {
  return apiGet<OrganisationRoleAssignment[]>(
    "/foundation/auth/organisation-roles",
  );
}

/** POST /foundation/auth/organisation-roles. Real behaviors to surface, not
 *  hide behind a generic error (spec's explicit instruction):
 *  - 409 "User already has this active role in this organisation" (dupe).
 *  - 409 "This role was previously revoked from this user; re-granting the
 *    same role after revocation is not supported" — org-role revocation
 *    cannot currently reactivate the exact same assignment (spec's exact
 *    documented limitation, confirmed in `rbac_auth/service.py`).
 *  - 403 privilege-escalation guards (assigning Owner, or a role at/above
 *    the assigner's own authority weight). */
export function assignOrganisationRole(payload: {
  user_id: string;
  role_id: string;
}): Promise<OrganisationRoleAssignment> {
  return apiPost<OrganisationRoleAssignment>(
    "/foundation/auth/organisation-roles",
    payload,
  );
}

/** DELETE /foundation/auth/organisation-roles/{assignment_id}. Real 409:
 *  "Cannot revoke the last active Organisation Owner assignment". */
export function revokeOrganisationRole(assignmentId: string): Promise<void> {
  return apiDelete<void>(
    `/foundation/auth/organisation-roles/${assignmentId}`,
  );
}

// ─── Facility-scoped role assignment ────────────────────────────────────

/** GET /foundation/auth/facility-roles — filterable by facility_id and/or
 *  user_id; omitting both returns every active Facility-role assignment in
 *  the Organisation. */
export function listFacilityRoleAssignments(
  facilityId?: string,
): Promise<FacilityRoleAssignment[]> {
  return apiGet<FacilityRoleAssignment[]>("/foundation/auth/facility-roles", {
    params: facilityId ? { facility_id: facilityId } : undefined,
  });
}

/** POST /foundation/auth/facility-roles. Unlike Organisation-role
 *  assignment, a previously revoked exact (user, facility, role) row IS
 *  reactivated here rather than rejected (spec's exact documented
 *  distinction, confirmed via `assign_facility_role`'s
 *  `get_user_facility_role_assignment_for_update` lock-and-reactivate
 *  logic) — only a currently-active duplicate 409s. */
export function assignFacilityRole(payload: {
  user_id: string;
  facility_id: string;
  role_id: string;
}): Promise<FacilityRoleAssignment> {
  return apiPost<FacilityRoleAssignment>(
    "/foundation/auth/facility-roles",
    payload,
  );
}

/** DELETE /foundation/auth/facility-roles/{assignment_id}. */
export function revokeFacilityRole(assignmentId: string): Promise<void> {
  return apiDelete<void>(`/foundation/auth/facility-roles/${assignmentId}`);
}
