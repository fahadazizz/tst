// lib/api/platform.ts
// Typed wrappers for Platform Console feature slices. These must use the
// platform realm client, not the tenant API client, so no X-Facility-ID is sent.

import {
  platformDelete,
  platformGet,
  platformPatch,
  platformPost,
} from "@/lib/platform-api";
import type { components } from "@/types/api";
import type {
  AuditEvent,
  CrossFacilityAccess,
  LoginAttempt,
  RoleChange,
} from "@/lib/api/compliance";
import type {
  Facility,
  FacilityCreate,
  FacilityDeactivation,
  FacilityUpdate,
} from "@/lib/api/tenant";
import type { IntelligenceDashboard } from "@/lib/api/intelligence";

export type PlatformGroup = components["schemas"]["GroupResponse"];
export type PlatformGroupCreate = components["schemas"]["GroupCreate"];
export type PlatformGroupUpdate = components["schemas"]["GroupUpdate"];
export type PlatformGroupCapacity =
  components["schemas"]["PlatformGroupCapacityResponse"];
export type PlatformOrganisation = components["schemas"]["OrganisationResponse"];
export type PlatformOrganisationUpdate = components["schemas"]["OrganisationUpdate"];
export type PlatformSubscriptionCreate =
  components["schemas"]["PlatformGroupSubscriptionCreate"];
export type PlatformSubscriptionUpdate =
  components["schemas"]["GroupSubscriptionUpdate"];
export type PlatformSubscription =
  components["schemas"]["GroupSubscriptionResponse"];
export type ProvisionOrganisationRequest =
  components["schemas"]["ProvisionOrganisationRequest"];
export type ProvisionOrganisationResponse =
  components["schemas"]["ProvisionOrganisationResponse"];
export type PlatformUser = components["schemas"]["PlatformUserResponse"];
export type PlatformUserCreate = components["schemas"]["PlatformUserCreate"];
export type PlatformUserUpdate = components["schemas"]["PlatformUserUpdate"];
export type PlatformConfig = components["schemas"]["PlatformConfigResponse"];
export type PlatformConfigCreate = components["schemas"]["PlatformConfigCreate"];
export type PlatformConfigUpdate = components["schemas"]["PlatformConfigUpdate"];
export type PlatformAuditLog =
  components["schemas"]["PlatformAuditLogResponse"];
export type PlatformDashboard =
  components["schemas"]["PlatformDashboardResponse"];
export type ImpersonationStartRequest =
  components["schemas"]["ImpersonationStartRequest"];
export type ImpersonationStartResponse =
  components["schemas"]["ImpersonationStartResponse"];
export type ImpersonationEndResponse =
  components["schemas"]["ImpersonationEndResponse"];
export type PlatformPasswordChangeRequest =
  components["schemas"]["PlatformPasswordChangeRequest"];
export type PlatformPasswordChangeResponse =
  components["schemas"]["PlatformPasswordChangeResponse"];

/** GET /foundation/platform/dashboard — platform-wide analytics + operational
 *  health snapshot (Groups/Organisations/Facilities/users totals, Group
 *  subscription near-capacity alerts, outbox health). A real server-computed
 *  aggregate — don't reconstruct any of this from list endpoints. */
export function getPlatformDashboard(): Promise<PlatformDashboard> {
  return platformGet<PlatformDashboard>("/foundation/platform/dashboard");
}

export function listPlatformGroups(params: {
  limit?: number;
  offset?: number;
} = {}): Promise<PlatformGroup[]> {
  return platformGet<PlatformGroup[]>("/foundation/platform/groups", {
    params: {
      limit: params.limit ?? 100,
      offset: params.offset ?? 0,
    },
  });
}

export function getPlatformGroup(groupId: string): Promise<PlatformGroup> {
  return platformGet<PlatformGroup>(`/foundation/platform/groups/${groupId}`);
}

export function createPlatformGroup(
  body: PlatformGroupCreate,
): Promise<PlatformGroup> {
  return platformPost<PlatformGroup>("/foundation/platform/groups", body);
}

export function updatePlatformGroup(
  groupId: string,
  body: PlatformGroupUpdate,
): Promise<PlatformGroup> {
  return platformPatch<PlatformGroup>(
    `/foundation/platform/groups/${groupId}`,
    body,
  );
}

