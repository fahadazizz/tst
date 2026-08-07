// lib/api/staff.ts
// Typed calls for staff account and role administration (spec §9.5/§9.6) —
// hms-backend's rbac_auth module (Foundation - Auth & RBAC). Thin wrappers
// over the shared client, same as every other lib/api/*.ts file.

import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { components } from "@/types/api";

export type StaffUser = components["schemas"]["UserResponse"];
export type UserCreate = components["schemas"]["UserCreate"];
export type UserUpdate = components["schemas"]["UserUpdate"];
export type Role = components["schemas"]["RoleResponse"];
export type RoleCreate = components["schemas"]["RoleCreate"];
export type RoleUpdate = components["schemas"]["RoleUpdate"];

// ─── Staff accounts (Users) ─────────────────────────────────────────────

/** GET /foundation/auth/users — every user in the Organisation.
 *  Requires users:profile:read. */
export function listUsers(): Promise<StaffUser[]> {
  return apiGet<StaffUser[]>("/foundation/auth/users", {
    params: { page_size: 100 },
  });
}

/** POST /foundation/auth/users — spec §9.5's documented flow: the Owner
 *  supplies a temporary password directly (there is no invitation-email
 *  workflow — do not imply one exists in the UI). Requires
 *  users:profile:create. */
export function createUser(payload: UserCreate): Promise<StaffUser> {
  return apiPost<StaffUser>("/foundation/auth/users", payload);
}

/** PATCH /foundation/auth/users/{id} — profile fields only (name/email/
 *  phone). Requires users:profile:update. Per spec, do NOT use
 *  `is_active: false` here as the deactivation action — it does not end
 *  sessions; use `deactivateUser` (DELETE) instead. */
export function updateUser(userId: string, payload: UserUpdate): Promise<StaffUser> {
  return apiPatch<StaffUser>(`/foundation/auth/users/${userId}`, payload);
}

/** DELETE /foundation/auth/users/{id} — the real deactivation action (spec
 *  §9.5's explicit instruction): soft-deactivates the user AND revokes
 *  their sessions, unlike `PATCH is_active=false` which only flips the
 *  flag. Requires users:profile:delete. Returns `APIResponse[None]` — no
 *  data to unwrap. */
export function deactivateUser(userId: string): Promise<void> {
  return apiDelete<void>(`/foundation/auth/users/${userId}`);
}

// ─── Roles ───────────────────────────────────────────────────────────────

/** GET /foundation/auth/roles — every Role in the Organisation, system and
 *  custom together. Requires users:roles:read. */
export function listRoles(): Promise<Role[]> {
  return apiGet<Role[]>("/foundation/auth/roles");
}

/** POST /foundation/auth/roles — requires users:roles:manage. */
export function createRole(payload: RoleCreate): Promise<Role> {
  return apiPost<Role>("/foundation/auth/roles", payload);
}

/** PATCH /foundation/auth/roles/{id} — requires users:roles:manage.
 *  System roles are immutable through tenant APIs (spec's explicit rule) —
 *  the backend itself rejects this with a real `409` for a system role
 *  (`role.is_system_role`), so the UI disabling the action for system
 *  roles is a convenience, not the actual security boundary. */
export function updateRole(roleId: string, payload: RoleUpdate): Promise<Role> {
  return apiPatch<Role>(`/foundation/auth/roles/${roleId}`, payload);
}

/** DELETE /foundation/auth/roles/{id} — requires users:roles:manage. Same
 *  system-role-immutability rule as update (backend 409s for system
 *  roles). Returns `APIResponse[None]`. */
export function deleteRole(roleId: string): Promise<void> {
  return apiDelete<void>(`/foundation/auth/roles/${roleId}`);
}
