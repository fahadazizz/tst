"use client";

// /queue — live patient queue board (Module 4), wired to the live API. Lists
// today's active queues; for each, shows the *active* entries (waiting/called/
// in progress) with token, position, and status. Terminal entries (completed,
// cancelled, no-show) are hidden so the board reflects who's actually in line.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ListOrdered,
  Loader2,
  RefreshCw,
  Stethoscope,
  PhoneCall,
  Play,
  CheckCircle2,
  UserX,
  XCircle,
  ArrowUpDown,
  Radio,
  CreditCard,
  LogOut,
  ReceiptText,
} from "lucide-react";
import { EmptyState, ErrorState } from "@/components/design-system/States";
import { useSession } from "@/context/session";
import { hasPermission } from "@/lib/permissions";
import { isApiError } from "@/lib/api";
import {
  listQueuesWithMeta,
  getQueueEntries,
  callNext,
  reorderQueueEntry,
  startQueueEntry,
  completeQueueEntry,
  noShowQueueEntry,
  cancelQueueEntry,
  dischargeVisit,
  type Queue,
  type QueueEntry,
} from "@/lib/api/operations";
import {
  downloadReceipt,
  getVisitInvoiceSummary,
  recordPayment,
  type PaymentReceiptResult,
  type VisitInvoiceSummary,
} from "@/lib/api/billing";
import {
  getFacilityConfiguration,
  type FacilityConfiguration,
} from "@/lib/api/tenant";
import {
  registerRealtimeTeardown,
  subscribeToQueueEvents,
} from "@/lib/realtime";
import { openConsultationRoute } from "@/lib/api/clinical";
import { getActiveTimeZone } from "@/lib/format";

const ENTRY_STYLES: Record<string, string> = {
  waiting: "bg-draft-tint text-draft",
  called: "bg-brand-tint text-brand",
  in_progress: "bg-brand-tint text-brand",
};

// Entries in a terminal state shouldn't appear on the live board.
const TERMINAL = ["completed", "cancelled", "no_show"];