export async function deactivatePlatformGroup(groupId: string): Promise<void> {
  await platformDelete<Record<string, string>>(
    `/foundation/platform/groups/${groupId}`,
  );
}

export function getPlatformGroupCapacity(
  groupId: string,
): Promise<PlatformGroupCapacity> {
  return platformGet<PlatformGroupCapacity>(
    `/foundation/platform/groups/${groupId}/capacity`,
  );
}

export function listPlatformGroupOrganisations(
  groupId: string,
  params: { limit?: number; offset?: number } = {},
): Promise<PlatformOrganisation[]> {
  return platformGet<PlatformOrganisation[]>(
    `/foundation/platform/groups/${groupId}/organisations`,
    {
      params: {
        limit: params.limit ?? 100,
        offset: params.offset ?? 0,
      },
    },
  );
}

export function createPlatformGroupSubscription(
  groupId: string,
  body: PlatformSubscriptionCreate,
): Promise<PlatformSubscription> {
  return platformPost<PlatformSubscription>(
    `/foundation/platform/groups/${groupId}/subscriptions`,
    body,
  );
}

export function updatePlatformGroupSubscription(
  groupId: string,
  subscriptionId: string,
  body: PlatformSubscriptionUpdate,
): Promise<PlatformSubscription> {
  return platformPatch<PlatformSubscription>(
    `/foundation/platform/groups/${groupId}/subscriptions/${subscriptionId}`,
    body,
  );
}

export function provisionPlatformOrganisation(
  groupId: string,
  body: ProvisionOrganisationRequest,
): Promise<ProvisionOrganisationResponse> {
  return platformPost<ProvisionOrganisationResponse>(
    `/foundation/platform/groups/${groupId}/provision-organisation`,
    body,
  );
}

export function getPlatformOrganisation(
  organisationId: string,
): Promise<PlatformOrganisation> {
  return platformGet<PlatformOrganisation>(
    `/foundation/platform/organisations/${organisationId}`,
  );
}

export function updatePlatformOrganisation(
  organisationId: string,
  body: PlatformOrganisationUpdate,
): Promise<PlatformOrganisation> {
  return platformPatch<PlatformOrganisation>(
    `/foundation/platform/organisations/${organisationId}`,
    body,
  );
}

export async function deactivatePlatformOrganisation(
  organisationId: string,
): Promise<void> {
  await platformDelete<Record<string, string>>(
    `/foundation/platform/organisations/${organisationId}`,
  );
}

export function listPlatformUsers(): Promise<PlatformUser[]> {
  return platformGet<PlatformUser[]>("/foundation/platform/users");
}

export function createPlatformUser(
  body: PlatformUserCreate,
): Promise<PlatformUser> {
  return platformPost<PlatformUser>("/foundation/platform/users", body);
}

export function getPlatformUser(userId: string): Promise<PlatformUser> {
  return platformGet<PlatformUser>(`/foundation/platform/users/${userId}`);
}

export function updatePlatformUser(
  userId: string,
  body: PlatformUserUpdate,
): Promise<PlatformUser> {
  return platformPatch<PlatformUser>(
    `/foundation/platform/users/${userId}`,
    body,
  );
}

export async function resetPlatformUserMfa(userId: string): Promise<void> {
  await platformPost<Record<string, string>>(
    `/foundation/platform/users/${userId}/mfa/reset`,
  );
}

export async function deactivatePlatformUser(userId: string): Promise<void> {
  await platformDelete<Record<string, string>>(
    `/foundation/platform/users/${userId}`,
  );
}

export function listPlatformConfigs(): Promise<PlatformConfig[]> {
  return platformGet<PlatformConfig[]>("/foundation/platform/configs");
}

export function createPlatformConfig(
  body: PlatformConfigCreate,
): Promise<PlatformConfig> {
  return platformPost<PlatformConfig>("/foundation/platform/configs", body);
}

export function getPlatformConfig(configKey: string): Promise<PlatformConfig> {
  return platformGet<PlatformConfig>(
    `/foundation/platform/configs/${encodeURIComponent(configKey)}`,
  );
}

export function updatePlatformConfig(
  configKey: string,
  body: PlatformConfigUpdate,
): Promise<PlatformConfig> {
  return platformPatch<PlatformConfig>(
    `/foundation/platform/configs/${encodeURIComponent(configKey)}`,
    body,
  );
}

