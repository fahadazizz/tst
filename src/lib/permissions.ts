// permissions.ts
// RULE 3 — RBAC is two-tiered. Organisation isolation is a hard DB boundary;
// facility scope is soft and app-enforced. A user's effective permissions come
// from the backend (/foundation/auth/permissions/me), resolved for the facility
// they are working in (sent via X-Facility-ID).
//
// The UI was written against short permission codes ("patient.read"). The real
// backend uses namespaced codes ("patient_mpi:patient:read"). Rather than edit
// every call site, we translate here: PERMISSION_MAP turns each short code the
// UI uses into the real backend permission string(s) that satisfy it. A short
// code is granted if ANY of its mapped real codes is in the user's live set,
// or if the user holds the wildcard "*".
//
// "A hidden menu item alone is not sufficient security" — gates check the real
// permission set, never menu visibility alone.

import type { PermissionCode, Role, UUID } from "@/types/schema";

// UI short code -> real backend permission string(s). Verified against the
// live permission catalogue (the role-grant script + /permissions/me output).
export const PERMISSION_MAP: Record<string, string[]> = {
  "patient.read": ["patient_mpi:patient:read"],
  "patient.view": ["patient_mpi:patient:read"],
  "patient.search": ["patient_mpi:patient:read"],
  "patient.register": ["patient_mpi:patient:create"],
  "identifier.reveal": ["patient_mpi:patient:read"],
  "insurance.read": ["patient_mpi:insurance:read"],
  "insurance.write": ["patient_mpi:insurance:create"],
  "insurance.update": ["patient_mpi:insurance:update"],
  "consent.read": ["patient_mpi:consent:read"],
  "consent.write": ["patient_mpi:consent:create"],
  // Revoke is the backend's :update action, distinct from :create.
  "consent.revoke": ["patient_mpi:consent:update"],
  "emergency_contact.read": ["patient_mpi:emergency_contact:read"],
  "emergency_contact.write": ["patient_mpi:emergency_contact:create"],
  "emergency_contact.update": ["patient_mpi:emergency_contact:update"],
  "consultation.read": ["clinical:consultation:read"],
  "consultation.write": ["clinical:consultation:create"],
  "consultation_note.approve": ["clinical:consultation:approve"],
  "lab.read": ["clinical:lab:read"],
  "lab.route": ["clinical:lab:route"],
  "lab.update": ["clinical:lab:update"],
  "lab.result": ["clinical:lab:result"],
  "lab.review": ["clinical:lab:review"],
  "prescription.write": ["clinical:prescription:create"],
  "prescription.approve": ["clinical:prescription:approve"],
  "prescription.issue": ["clinical:prescription:issue"],
  "prescription.cancel": ["clinical:prescription:cancel"],
  "appointment.read": ["operations:appointment:read"],
  "appointment.write": ["operations:appointment:create"],
  "queue.read": ["operations:queue:read"],
  "queue.manage": ["operations:queue:update"],
  "task.read": ["operations:task:read"],
  "task.write": ["operations:task:create"],
  "task.update": ["operations:task:update"],
  "referral.read": ["operations:referral:read"],
  "referral.write": ["operations:referral:create"],
  // Accept/decline/expire are the backend's :update action, distinct from
  // :create — a role can hold one without the other, so this can't share
  // referral.write without letting a create-only role appear able to respond.
  "referral.respond": ["operations:referral:update"],
  "invoice.read": ["billing:invoice:read"],
  "invoice.create": ["billing:invoice:create"],
  "invoice.update": ["billing:invoice:update"],
  "payment.create": ["billing:payment:create"],
  "refund.create": ["billing:refund:create"],
  "intelligence.read": ["intelligence:analytics:read"],
  "intelligence.organisation": ["intelligence:analytics:organisation"],
  "notification.read": ["notifications:queue:read"],
  "notification.create": ["notifications:queue:create"],
  "notification.update": ["notifications:queue:update"],
  "audit.read": ["audit:events:read"],
  // Foundation (admin-only) — receptionist/doctor lack these, so they stay
  // locked, which is correct. Adjust if an admin gate misbehaves once the
  // owner/admin roles are tested end-to-end.
  // FIXED (was M2, tracked in FRONTEND_AUDIT_REMEDIATION_PLAN.md): these two
  // mapped to permission strings that don't exist anywhere in the real
  // backend catalogue ("foundation:staff:manage", "tenant:staff:manage",
  // "foundation:settings:manage") — confirmed via a full grep of every
  // require_permissions(...) call across hms-backend. A role holding real
  // access would still have been shown a locked nav item forever, since
  // hasPermission() only OR-matches against PERMISSION_MAP's real codes.
  // Real gate: the "Staff & roles" nav item leads to /staff, whose actual
  // read/write calls are users:profile:* and users:roles:* (rbac_auth) —
  // gate nav visibility on being able to at least read the staff list.
  "staff.manage": ["users:profile:read"],
  // "Settings" nav item leads to Organisation/Facility/Specialty admin
  // (tenant_hierarchy) — gate on being able to read the Organisation, the
  // narrowest real permission every one of those sub-screens' own readers
  // share in practice for an org admin.
  "settings.manage": ["tenant:organisation:read"],
  // Tenant hierarchy admin screens (spec §9.1-9.3) — verified against the
  // real permission strings in hms-backend's tenant_hierarchy router.py.
  "organisation.read": ["tenant:organisation:read"],
  "organisation.update": ["tenant:organisation:update"],
  "organisation.delete": ["tenant:organisation:delete"],
  "facility.read": ["tenant:facility:read"],
  "facility.create": ["tenant:facility:create"],
  "facility.update": ["tenant:facility:update"],
  "facility.delete": ["tenant:facility:delete"],
  "facility_configuration.read": ["tenant:facility-configuration:read"],
  "facility_configuration.write": ["tenant:facility-configuration:create"],
  "department.read": ["tenant:department:read"],
  "department.create": ["tenant:department:create"],
  "department.update": ["tenant:department:update"],
  "specialty.read": ["tenant:specialty:read"],
  "specialty.create": ["tenant:specialty:create"],
  "specialty.update": ["tenant:specialty:update"],
  // Staff accounts + Roles (spec §9.5-9.6) — rbac_auth module.
  "user.read": ["users:profile:read"],
  "user.create": ["users:profile:create"],
  "user.update": ["users:profile:update"],
  "user.delete": ["users:profile:delete"],
  "role.read": ["users:roles:read"],
  "role.manage": ["users:roles:manage"],
  "permission_catalogue.read": ["users:permissions:read"],
  // Fee schedules (spec §9.11) — operations/appointments module.
  "fee_schedule.read": ["operations:fee_schedule:read"],
  "fee_schedule.create": ["operations:fee_schedule:create"],
  "fee_schedule.update": ["operations:fee_schedule:update"],
};

export interface SessionScope {
  user_id: UUID;
  organisation_id: UUID;
  active_facility_id: UUID;
  roles: Role[]; // kept for shape stability; real gating uses `permissions`
  /** The user's live effective permission strings from the backend. */
  permissions: string[];
}

export function hasPermission(
  scope: SessionScope,
  permission: PermissionCode,
): boolean {
  const held = scope.permissions;
  if (held.includes("*")) return true; // wildcard (Organisation Owner)
  const realCodes = PERMISSION_MAP[permission];
  if (!realCodes) {
    if (typeof console !== "undefined") {
      console.warn(`[permissions] no mapping for UI code "${permission}" — denying`);
    }
    return false;
  }
  return realCodes.some((code) => held.includes(code));
}
