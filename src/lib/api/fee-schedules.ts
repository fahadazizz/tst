// lib/api/fee-schedules.ts
// Typed calls for Facility fee schedules (spec §9.11) — hms-backend's
// operations/appointments module. "Fee schedules belong in setup because
// appointment billing depends on them" (spec's own framing) — Facility-
// scoped via the shared client's automatic X-Facility-ID header.

import { apiGet, apiPatch, apiPost } from "@/lib/api";
import type { components } from "@/types/api";

export type FeeSchedule = components["schemas"]["FeeScheduleResponse"];
export type FeeScheduleCreate = components["schemas"]["FeeScheduleCreate"];
export type FeeScheduleUpdate = components["schemas"]["FeeScheduleUpdate"];

/** GET /operations/fee-schedules — active fee schedules for the active
 *  Facility. Requires operations:fee_schedule:read. */
export function listFeeSchedules(): Promise<FeeSchedule[]> {
  return apiGet<FeeSchedule[]>("/operations/fee-schedules");
}

/** POST /operations/fee-schedules — facility_id is set server-side from the
 *  active Facility context regardless of what's sent (confirmed in
 *  `create_fee_schedule`: `payload.facility_id = facility_ctx["facility_id"]`
 *  overwrites it), so this never needs to be supplied by the caller.
 *  Requires operations:fee_schedule:create. Real overlapping-schedule
 *  conflicts surface as a `409` — spec's explicit "conflict display"
 *  requirement, not a generic failure. */
export function createFeeSchedule(payload: FeeScheduleCreate): Promise<FeeSchedule> {
  return apiPost<FeeSchedule>("/operations/fee-schedules", payload);
}

/** PATCH /operations/fee-schedules/{id} — amount, active state, or
 *  effective end only (spec's exact list of what's editable). Requires
 *  operations:fee_schedule:update. */
export function updateFeeSchedule(
  feeId: string,
  payload: FeeScheduleUpdate,
): Promise<FeeSchedule> {
  return apiPatch<FeeSchedule>(`/operations/fee-schedules/${feeId}`, payload);
}
