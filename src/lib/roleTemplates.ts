// lib/roleTemplates.ts — spec §6.4/§6.5: product-owned, versioned role
// templates. These are creation-time presets (pre-check a bundle of real
// backend permissions when creating a custom Role) — NOT live inheritance,
// NOT a backend concept, and NOT the same thing as PERMISSION_MAP (that's a
// UI-gating translation layer; this operates directly on the real
// permission_name strings from GET /foundation/auth/permissions, the same
// catalogue the role-permission editor already uses).
//
// v2 — completeness pass. v1's bundles were each individually verified real
// but were not verified COMPLETE against what each persona's real workflow
// actually touches. Every permission below was re-checked against the real
// backend router/schema code (not just the catalogue) before being added —
// several v1 gaps were severe enough that the persona's own primary screen
// was broken: Lab Staff and Finance held no patient_mpi:patient:read even
// though LabOrderResponse/InvoiceResponse only carry a raw patient_id, no
// name; Doctor held no clinical:consultation:document, the exact permission
// gating the AI voice-recording/transcription pipeline (clinical_ai/
// router.py) that clinical:draft:generate/edit depends on having a
// transcript to operate on in the first place.
//
// Every permissionName was verified against the live local permission
// catalogue (86 rows) before being written here — not guessed from the
// audit doc's shorthand. Three permissions the audit doc named for the
// Finance template (`receipt.read`, `discount.create`, `invoice.void`) do
// not exist anywhere in the real catalogue and are deliberately omitted, not
// approximated — see the Finance template's own comment. The template
// application flow (staff/roles/page.tsx) re-validates every name against
// the live catalogue at apply time regardless, and aborts if the backend's
// catalogue ever drifts from what's listed here.
//
// IMPORTANT — personaLanding.ts dependency: lib/personaLanding.ts routes
// each persona to a default post-login landing page by checking for one
// permission (or combo) proven exclusive to that persona's template below.
// Any future edit to a template's permissionNames MUST re-check that every
// PERSONA_LANDING_RULES trigger in personaLanding.ts is still held by
// exactly one template — see docs/engineering/frontend/
// PERSONA_LANDING_PLAN.md. This is not hypothetical: an earlier draft of
// this v2 pass considered adding clinical:lab:route to Doctor (plausible —
// doctors do interact with lab orders), which would have silently
// re-broken Doctor's routing (Lab Staff's exclusive trigger is
// clinical:lab:route) exactly like the bug that was already found and
// fixed once. Doctor gets clinical:lab:read/review only, deliberately not
// route/update/result — those stay Lab Staff-exclusive, both on the merits
// (routing/collecting/entering results is lab operations work, not a
// clinical review action) and to keep the routing trigger valid.