export default function QueuePage() {
  const { scope } = useSession();
  const canManage = hasPermission(scope, "queue.manage");
  const canReadInvoice = hasPermission(scope, "invoice.read");
  const canCreatePayment = hasPermission(scope, "payment.create");
  // Doctors (and anyone else holding this) can reach /queue and use
  // "Start service" — it's permission-gated, not role-name-gated, per
  // roleTemplates.ts granting Doctor operations:queue:update. Without
  // this, starting service here is a dead end: status flips but nothing
  // clinical happens, and the doctor has to separately navigate to
  // /consultations and click again to actually reach the patient.
  const canOpenConsultation = hasPermission(scope, "consultation.write");

  const [queues, setQueues] = useState<Queue[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: getActiveTimeZone(),
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      // Server-side date filter now that listQueues supports it — this used
      // to fetch every queue ever created for the facility and filter to
      // "today" client-side.
      const { data, meta } = await listQueuesWithMeta({ date: today, page_size: 50 });
      setQueues(data);
      setTotalCount(meta.total_count ?? data.length);
    } catch (e) {
      setError(
        isApiError(e) && e.code === "PERMISSION_DENIED"
          ? "You don't have permission to view the queue."
          : "Couldn't load queues. Please try again.",
      );
      setQueues([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  return (
    <div className="mx-auto max-w-[1000px] px-6 py-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-[19px] font-semibold tracking-tight text-ink">
              Queue
            </h1>
            <p className="mt-0.5 text-[12.5px] text-ink-2">
              Live patient queue for this facility
              {!loading && totalCount > 0 && (
                <>
                  {" "}
                  · {totalCount} {totalCount === 1 ? "queue" : "queues"} today
                  {totalCount > queues.length && ` (showing ${queues.length})`}
                </>
              )}
            </p>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-surface-2"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-12 text-[13px] text-ink-2">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : error ? (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <ErrorState message={error} onRetry={load} />
          </div>
        ) : queues.length === 0 ? (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <EmptyState
              icon={ListOrdered}
              title="No active queues"
              description="A queue opens when a patient is added to a doctor for today. Send a checked-in patient to the queue from Appointments."
            />
          </div>
        ) : (
          queues.map((q) => (
            <QueueCard
              key={q.queue_id}
              queue={q}
              canManage={canManage}
              canReadInvoice={canReadInvoice}
              canCreatePayment={canCreatePayment}
              canOpenConsultation={canOpenConsultation}
            />
          ))
        )}
      </div>
    </div>
  );
}

function QueueCard({
  queue,
  canManage,
  canReadInvoice,
  canCreatePayment,
  canOpenConsultation,
}: {
  queue: Queue;
  canManage: boolean;
  canReadInvoice: boolean;
  canCreatePayment: boolean;
  canOpenConsultation: boolean;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [calling, setCalling] = useState(false);
  const [transport, setTransport] = useState<"sse" | "polling" | "idle">("idle");
  const [actionEntryId, setActionEntryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reorderFor, setReorderFor] = useState<string | null>(null);
  const [targetPosition, setTargetPosition] = useState("1");
  const [reorderReason, setReorderReason] = useState("");
  const [billingFor, setBillingFor] = useState<string | null>(null);
  const [dischargeFor, setDischargeFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getQueueEntries(queue.queue_id);
      // Only active entries, ordered by position.
      const active = data
        .filter(
          (e) => !TERMINAL.includes(String(e.entry_status).toLowerCase()),
        )
        .sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0));
      setEntries(active);
    } catch {
      setEntries([]);
      setError("Couldn't load queue entries.");
    } finally {
      setLoading(false);
    }
  }, [queue.queue_id]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    const subscription = subscribeToQueueEvents(queue.queue_id, {
      onEvent: () => {
        void load();
      },
      onTransportChange: setTransport,
      onError: () => {
        setTransport("polling");
      },
    });
    const unregister = registerRealtimeTeardown(subscription.close);
    return () => {
      unregister();
      subscription.close();
    };
  }, [load, queue.queue_id]);

  async function handleCallNext() {
    setCalling(true);
    try {
      const called = await callNext(queue.queue_id);
      setError(called ? null : "No waiting patient is available to call.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't call the next patient.");
    } finally {
      setCalling(false);
      load();
    }
  }

  async function runEntryAction(
    entryId: string,
    action: () => Promise<QueueEntry>,
  ) {
    setActionEntryId(entryId);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Queue action failed.");
    } finally {
      setActionEntryId(null);
    }
  }

  async function submitReorder(entryId: string) {
    const position = Number(targetPosition);
    if (!Number.isInteger(position) || position < 1) {
      setError("Target position must be 1 or greater.");
      return;
    }
    if (reorderReason.trim().length < 3) {
      setError("Reorder reason must be at least 3 characters.");
      return;
    }
    await runEntryAction(entryId, () =>
      reorderQueueEntry(entryId, {
        target_position: position,
        reason: reorderReason.trim(),
      }),
    );
    setReorderFor(null);
    setReorderReason("");
  }

  async function submitDischarge(
    entry: QueueEntry,
    reason: "left_before_consultation" | "administrative",
  ) {
    if (!entry.visit_id) {
      setError("This queue entry does not have a Visit to discharge.");
      return;
    }
    await runEntryAction(entry.entry_id, () =>
      dischargeVisit(entry.visit_id as string, { reason }).then(() => entry),
    );
    setDischargeFor(null);
  }

  const waitingCount = entries.filter(
    (e) => String(e.entry_status).toLowerCase() === "waiting",
  ).length;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-brand-tint text-brand">
            <Stethoscope size={17} />
          </span>
          <div>
            <div className="text-[13px] font-semibold text-ink">
              Dr {queue.doctor_id?.slice(0, 8)}…
            </div>
            <div className="text-[11.5px] text-ink-3">
              {queue.queue_date} · {waitingCount} waiting · {entries.length} in
              queue
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10.5px] font-medium uppercase text-ink-3 sm:inline-flex">
            <Radio size={11} />
            {transport}
          </span>
          {canManage && waitingCount > 0 && (
            <button
              onClick={handleCallNext}
              disabled={calling}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {calling ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <PhoneCall size={13} />
              )}
              Call next
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="border-b border-line bg-draft-tint px-4 py-2 text-[12px] text-draft">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 px-4 py-8 text-[12.5px] text-ink-2">
          <Loader2 size={14} className="animate-spin" /> Loading entries…
        </div>
      ) : entries.length === 0 ? (
        <div className="px-4 py-8 text-center text-[12.5px] text-ink-2">
          No patients waiting. The queue is clear.
        </div>
      ) : (
        entries.map((e) => {
          const status = String(e.entry_status).toLowerCase();
          return (
            <div key={e.entry_id} className="border-b border-line last:border-b-0">
              <div
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-lg font-mono text-[13px] font-semibold ${
                    status === "called"
                      ? "bg-brand text-white"
                      : "bg-surface-2 text-ink"
                  }`}
                >
                  {e.queue_token || e.queue_position}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-ink">
                    Patient {e.patient_id?.slice(0, 8)}…
                  </div>
                  <div className="text-[11.5px] text-ink-3">
                    {e.estimated_wait_minutes != null
                      ? `~${e.estimated_wait_minutes} min wait`
                      : "In queue"}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium capitalize ${
                    ENTRY_STYLES[status] ?? "bg-surface-2 text-ink-2"
                  }`}
                >
                  {(e.entry_status ?? "").replace(/_/g, " ")}
                </span>
                <QueueActions
                  entry={e}
                  busy={actionEntryId === e.entry_id}
                  reorderOpen={reorderFor === e.entry_id}
                  dischargeOpen={dischargeFor === e.entry_id}
                  canManage={canManage}
                  canReadInvoice={canReadInvoice}
                  targetPosition={targetPosition}
                  reorderReason={reorderReason}
                  onTargetPosition={setTargetPosition}
                  onReorderReason={setReorderReason}
                  onOpenReorder={() => {
                    setReorderFor(e.entry_id);
                    setTargetPosition(String(e.queue_position ?? 1));
                    setReorderReason("");
                  }}
                  onCancelReorder={() => setReorderFor(null)}
                  onSubmitReorder={() => submitReorder(e.entry_id)}
                  onOpenDischarge={() => setDischargeFor(e.entry_id)}
                  onCancelDischarge={() => setDischargeFor(null)}
                  onDischarge={(reason) => submitDischarge(e, reason)}
                  onBilling={() =>
                    setBillingFor((current) =>
                      current === e.entry_id ? null : e.entry_id,
                    )
                  }
                  onStart={() =>
                    runEntryAction(e.entry_id, async () => {
                      const started = await startQueueEntry(e.entry_id);
                      if (canOpenConsultation) {
                        try {
                          const path = await openConsultationRoute(started.visit_id);
                          router.push(path);
                        } catch {
                          // Start already succeeded — runEntryAction's load()
                          // below still refreshes the board to in_progress.
                          // Best-effort navigation only; the doctor can still
                          // reach /consultations manually if this fails.
                        }
                      }
                      return started;
                    })
                  }
                  onComplete={() =>
                    runEntryAction(e.entry_id, () => completeQueueEntry(e.entry_id))
                  }
                  onNoShow={() =>
                    runEntryAction(e.entry_id, () => noShowQueueEntry(e.entry_id))
                  }
                  onCancel={() =>
                    runEntryAction(e.entry_id, () => cancelQueueEntry(e.entry_id))
                  }
                />
              </div>
              {billingFor === e.entry_id && e.visit_id && (
                <QueueBillingPanel
                  visitId={e.visit_id}
                  canCreatePayment={canCreatePayment}
                />
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function QueueActions({
  entry,
  busy,
  reorderOpen,
  dischargeOpen,
  canManage,
  canReadInvoice,
  targetPosition,
  reorderReason,
  onTargetPosition,
  onReorderReason,
  onOpenReorder,
  onCancelReorder,
  onSubmitReorder,
  onOpenDischarge,
  onCancelDischarge,
  onDischarge,
  onBilling,
  onStart,
  onComplete,
  onNoShow,
  onCancel,
}: {
  entry: QueueEntry;
  busy: boolean;
  reorderOpen: boolean;
  dischargeOpen: boolean;
  canManage: boolean;
  canReadInvoice: boolean;
  targetPosition: string;
  reorderReason: string;
  onTargetPosition: (value: string) => void;
  onReorderReason: (value: string) => void;
  onOpenReorder: () => void;
  onCancelReorder: () => void;
  onSubmitReorder: () => void;
  onOpenDischarge: () => void;
  onCancelDischarge: () => void;
  onDischarge: (reason: "left_before_consultation" | "administrative") => void;
  onBilling: () => void;
  onStart: () => void;
  onComplete: () => void;
  onNoShow: () => void;
  onCancel: () => void;
}) {
  const status = String(entry.entry_status).toLowerCase();
  if (busy) {
    return <Loader2 size={14} className="animate-spin text-ink-3" />;
  }
  if (reorderOpen) {
    return (
      <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
        <input
          value={targetPosition}
          onChange={(event) => onTargetPosition(event.target.value)}
          inputMode="numeric"
          className="h-8 w-14 rounded-md border border-line bg-surface px-2 text-[12px] text-ink outline-none focus:border-brand"
          aria-label="Target queue position"
        />
        <input
          value={reorderReason}
          onChange={(event) => onReorderReason(event.target.value)}
          placeholder="Reason"
          className="h-8 w-36 rounded-md border border-line bg-surface px-2 text-[12px] text-ink outline-none placeholder:text-ink-3 focus:border-brand"
        />
        <IconButton icon={CheckCircle2} label="Save reorder" onClick={onSubmitReorder} />
        <IconButton icon={XCircle} label="Close reorder" onClick={onCancelReorder} />
      </div>
    );
  }
  if (dischargeOpen) {
    return (
      <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => onDischarge("left_before_consultation")}
          className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11.5px] font-medium text-ink-2 hover:border-brand-line hover:text-brand"
        >
          Left
        </button>
        <button
          type="button"
          onClick={() => onDischarge("administrative")}
          className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11.5px] font-medium text-ink-2 hover:border-brand-line hover:text-brand"
        >
          Admin
        </button>
        <IconButton icon={XCircle} label="Close discharge" onClick={onCancelDischarge} />
      </div>
    );
  }
  // Every action below is gated by canManage (queue.manage) or canReadInvoice
  // (invoice.read) + a linked Visit. A viewer with neither — e.g. a Doctor,
  // who acts on their own queue entries from /consultations instead — would
  // otherwise see a blank, seemingly-broken action area for an entry they
  // can see but not act on here. Say so explicitly instead of rendering
  // nothing.
  const hasAnyAction = canManage || (canReadInvoice && Boolean(entry.visit_id));
  if (!hasAnyAction) {
    return <span className="ml-auto text-[11px] text-ink-3">View only</span>;
  }
  return (
    <div className="ml-auto flex items-center justify-end gap-1">
      {canReadInvoice && entry.visit_id && (
        <IconButton icon={CreditCard} label="Visit billing" onClick={onBilling} />
      )}
      {canManage && status === "waiting" && (
        <IconButton icon={ArrowUpDown} label="Reorder" onClick={onOpenReorder} />
      )}
      {canManage && entry.visit_id && (
        <IconButton
          icon={LogOut}
          label="Discharge without care"
          onClick={onOpenDischarge}
        />
      )}
      {canManage && status === "called" && (
        <IconButton icon={Play} label="Start service" onClick={onStart} />
      )}
      {canManage && status === "in_progress" && (
        <IconButton icon={CheckCircle2} label="Complete queue service" onClick={onComplete} />
      )}
      {canManage && (status === "waiting" || status === "called") && (
        <>
          <IconButton icon={UserX} label="No-show" onClick={onNoShow} />
          <IconButton icon={XCircle} label="Cancel" onClick={onCancel} />
        </>
      )}
    </div>
  );
}

function QueueBillingPanel({
  visitId,
  canCreatePayment,
}: {
  visitId: string;
  canCreatePayment: boolean;
}) {
  const { activeFacility } = useSession();
  const [summary, setSummary] = useState<VisitInvoiceSummary | null>(null);
  const [configuration, setConfiguration] = useState<FacilityConfiguration | null>(
    null,
  );
  const [receipt, setReceipt] = useState<PaymentReceiptResult["receipt"] | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryResult, configResult] = await Promise.allSettled([
        getVisitInvoiceSummary(visitId),
        getFacilityConfiguration(activeFacility.facility_id),
      ]);
      if (summaryResult.status === "fulfilled") {
        setSummary(summaryResult.value);
        setAmount(summaryResult.value.outstanding_amount ?? "0.00");
      } else {
        throw summaryResult.reason;
      }
      if (configResult.status === "fulfilled") {
        setConfiguration(configResult.value);
      } else {
        setConfiguration(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load invoice summary.");
    } finally {
      setLoading(false);
    }
  }, [activeFacility.facility_id, visitId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  async function submitPayment() {
    if (!summary?.invoice_id) {
      setError("No invoice exists for this Visit yet.");
      return;
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Payment amount must be greater than zero.");
      return;
    }
    const key = idempotencyKey ?? newIdempotencyKey();
    setIdempotencyKey(key);
    setSubmitting(true);
    setError(null);
    try {
      const result = await recordPayment(
        summary.invoice_id,
        {
          amount,
          method,
          reference_number: reference.trim() || null,
          idempotency_key: key,
        },
        key,
      );
      setReceipt(result.receipt);
      setIdempotencyKey(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed.");
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  const paymentTiming =
    configuration?.payment_collection_timing === "postpaid" ||
    configuration?.payment_collection_timing === "on_discharge"
      ? configuration.payment_collection_timing
      : "prepaid";
  const shouldCollectNow = paymentTiming === "prepaid";
  const timingLabel =
    paymentTiming === "prepaid"
      ? "Prepaid"
      : paymentTiming === "postpaid"
        ? "Postpaid"
        : "On discharge";
  const timingMessage =
    paymentTiming === "prepaid"
      ? "Collect before consultation for this Facility."
      : paymentTiming === "postpaid"
        ? "Show payment status here; collect after clinical completion."
        : "Show payment status here; collect at discharge.";

  async function handleReceiptDownload() {
    if (!receipt) return;
    const blob = await downloadReceipt(receipt.receipt_id);
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `receipt-${receipt.receipt_number}.txt`;
    a.click();
    URL.revokeObjectURL(href);
  }

  return (
    <div className="border-t border-line bg-surface-2 px-4 py-3">
      {loading ? (
        <div className="flex items-center gap-2 text-[12px] text-ink-2">
          <Loader2 size={13} className="animate-spin" /> Loading invoice…
        </div>
      ) : error ? (
        <div className="text-[12px] text-draft">{error}</div>
      ) : summary ? (
        <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr]">
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <BillingValue label="Timing" value={timingLabel} />
            <BillingValue label="Billing" value={summary.billing_status} />
            <BillingValue label="Invoice" value={summary.invoice_status ?? "No invoice"} />
            <BillingValue
              label="Total"
              value={formatMoney(summary.total_amount, summary.currency)}
            />
            <BillingValue
              label="Outstanding"
              value={formatMoney(summary.outstanding_amount, summary.currency)}
            />
          </div>

          {receipt ? (
            <div className="rounded-lg border border-approved-line bg-approved-tint px-3 py-2 text-[12px] text-approved">
              <div className="font-medium">Receipt {receipt.receipt_number}</div>
              <div className="mt-0.5">
                {formatMoney(receipt.amount, summary.currency)} recorded.
              </div>
              <button
                type="button"
                onClick={handleReceiptDownload}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-approved-line bg-surface px-2.5 py-1.5 text-[11.5px] font-medium text-approved"
              >
                <ReceiptText size={13} />
                Receipt
              </button>
            </div>
          ) : canCreatePayment && summary.invoice_id ? (
            <div className="space-y-2">
              <div
                className={`rounded-lg border px-3 py-2 text-[12px] ${
                  shouldCollectNow
                    ? "border-brand-line bg-brand-tint text-brand"
                    : "border-line bg-surface text-ink-2"
                }`}
              >
                {timingMessage}
                {!configuration && " Facility configuration was not readable; using prepaid as the safe default."}
              </div>
              {shouldCollectNow ? (
                <div className="grid gap-2 sm:grid-cols-[1fr_120px_1fr_auto]">
                  <input
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    inputMode="decimal"
                    className="h-9 rounded-md border border-line bg-surface px-2.5 text-[12.5px] text-ink outline-none focus:border-brand"
                    aria-label="Payment amount"
                  />
                  <select
                    value={method}
                    onChange={(event) => setMethod(event.target.value)}
                    className="h-9 rounded-md border border-line bg-surface px-2.5 text-[12.5px] text-ink outline-none focus:border-brand"
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="wallet">Wallet</option>
                  </select>
                  <input
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    placeholder="Reference"
                    className="h-9 rounded-md border border-line bg-surface px-2.5 text-[12.5px] text-ink outline-none placeholder:text-ink-3 focus:border-brand"
                  />
                  <button
                    type="button"
                    onClick={submitPayment}
                    disabled={submitting}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-brand px-3 text-[12px] font-medium text-white disabled:opacity-60"
                  >
                    {submitting && <Loader2 size={13} className="animate-spin" />}
                    Record
                  </button>
                </div>
              ) : (
                <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px] text-ink-3">
                  Payment controls are held back here because this Facility is configured for later collection.
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px] text-ink-3">
              Payment collection is not available for this Visit in your current permissions or invoice state.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function BillingValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-2.5 py-2">
      <div className="text-[10.5px] font-medium uppercase tracking-wide text-ink-3">
        {label}
      </div>
      <div className="mt-1 font-medium text-ink">{value}</div>
    </div>
  );
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pay-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatMoney(value: string, currency: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${currency} ${value}`;
  return `${currency} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function IconButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-md border border-line bg-surface text-ink-2 transition-colors hover:border-brand-line hover:bg-brand-tint hover:text-brand"
    >
      <Icon size={14} />
    </button>
  );
}
