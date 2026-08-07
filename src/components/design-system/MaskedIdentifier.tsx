"use client";

// MaskedIdentifier.tsx
// RULE 1 — identifiers are masked by default with an explicit reveal action.
// Reveal is an audit-worthy event, so it routes through logAccess.
// Use this everywhere a CNIC / passport / MRN would otherwise appear as plain
// text. Do not print raw identifiers in list/table cells — pass allowReveal
// only where a single record is already in focus.

import { useState } from "react";
import type { IdentifierType, PatientIdentifier } from "@/types/schema";
import { identifierLabel, maskIdentifier } from "@/lib/mask";
import { logAccess, type AccessEventContext } from "@/lib/access-log";

export function MaskedIdentifier({
  identifier,
  allowReveal = true,
  label,
  logContext,
}: {
  // identifier_type is optional so this can also mask the patient's `mrn`
  // field (a first-class column, not a patient_identifiers row) with a label
  // override — MRN is Rule-1 high-risk too.
  identifier: Pick<PatientIdentifier, "identifier_value" | "patient_id" | "organisation_id"> & {
    identifier_type?: IdentifierType;
  };
  allowReveal?: boolean;
  label?: string;
  logContext?: AccessEventContext;
}) {
  const [revealed, setRevealed] = useState(false);

  const shown = revealed
    ? identifier.identifier_value
    : maskIdentifier(identifier.identifier_value);

  const onReveal = () => {
    logAccess("identifier.reveal", {
      patient_id: identifier.patient_id,
      organisation_id: identifier.organisation_id,
      identifier_type: identifier.identifier_type,
      ...logContext,
    });
    setRevealed(true);
  };

  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label ?? identifierLabel(identifier.identifier_type ?? "other")}
      </span>
      <span className="font-mono tabular-nums text-slate-800">{shown}</span>
      {allowReveal &&
        (revealed ? (
          <button
            type="button"
            onClick={() => setRevealed(false)}
            className="text-xs text-slate-500 underline underline-offset-2 hover:text-slate-700"
          >
            Hide
          </button>
        ) : (
          <button
            type="button"
            onClick={onReveal}
            className="text-xs text-slate-500 underline underline-offset-2 hover:text-slate-700"
          >
            Reveal
          </button>
        ))}
    </span>
  );
}