export interface RoleTemplate {
  key: string;
  version: number;
  displayName: string;
  scopeType: "organisation" | "facility";
  /** Real backend permission_name strings (from the permissions table),
   *  not UI short codes. */
  permissionNames: string[];
  /** Documented, informational only — permissions this persona should NOT
   *  hold even though they might seem related. Not enforced in code beyond
   *  simply not being in permissionNames; recorded so a future template
   *  edit doesn't accidentally reintroduce them without noticing. */
  excludedSensitive?: string[];
  /** Pre-selected on the role-weight-tier picker (see lib/roleWeightTiers) —
   *  a sensible default for this persona's assignment authority, editable
   *  before saving like everything else the template pre-fills. */
  defaultWeight: number;
}

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    key: "receptionist",
    version: 2,
    displayName: "Receptionist",
    scopeType: "facility",
    permissionNames: [
      // Patient intake — registration plus everything normally captured
      // at the front desk during that same visit (consent, emergency
      // contact, insurance), not just the bare create.
      "patient_mpi:patient:create",
      "patient_mpi:patient:read",
      "patient_mpi:patient:update",
      "patient_mpi:consent:create",
      "patient_mpi:consent:read",
      "patient_mpi:consent:update",
      "patient_mpi:emergency_contact:create",
      "patient_mpi:emergency_contact:read",
      "patient_mpi:emergency_contact:update",
      "patient_mpi:insurance:create",
      "patient_mpi:insurance:read",
      "patient_mpi:insurance:update",
      // Scheduling — v1 only had create; a receptionist reschedules far
      // more often than they book fresh.
      "operations:appointment:create",
      "operations:appointment:read",
      "operations:appointment:update",
      "operations:queue:read",
      "operations:queue:update",
      // Quoting a price at booking/registration.
      "operations:fee_schedule:read",
      // Scheduling around a referral a doctor already made. Deliberately
      // read-only — creating a referral is a clinical judgment call, not
      // an administrative one; kept off this template on purpose.
      "operations:referral:read",
      // task:read was missing in v1 even though task:update was granted —
      // dead permission, since the Tasks nav item and list view gate on
      // task.read. Both are needed for either to do anything through the UI.
      "operations:task:read",
      "operations:task:update",
      // Administrative "left before seen" discharge — a real, distinct
      // endpoint (operations/visits/{id}/discharge) from clinical
      // discharge, and a genuine front-desk action.
      "operations:visit:discharge",
    ],
    // Deliberately zero billing:* permissions. The only invoice-read
    // permission that exists (billing:invoice:read) also gates
    // facility-wide daily-reconciliation, payment-method-summary, and
    // leakage reports (billing_finance/router.py) — there is no narrower
    // split between "look up one patient's invoice" and "see the
    // Facility's revenue-leakage candidates." Route billing needs through
    // Finance/Cashier instead of granting this template broader financial
    // reporting access than the front-desk job requires.
    excludedSensitive: [
      "billing:invoice:read",
      "billing:invoice:create",
      "billing:invoice:update",
      "billing:payment:create",
      "billing:refund:create",
      "clinical:consultation:read",
    ],
    defaultWeight: 100,
  },
  {
    key: "doctor",
    version: 2,
    displayName: "Doctor",
    scopeType: "facility",
    permissionNames: [
      "clinical:consultation:read",
      "clinical:consultation:create",
      "clinical:consultation:approve",
      // Gates the AI voice-recording/transcription pipeline (attach
      // recording, combine segment transcripts, create STT job) —
      // confirmed in clinical_ai/router.py. Without this, draft:generate/
      // edit have no transcript to ever operate on; v1 omitted it and the
      // flagship AI documentation feature was unusable end to end.
      "clinical:consultation:document",
      "clinical:draft:generate",
      "clinical:draft:edit",
      // Read + review only — route/update/result stay Lab Staff-exclusive
      // (see file header: both on the merits, and to keep
      // personaLanding.ts's routing trigger valid).
      "clinical:lab:read",
      "clinical:lab:review",
      "clinical:prescription:read",
      "clinical:prescription:create",
      "clinical:prescription:update",
      "clinical:prescription:approve",
      "clinical:prescription:issue",
      // cancel was held by no template in v1 — someone has to be able to
      // cancel a prescription after issuing it (e.g. an allergic
      // reaction discovered after the fact); that's the prescriber.
      "clinical:prescription:cancel",
      "patient_mpi:clinical_history:read",
      "patient_mpi:clinical_history:create",
      "patient_mpi:clinical_history:update",
      "patient_mpi:patient:read",
      "patient_mpi:patient:update",
      // Read-only context a clinical decision often depends on: is
      // procedure consent on file, who to contact, does insurance justify
      // this treatment path.
      "patient_mpi:consent:read",
      "patient_mpi:emergency_contact:read",
      "patient_mpi:insurance:read",
      // A doctor referring a patient out was impossible in v1 — core
      // clinical work, not an edge case.
      "operations:referral:read",
      "operations:referral:create",
      "operations:referral:update",
      // Own schedule visibility — v1 had zero appointment permission.
      "operations:appointment:read",
      // Advancing their own queue (calling the next patient) — a real,
      // frequent write action, not just visibility.
      "operations:queue:read",
      "operations:queue:update",
      "operations:task:read",
      "operations:task:create",
      "operations:task:update",
      // Administrative "left before seen" discharge — kept for
      // completeness alongside Receptionist; not this template's primary
      // use case, but harmless and occasionally relevant mid-consultation.
      "operations:visit:discharge",
    ],
    excludedSensitive: ["billing:invoice:update", "users:roles:manage"],
    defaultWeight: 100,
  },
  {
    key: "lab_staff",
    version: 2,
    displayName: "Lab Staff",
    scopeType: "facility",
    permissionNames: [
      "clinical:lab:read",
      "clinical:lab:route",
      "clinical:lab:update", // collect/start/cancel
      "clinical:lab:result",
      // LabOrderResponse only carries a raw patient_id (uuid), no name —
      // without this, a real lab tech sees an unreadable ID instead of a
      // patient name during specimen handling. Confirmed against the
      // actual response schema, not assumed.
      "patient_mpi:patient:read",
      // Lab-assigned follow-ups (e.g. "redraw sample", "contact patient
      // re: recollection").
      "operations:task:read",
      "operations:task:update",
    ],
    // Explicit per spec: lab staff do NOT perform clinician result review
    // unless separately granted — clinical:lab:review is deliberately
    // absent, kept out of the bundle for clarity even though the
    // exclusion is already structurally true by omission.
    excludedSensitive: ["clinical:lab:review"],
    defaultWeight: 100,
  },
  {
    key: "finance",
    version: 2,
    displayName: "Finance / Cashier",
    scopeType: "facility",
    permissionNames: [
      // create was missing in v1 — a cashier could only read/update
      // existing invoices, never create one for a manual/miscellaneous
      // charge.
      "billing:invoice:create",
      "billing:invoice:read",
      // Closest real capability to "void" — the catalogue has no dedicated
      // void action; update is the only mutating invoice permission that
      // exists.
      "billing:invoice:update",
      "billing:payment:create",
      "billing:refund:create",
      // Owns pricing in this model — Finance can set prices, not just
      // bill against them. If pricing policy should sit with Facility
      // Manager/Owner instead, drop create/update here and leave read only.
      "operations:fee_schedule:create",
      "operations:fee_schedule:read",
      "operations:fee_schedule:update",
      // InvoiceResponse only carries a raw patient_id (uuid), no name —
      // same confirmed gap class as Lab Staff, above.
      "patient_mpi:patient:read",
      // Insurance is central to billing/claims; v1 had zero visibility
      // into it at all.
      "patient_mpi:insurance:read",
      "patient_mpi:insurance:update",
      // Tying invoices to the visit/appointment they came from.
      "operations:appointment:read",
      // Revenue-trend visibility (the product's own "Operations
      // Intelligence" module) — read-only, low risk.
      "intelligence:analytics:read",
    ],
    // The audit doc named `receipt.read`, `discount.create`, and
    // `invoice.void` for this persona. None exist in the real permission
    // catalogue (verified against all 86 rows) — there is no receipt- or
    // discount-specific permission anywhere in the backend today. Omitted
    // rather than guessed; add them here once the backend actually has a
    // matching permission, not before.
    excludedSensitive: [],
    defaultWeight: 100,
  },
  {
    key: "facility_manager",
    version: 2,
    displayName: "Facility Manager",
    scopeType: "facility",
    permissionNames: [
      // read was missing in v1 — could update the Facility but not read
      // it via the dedicated endpoint, which blocked a real facility-
      // detail/settings view for this persona.
      "tenant:facility:read",
      "tenant:facility:update",
      "tenant:department:read",
      "tenant:department:create",
      "tenant:department:update",
      // The Facility configuration save endpoint is a single upsert
      // gated only on :create (confirmed in tenant_hierarchy/router.py —
      // there is no separate :update permission for this resource), so
      // :create alone covers both first-time setup and later edits.
      "tenant:facility-configuration:read",
      "tenant:facility-configuration:create",
      "tenant:specialty:read",
      "users:profile:read",
      "operations:queue:read",
      "operations:appointment:read",
      "operations:task:read",
      "operations:referral:read",
      "billing:invoice:read",
      "intelligence:analytics:read",
      "notifications:queue:read",
    ],
    // Doctor-schedule/specialty-assignment management is deliberately
    // excluded — that capability lives entirely behind
    // users:profile:update, which also grants arbitrary profile editing
    // and admin-forced MFA reset. There is no narrower permission split
    // for "just the scheduling piece" today, so it stays Owner/Admin-only
    // until that permission is split. users:roles:manage is excluded for
    // the more usual reason (role assignment stays a higher-authority
    // action); users:roles:read (a plain read, granting neither profile
    // edits nor MFA reset) is intentionally NOT excluded — it's the
    // permission a real facility staff-roster view needs and was left out
    // of the template's granted set in this pass because it wasn't part
    // of the confirmed request, not because it's unsafe. Add it if/when a
    // roster view is actually built.
    excludedSensitive: ["users:roles:manage", "users:profile:update", "tenant:facility:delete"],
    defaultWeight: 500,
  },
  {
    key: "compliance",
    version: 2,
    displayName: "Compliance",
    scopeType: "organisation",
    permissionNames: [
      // The tenant audit-compliance router gates all four of its list
      // endpoints (audit events, login attempts, role changes,
      // cross-facility access) behind this one real permission — there is
      // no finer-grained split at the backend today.
      "audit:events:read",
      // Read-only visibility into role assignments and the permission
      // catalogue — auditing "who has what role" is core compliance work,
      // distinct from users:roles:manage (excluded below), which would
      // let them change assignments, not just review them.
      "users:roles:read",
      "users:permissions:read",
      // Resolves a user_id in an audit-log row to an actual name — without
      // this, every audit entry reads as an opaque uuid.
      "users:profile:read",
    ],
    excludedSensitive: [
      "users:roles:manage",
      "patient_mpi:patient:update",
      "patient_mpi:patient:read",
      "billing:invoice:update",
    ],
    defaultWeight: 100,
  },
];

export function findRoleTemplate(key: string): RoleTemplate | undefined {
  return ROLE_TEMPLATES.find((t) => t.key === key);
}