export async function deletePlatformConfig(configKey: string): Promise<void> {
  await platformDelete<Record<string, string>>(
    `/foundation/platform/configs/${encodeURIComponent(configKey)}`,
  );
}

export function listPlatformAuditLogs(params: {
  action_type?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  limit?: number;
  offset?: number;
} = {}): Promise<PlatformAuditLog[]> {
  return platformGet<PlatformAuditLog[]>("/foundation/platform/audit-logs", {
    params: {
      action_type: params.action_type || undefined,
      target_type: params.target_type || undefined,
      target_id: params.target_id || undefined,
      date_from: params.date_from || undefined,
      date_to: params.date_to || undefined,
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    },
  });
}

export function startPlatformImpersonation(
  body: ImpersonationStartRequest,
): Promise<ImpersonationStartResponse> {
  return platformPost<ImpersonationStartResponse>(
    "/foundation/platform/impersonation/start",
    body,
  );
}

export function endPlatformImpersonation(): Promise<ImpersonationEndResponse> {
  return platformPost<ImpersonationEndResponse>(
    "/foundation/platform/impersonation/end",
  );
}

/** POST /foundation/platform/password/change — self-service only, acts on
 *  the calling platform user (no target id in the request; the backend
 *  derives the actor from the auth token). Ends every active session and
 *  refresh token for this platform user, including the caller's own
 *  (`caller_session_ended` is always true) — the caller must be logged out
 *  and sent back to /platform/login immediately on success, not left on a
 *  session the server has already killed. */
export function changePlatformPassword(
  body: PlatformPasswordChangeRequest,
): Promise<PlatformPasswordChangeResponse> {
  return platformPost<PlatformPasswordChangeResponse>(
    "/foundation/platform/password/change",
    body,
  );
}

// ─── Per-Organisation audit visibility (no impersonation needed) ────────
// Same response shapes as the tenant-side /foundation/audit-compliance/*
// endpoints (reusing those types directly), but these are bare arrays
// paginated with limit/offset rather than page/page_size + total_count —
// use "load more" (increase limit or advance offset), never an invented
// page count.

