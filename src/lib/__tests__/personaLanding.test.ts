import { describe, it, expect } from "vitest";
import { resolvePersonaLanding } from "@/lib/personaLanding";

// Real permission sets held by each of the 6 role templates
// (roleTemplates.ts), expressed as the real backend-namespaced strings
// scope.permissions actually carries — not the UI short codes. Using short
// codes here would silently pass against the original broken resolver too,
// defeating the point of the regression tests.
const RECEPTIONIST_PERMS = [
  "patient_mpi:patient:create",
  "patient_mpi:patient:update",
  "operations:appointment:read",
  "operations:appointment:create",
  "operations:queue:read",
  "operations:queue:update",
  "billing:invoice:read",
  "billing:payment:create",
  "operations:task:update",
];

const DOCTOR_PERMS = [
  "clinical:consultation:read",
  "clinical:consultation:create",
  "clinical:consultation:approve",
  "clinical:draft:generate",
  "clinical:draft:edit",
  "clinical:lab:read",
  "clinical:lab:review",
  "clinical:prescription:read",
  "clinical:prescription:create",
  "clinical:prescription:update",
  "clinical:prescription:approve",
  "clinical:prescription:issue",
  "patient_mpi:clinical_history:read",
  "patient_mpi:clinical_history:create",
  "patient_mpi:clinical_history:update",
  "operations:task:read",
  "operations:task:update",
];

const LAB_STAFF_PERMS = [
  "clinical:lab:read",
  "clinical:lab:route",
  "clinical:lab:update",
  "clinical:lab:result",
];

const FINANCE_PERMS = [
  "billing:invoice:read",
  "billing:invoice:update",
  "billing:payment:create",
  "billing:refund:create",
];

const FACILITY_MANAGER_PERMS = [
  "tenant:facility:update",
  "tenant:department:read",
  "tenant:department:update",
  "users:profile:read",
  "operations:queue:read",
  "operations:appointment:read",
  "billing:invoice:read",
  "intelligence:analytics:read",
  "notifications:queue:read",
];

const COMPLIANCE_PERMS = ["audit:events:read"];

describe("resolvePersonaLanding", () => {
  it("resolves Compliance to /compliance", () => {
    expect(resolvePersonaLanding(COMPLIANCE_PERMS)).toBe("/compliance");
  });

  it("resolves Lab Staff to /laboratory", () => {
    expect(resolvePersonaLanding(LAB_STAFF_PERMS)).toBe("/laboratory");
  });

  it("resolves Finance to /billing", () => {
    expect(resolvePersonaLanding(FINANCE_PERMS)).toBe("/billing");
  });

  it("resolves Doctor to /consultations, not /laboratory (regression: Doctor also holds clinical:lab:read)", () => {
    expect(resolvePersonaLanding(DOCTOR_PERMS)).toBe("/consultations");
  });

  it("resolves Facility Manager to /facility-ops, not /billing (regression: Facility Manager also holds billing:invoice:read)", () => {
    expect(resolvePersonaLanding(FACILITY_MANAGER_PERMS)).toBe("/facility-ops");
  });

  it("resolves Receptionist to /front-desk, not /billing (regression: Receptionist also holds billing:invoice:read)", () => {
    expect(resolvePersonaLanding(RECEPTIONIST_PERMS)).toBe("/front-desk");
  });

  it("resolves the Organisation Owner wildcard to /dashboard, not the first rule (compliance)", () => {
    expect(resolvePersonaLanding(["*"])).toBe("/dashboard");
  });

  it("falls back to /dashboard for a permission set matching no persona rule", () => {
    expect(resolvePersonaLanding(["notifications:queue:read"])).toBe("/dashboard");
  });

  it("falls back to /dashboard for an empty permissions array", () => {
    expect(resolvePersonaLanding([])).toBe("/dashboard");
  });

  it("resolves a hybrid/multi-role account by priority order (compliance beats a co-held facility-manager permission)", () => {
    const hybrid = [...FACILITY_MANAGER_PERMS, "audit:events:read"];
    expect(resolvePersonaLanding(hybrid)).toBe("/compliance");
  });

  it("does not match a persona rule on short UI codes alone — only real backend-namespaced permission strings count", () => {
    // Guards against regressing to the original bug: comparing "audit.read"
    // (a UI short code) directly against scope.permissions instead of
    // translating through PERMISSION_MAP.
    expect(resolvePersonaLanding(["audit.read"])).toBe("/dashboard");
  });
});
