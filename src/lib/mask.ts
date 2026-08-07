// mask.ts
// RULE 1 — patient identifiers (CNIC / passport / MRN) are masked by default.
// The raw value is only ever revealed through an explicit user action, which is
// itself an audit-worthy event (see access-log.ts).

import type { IdentifierType } from "@/types/schema";

// Keep a short, recognisable tail so staff can confirm the right record without
// exposing the full value. Never show the full identifier unmasked in a list.
export function maskIdentifier(value: string, visibleTail = 1): string {
  const trimmed = value.trim();
  if (trimmed.length <= visibleTail) return "•".repeat(trimmed.length || 4);

  // Preserve grouping punctuation (e.g. CNIC dashes) so the shape stays familiar.
  const chars = [...trimmed];
  const keepFrom = chars.length - visibleTail;
  return chars
    .map((ch, i) => {
      if (i >= keepFrom) return ch;
      return /[\s-]/.test(ch) ? ch : "•";
    })
    .join("");
}

export function identifierLabel(type: IdentifierType): string {
  switch (type) {
    case "cnic":
      return "CNIC";
    case "passport":
      return "Passport";
    case "mrn_external":
      return "External MRN";
    case "insurance":
      return "Insurance ID";
    default:
      return "Identifier";
  }
}