export interface PlatformOrgAuditParams {
  action_type?: string;
  target_entity_type?: string;
  target_entity_id?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export interface PlatformOrgLoginAttemptParams {
  email_entered?: string;
  is_success?: boolean;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export interface PlatformOrgRoleChangeParams {
  target_user_id?: string;
  role_id?: string;
  action_performed?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export interface PlatformOrgCrossFacilityParams {
  patient_id?: string;
  accessed_by_user?: string;
  accessed_from_facility?: string;
  record_facility?: string;
  record_type?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

function compactPlatformParams<T extends object>(
  params: T,
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== "" && value !== null && value !== undefined,
    ),
  ) as Record<string, string | number | boolean>;
}

/** GET /foundation/platform/organisations/{organisation_id}/audit-events —
 *  permission platform:tenant-audit:read. */
export function listPlatformOrgAuditEvents(
  organisationId: string,
  params: PlatformOrgAuditParams = {},
): Promise<AuditEvent[]> {
  return platformGet<AuditEvent[]>(
    `/foundation/platform/organisations/${organisationId}/audit-events`,
    { params: compactPlatformParams({ limit: 50, offset: 0, ...params }) },
  );
}

/** GET /foundation/platform/organisations/{organisation_id}/login-attempts —
 *  permission platform:tenant-audit:read. */
export function listPlatformOrgLoginAttempts(
  organisationId: string,
  params: PlatformOrgLoginAttemptParams = {},
): Promise<LoginAttempt[]> {
  return platformGet<LoginAttempt[]>(
    `/foundation/platform/organisations/${organisationId}/login-attempts`,
    { params: compactPlatformParams({ limit: 50, offset: 0, ...params }) },
  );
}

/** GET /foundation/platform/organisations/{organisation_id}/role-changes —
 *  permission platform:tenant-audit:read. */
export function listPlatformOrgRoleChanges(
  organisationId: string,
  params: PlatformOrgRoleChangeParams = {},
): Promise<RoleChange[]> {
  return platformGet<RoleChange[]>(
    `/foundation/platform/organisations/${organisationId}/role-changes`,
    { params: compactPlatformParams({ limit: 50, offset: 0, ...params }) },
  );
}

/** GET /foundation/platform/organisations/{organisation_id}/cross-facility-access —
 *  permission platform:tenant-audit:read. */
export function listPlatformOrgCrossFacilityAccess(
  organisationId: string,
  params: PlatformOrgCrossFacilityParams = {},
): Promise<CrossFacilityAccess[]> {
  return platformGet<CrossFacilityAccess[]>(
    `/foundation/platform/organisations/${organisationId}/cross-facility-access`,
    { params: compactPlatformParams({ limit: 50, offset: 0, ...params }) },
  );
}

// ─── Facility management for an existing Organisation ───────────────────
// Lets Platform Admin add/manage a Facility for a customer without
// impersonating. Same FacilityCreate/FacilityUpdate/FacilityResponse
// schemas as the tenant-side endpoints (confirmed via the live schema) —
// reusing those types directly rather than declaring duplicates. A created
// Facility is the real row, immediately visible through the ordinary
// tenant-side GET too, not a shadow copy.

/** GET /foundation/platform/organisations/{organisation_id}/facilities —
 *  permission platform:facility:read. Bare array, limit/offset, no total. */
export function listPlatformOrgFacilities(
  organisationId: string,
  params: { limit?: number; offset?: number } = {},
): Promise<Facility[]> {
  return platformGet<Facility[]>(
    `/foundation/platform/organisations/${organisationId}/facilities`,
    { params: compactPlatformParams({ limit: 50, offset: 0, ...params }) },
  );
}

/** POST /foundation/platform/organisations/{organisation_id}/facilities —
 *  permission platform:facility:create. */
export function createPlatformOrgFacility(
  organisationId: string,
  payload: FacilityCreate,
): Promise<Facility> {
  return platformPost<Facility>(
    `/foundation/platform/organisations/${organisationId}/facilities`,
    payload,
  );
}

/** GET /foundation/platform/organisations/{organisation_id}/facilities/{facility_id} —
 *  permission platform:facility:read. */
export function getPlatformOrgFacility(
  organisationId: string,
  facilityId: string,
): Promise<Facility> {
  return platformGet<Facility>(
    `/foundation/platform/organisations/${organisationId}/facilities/${facilityId}`,
  );
}

/** PATCH /foundation/platform/organisations/{organisation_id}/facilities/{facility_id} —
 *  permission platform:facility:update. */
export function updatePlatformOrgFacility(
  organisationId: string,
  facilityId: string,
  payload: FacilityUpdate,
): Promise<Facility> {
  return platformPatch<Facility>(
    `/foundation/platform/organisations/${organisationId}/facilities/${facilityId}`,
    payload,
  );
}

/** DELETE /foundation/platform/organisations/{organisation_id}/facilities/{facility_id} —
 *  permission platform:facility:delete. Same real security blast radius as
 *  the tenant-side deactivation — the response reports how many
 *  Facility-role assignments were deactivated and how many sessions were
 *  ended; show it, don't discard it. */
export function deactivatePlatformOrgFacility(
  organisationId: string,
  facilityId: string,
): Promise<FacilityDeactivation> {
  return platformDelete<FacilityDeactivation>(
    `/foundation/platform/organisations/${organisationId}/facilities/${facilityId}`,
  );
}

// ─── Per-Organisation Intelligence dashboard ─────────────────────────────
// GET /foundation/platform/organisations/{organisation_id}/analytics/dashboard
// — permission platform:tenant-analytics:read. Same DashboardResponse shape
// as the tenant-side GET /intelligence/dashboard, viewed from the platform
// side for support purposes (organisation-wide scope only). Confirmed
// against the live schema: date_from/date_to are both required query
// params; there is no facility_id param on this endpoint despite the
// PLATFORM_CONSOLE_BACKEND_UPDATE.md doc describing one as optional — built
// against the real schema, not the doc's description.
export function getPlatformOrgIntelligenceDashboard(
  organisationId: string,
  params: { date_from: string; date_to: string },
): Promise<IntelligenceDashboard> {
  return platformGet<IntelligenceDashboard>(
    `/foundation/platform/organisations/${organisationId}/analytics/dashboard`,
    { params: { date_from: params.date_from, date_to: params.date_to } },
  );
}
