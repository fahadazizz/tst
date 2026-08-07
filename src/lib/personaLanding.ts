// lib/personaLanding.ts — resolves where a user lands right after login,
// based on their effective permission set (never role name — accounts can
// hold multiple roles). See docs/engineering/frontend/PERSONA_LANDING_PLAN.md
// for the investigation behind these specific trigger permissions: each one
// was cross-checked against every template in roleTemplates.ts to confirm it
// is held by exactly one persona. Do not swap a trigger for a "more obvious"
// one without redoing that check — two of the original four were wrong and
// silently misrouted 3 of 6 personas.

import { PERMISSION_MAP } from "@/lib/permissions";
import type { PermissionCode } from "@/types/schema";

export interface PersonaLandingRule {
  key: string;
  route: string;
  /** ALL of these UI short codes must be held (via PERMISSION_MAP) to match. */
  requires: PermissionCode[];
}

export const PERSONA_LANDING_RULES: PersonaLandingRule[] = [
  { key: "compliance", route: "/compliance", requires: ["audit.read"] },
  { key: "lab_staff", route: "/laboratory", requires: ["lab.route"] },
  { key: "finance", route: "/billing", requires: ["refund.create"] },
  { key: "doctor", route: "/consultations", requires: ["consultation.read"] },
  { key: "facility_manager", route: "/facility-ops", requires: ["facility.update"] },
  {
    key: "receptionist",
    route: "/front-desk",
    requires: ["patient.register", "appointment.write"],
  },
];

export function resolvePersonaLanding(permissions: string[]): string {
  // Organisation Owner (wildcard) always gets the org-wide view, never a
  // persona page — hasPermission()'s wildcard bypass would otherwise match
  // the FIRST rule checked (compliance) for every Owner account.
  if (permissions.includes("*")) return "/dashboard";

  const held = new Set(permissions);
  const holdsShortCode = (code: PermissionCode) =>
    (PERMISSION_MAP[code] ?? []).some((real) => held.has(real));

  for (const rule of PERSONA_LANDING_RULES) {
    if (rule.requires.every(holdsShortCode)) return rule.route;
  }
  return "/dashboard";
}
