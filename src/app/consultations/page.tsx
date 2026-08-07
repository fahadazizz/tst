"use client";

// /consultations — the doctor's entry point. There is no "list my consultations"
// endpoint; consultations are reached through the doctor's live queue. This page
// shows the doctor's active queue (waiting patients) and lets them open a
// consultation for each — creating one from the visit if it doesn't exist yet,
// then navigating to the workspace.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Stethoscope,
  Loader2,
  TriangleAlert,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { isApiError } from "@/lib/api";
import { getMyActiveQueue, openConsultationRoute } from "@/lib/api/clinical";
import {
  getQueueEntries,
  startQueueEntry,
  type QueueEntry,
} from "@/lib/api/operations";

const STATUS_STYLES: Record<string, string> = {
  waiting: "bg-[#fdf6ec] text-draft",
  called: "bg-brand-tint text-brand",
  in_progress: "bg-brand-tint text-brand",
  completed: "bg-[#e6f4ea] text-approved",
};

export default function ConsultationsPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [resuming, setResuming] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const queue = await getMyActiveQueue();
      if (!queue) {
        setEntries([]);
        return;
      }
      const qid = String((queue as Record<string, unknown>).queue_id);
      const list = await getQueueEntries(qid);
      const active = list
        .filter(
          (e) =>
            !["completed", "cancelled", "no_show"].includes(
              String(e.entry_status).toLowerCase(),
            ),
        )
        .sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0));
      setEntries(active);
    } catch (e) {
      setError(
        isApiError(e) && e.code === "PERMISSION_DENIED"
          ? "You don't have permission to view the queue."
          : "Couldn't load your queue. Please try again.",
      );
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  async function openConsultation(entry: QueueEntry) {
    const entryStatus = String(entry.entry_status).toLowerCase();
    if (!["called", "in_progress"].includes(entryStatus)) {
      setError("Reception must call the patient before service can start.");
      return;
    }

    setOpening(entry.entry_id);
    setError(null);
    try {
      let activeEntry = entry;
      if (entryStatus === "called") {
        setResuming("Starting service…");
        activeEntry = await startQueueEntry(entry.entry_id);
      }

      setResuming("Opening consultation…");
      const path = await openConsultationRoute(String(activeEntry.visit_id));
      router.push(path);
    } catch (e) {
      // A completed visit already had its consultation — it can't be reopened
      // for a new one. Explain rather than showing a raw state error.
      const msg =
        isApiError(e) &&
        (e.code === "CONFLICT_STATE_MISMATCH" ||
          /completed|in_consultation/i.test(e.message))
          ? "This patient has already been seen — their consultation is complete."
          : isApiError(e)
            ? e.message
            : "Couldn't open the consultation. Please try again.";
      setError(msg);
      setOpening(null);
      setResuming(null);
    }
  }

  return (
    <div className="mx-auto max-w-[900px] px-6 py-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">
            Consultations
          </h1>
          <p className="mt-0.5 text-[12.5px] text-ink-2">
            Your patient queue for today
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
        {resuming && (
          <div className="flex items-center gap-2 border-b border-line bg-brand-tint px-4 py-2 text-[12px] text-brand">
            <Loader2 size={13} className="animate-spin" /> {resuming}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-12 text-[13px] text-ink-2">
            <Loader2 size={16} className="animate-spin" /> Loading your queue…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2 px-4 py-12 text-[13px] text-alert">
            <TriangleAlert size={16} /> {error}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-14 text-center text-[13px] text-ink-2">
            <Stethoscope size={22} className="text-ink-3" />
            <div>No patients in your queue.</div>
            <div className="text-[12px] text-ink-3">
              When reception adds a patient to your queue, they&apos;ll appear
              here to start a consultation.
            </div>
          </div>
        ) : (
          entries.map((e) => {
            const entryStatus = String(e.entry_status).toLowerCase();
            const canOpen = ["called", "in_progress"].includes(entryStatus);
            return (
            <button
              key={e.entry_id}
              onClick={() => openConsultation(e)}
              disabled={opening !== null || !canOpen}
              className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-2 disabled:opacity-60"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 font-mono text-[13px] font-semibold text-ink">
                {e.queue_token || e.queue_position}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-ink">
                  Patient {String(e.patient_id).slice(0, 8)}…
                </div>
                <div className="text-[11.5px] text-ink-3">
                  {!canOpen
                    ? "Waiting for reception to call"
                    : e.estimated_wait_minutes != null
                    ? `~${e.estimated_wait_minutes} min wait`
                    : "Ready for service"}
                </div>
              </div>
              <span
                className={`rounded px-1.5 py-0.5 text-[10.5px] font-medium capitalize ${
                  STATUS_STYLES[String(e.entry_status).toLowerCase()] ??
                  "bg-surface-2 text-ink-2"
                }`}
              >
                {String(e.entry_status).replace(/_/g, " ")}
              </span>
              {opening === e.entry_id ? (
                <Loader2 size={16} className="shrink-0 animate-spin text-ink-3" />
              ) : (
                <ChevronRight size={16} className="shrink-0 text-ink-3" />
              )}
            </button>
            );
          })
        )}
      </div>
    </div>
  );
}
