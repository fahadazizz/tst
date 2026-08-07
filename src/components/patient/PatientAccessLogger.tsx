"use client";

// PatientAccessLogger.tsx
// RULE 4 — viewing a patient record is an audit-worthy event. This fires
// logAccess("patient.view") once on mount, enriched with the active session
// context. The real audit_events row is already written server-side by
// get_patient() on every successful fetch (same-facility included) — this
// call is a dev-only supplementary trace, not the thing that produces the
// audit row.

import { useEffect, useRef } from "react";
import { useSession } from "@/context/session";
import { logAccess } from "@/lib/access-log";

export function PatientAccessLogger({ patientId }: { patientId: string }) {
  const { scope } = useSession();
  const logged = useRef(false);

  useEffect(() => {
    if (logged.current) return;
    logged.current = true;
    logAccess("patient.view", {
      patient_id: patientId,
      user_id: scope.user_id,
      organisation_id: scope.organisation_id,
      facility_id: scope.active_facility_id,
    });
  }, [patientId, scope]);

  return null;
}
