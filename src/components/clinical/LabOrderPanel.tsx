"use client";

// LabOrderPanel — lets the doctor add lab tests to the consultation, and shows
// created lab orders with their individual test items. Lab orders ride on the
// SOAP draft's proposed_lab_orders and are created on approval (the backend now
// merges draft edits, so proposals survive). A created lab order is a requisition
// containing one or more test items (e.g. CBC + malaria in one order).

import { useState } from "react";
import { FlaskConical, Plus, Loader2, TriangleAlert, X } from "lucide-react";
import {
  editDraft,
  type SoapNote,
  type ProposedLabOrder,
} from "@/lib/api/clinical";
import { isApiError } from "@/lib/api";

export function LabOrderPanel({
  consultationId,
  draft,
  labOrders,
  reload,
  disabled,
}: {
  consultationId: string;
  draft: Record<string, unknown> | null;
  labOrders: Record<string, unknown>[];
  reload: () => void;
  disabled: boolean;
}) {
  const [adding, setAdding] = useState(false);

  const proposed =
    (draft?.proposed_lab_orders as Record<string, unknown>[] | undefined) ?? [];

  const totalTests =
    labOrders.reduce(
      (n, o) => n + (((o.items as unknown[]) ?? []).length || 1),
      0,
    ) + proposed.length;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          <FlaskConical size={14} /> Lab orders ({totalTests})
        </div>
        {!disabled && draft && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[11.5px] font-medium text-ink-2 hover:bg-surface-2"
          >
            <Plus size={13} /> Add test
          </button>
        )}
      </div>

      {labOrders.length === 0 && proposed.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12.5px] text-ink-2">
          {draft
            ? "No lab tests ordered. Add one, then approve to create the order."
            : "Generate a draft first to add lab tests."}
        </div>
      ) : (
        <>
          {/* Created lab orders — each may contain several test items */}
          {labOrders.map((o, i) => {
            const items = (o.items as Record<string, unknown>[]) ?? [];
            const status = String(o.status ?? "ordered");
            return (
              <div
                key={String(o.lab_order_id ?? i)}
                className="border-b border-line px-4 py-3 last:border-b-0"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-ink-3">
                    Lab requisition
                  </span>
                  <span className="rounded bg-approved-tint px-1.5 py-0.5 text-[10.5px] font-medium capitalize text-approved">
                    {status.replace(/_/g, " ")}
                  </span>
                </div>
                {items.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {items.map((it, j) => (
                      <div
                        key={String(it.lab_order_item_id ?? j)}
                        className="flex items-center gap-2 text-[13px] text-ink"
                      >
                        <span className="size-1.5 shrink-0 rounded-full bg-brand" />
                        {String(it.test_name ?? it.test_code ?? "Test")}
                        {it.specimen_type ? (
                          <span className="text-[11.5px] text-ink-3">
                            · {String(it.specimen_type)}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[13px] text-ink">
                    {String(o.test_name ?? "Lab order")}
                  </div>
                )}
              </div>
            );
          })}

          {/* Proposed (pre-approval) tests on the draft */}
          {proposed.map((l, i) => (
            <div
              key={`proposed-${i}`}
              className="flex items-center justify-between border-b border-line px-4 py-2.5 last:border-b-0"
            >
              <span className="flex items-center gap-2 text-[13px] text-ink">
                <span className="size-1.5 shrink-0 rounded-full bg-draft" />
                {String(l.test_name ?? "Test")}
                {l.specimen_type ? (
                  <span className="text-[11.5px] text-ink-3">
                    · {String(l.specimen_type)}
                  </span>
                ) : null}
              </span>
              <span className="rounded bg-draft-tint px-1.5 py-0.5 text-[10.5px] font-medium text-draft">
                pending approval
              </span>
            </div>
          ))}
        </>
      )}

      {adding && draft && (
        <AddLabModal
          consultationId={consultationId}
          draft={draft}
          existingProposed={proposed}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function AddLabModal({
  consultationId,
  draft,
  existingProposed,
  onClose,
  onDone,
}: {
  consultationId: string;
  draft: Record<string, unknown>;
  existingProposed: Record<string, unknown>[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [testName, setTestName] = useState("");
  const [specimen, setSpecimen] = useState("");
  const [priority, setPriority] = useState("routine");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!testName.trim()) {
      setError("Test name is required.");
      return;
    }

    const soap: SoapNote = {
      subjective: (draft.subjective as string) ?? "",
      objective: (draft.objective as string) ?? "",
      assessment: (draft.assessment as string) ?? "",
      plan: (draft.plan as string) ?? "",
    };
    const newOrder: ProposedLabOrder = {
      test_name: testName.trim(),
      priority,
      ...(specimen.trim() && { specimen_type: specimen.trim() }),
      ...(reason.trim() && { reason: reason.trim() }),
    };
    const proposed_lab_orders = [
      ...(existingProposed as unknown as ProposedLabOrder[]),
      newOrder,
    ];

    setBusy(true);
    try {
      await editDraft(consultationId, String(draft.draft_id), soap, {
        proposed_lab_orders,
      });
      onDone();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Couldn't add the lab test.");
    } finally {
      setBusy(false);
    }
  }

  const cls =
    "w-full rounded-lg border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-brand";

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/30 px-4">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">Add lab test</h2>
          <button onClick={onClose} className="text-ink-3 hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[12px] text-alert">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-2">
              Test name <span className="text-alert">*</span>
            </span>
            <input value={testName} onChange={(e) => setTestName(e.target.value)} className={cls} placeholder="e.g. Complete Blood Count (CBC)" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-ink-2">Specimen</span>
              <input value={specimen} onChange={(e) => setSpecimen(e.target.value)} className={cls} placeholder="Blood" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-ink-2">Priority</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className={cls}>
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="stat">STAT</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-2">Reason</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={cls} placeholder="e.g. Rule out infection" />
          </label>
          <button type="submit" disabled={busy} className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-60">
            {busy && <Loader2 size={15} className="animate-spin" />}
            Add lab test
          </button>
        </form>
      </div>
    </div>
  );
}