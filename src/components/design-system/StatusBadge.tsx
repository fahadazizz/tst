// StatusBadge.tsx
// Centralised status vocabulary for the whole app. Its most important job is
// RULE 2: an AI draft must never look like an approved clinical note. The
// "ai_draft" and "approved" tones are deliberately far apart — draft is
// unmistakably provisional (amber, dashed, explicit "pending review" wording),
// approved is calm and authoritative (green, solid).

import type { ReactNode } from "react";

export type BadgeTone =
  | "ai_draft" // llm_extractions — advisory, pending clinician review
  | "approved" // consultation_notes — authoritative
  | "source" // transcripts / recordings — raw material, not the record
  | "active"
  | "pending"
  | "warning"
  | "neutral";

const TONE_CLASSES: Record<BadgeTone, string> = {
  ai_draft:
    "border border-dashed border-amber-500 bg-amber-50 text-amber-800",
  approved: "border border-emerald-600 bg-emerald-50 text-emerald-800",
  source: "border border-slate-300 bg-slate-50 text-slate-600",
  active: "border border-emerald-600 bg-emerald-50 text-emerald-800",
  pending: "border border-amber-400 bg-amber-50 text-amber-800",
  warning: "border border-rose-500 bg-rose-50 text-rose-800",
  neutral: "border border-slate-300 bg-slate-50 text-slate-600",
};

export function StatusBadge({
  tone,
  children,
}: {
  tone: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {tone === "ai_draft" && (
        <span aria-hidden className="text-[0.65rem] uppercase tracking-wide">
          AI
        </span>
      )}
      {children}
    </span>
  );
}

// Convenience for the lifecycle stages so wording stays consistent everywhere.
export function AiDraftBadge() {
  return <StatusBadge tone="ai_draft">Pending clinician review</StatusBadge>;
}

export function ApprovedNoteBadge({ version }: { version: number }) {
  return <StatusBadge tone="approved">Approved · v{version}</StatusBadge>;
}

export function SourceMaterialBadge() {
  return <StatusBadge tone="source">Source material</StatusBadge>;
}
