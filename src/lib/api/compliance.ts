// lib/api/compliance.ts
// Read-only audit/compliance browsers. These endpoints are organisation-scoped
// and the generated OpenAPI path includes the /foundation prefix.

import { apiGetWithMeta, type PageMeta } from "@/lib/api";
import type { components } from "@/types/api";

export type AuditEvent = components["schemas"]["AuditEventResponse"];
export type LoginAttempt = components["schemas"]["LoginAttemptResponse"];
export type RoleChange = components["schemas"]["RoleChangeResponse"];
export type CrossFacilityAccess =
  components["schemas"]["CrossFacilityAccessResponse"];

export interface AuditEventParams {
  action_type?: string;
  target_entity_type?: string;
  target_entity_id?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export interface LoginAttemptParams {
  email_entered?: string;
  is_success?: boolean | null;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export interface RoleChangeParams {
  target_user_id?: string;
  role_id?: string;
  action_performed?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export interface CrossFacilityAccessParams {
  patient_id?: string;
  accessed_by_user?: string;
  accessed_from_facility?: string;
  record_facility?: string;
  record_type?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

const BASE = "/foundation/audit-compliance";

export function listAuditEvents(
  params: AuditEventParams = {},
): Promise<{ data: AuditEvent[]; meta: PageMeta }> {
  return apiGetWithMeta<AuditEvent[]>(`${BASE}/audit-events`, {
    params: compactParams(params),
    skipFacility: true,
  });
}

export function listLoginAttempts(
  params: LoginAttemptParams = {},
): Promise<{ data: LoginAttempt[]; meta: PageMeta }> {
  return apiGetWithMeta<LoginAttempt[]>(`${BASE}/login-attempts`, {
    params: compactParams(params),
    skipFacility: true,
  });
}

export function listRoleChanges(
  params: RoleChangeParams = {},
): Promise<{ data: RoleChange[]; meta: PageMeta }> {
  return apiGetWithMeta<RoleChange[]>(`${BASE}/role-changes`, {
    params: compactParams(params),
    skipFacility: true,
  });
}

export function listCrossFacilityAccess(
  params: CrossFacilityAccessParams = {},
): Promise<{ data: CrossFacilityAccess[]; meta: PageMeta }> {
  return apiGetWithMeta<CrossFacilityAccess[]>(
    `${BASE}/cross-facility-access`,
    {
      params: compactParams(params),
      skipFacility: true,
    },
  );
}

function compactParams<T extends object>(params: T): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== "" && value !== null && value !== undefined,
    ),
  ) as Record<string, string | number | boolean>;
}
