"use client";

// /laboratory — lab staff worklist and result workflow. Orders are created only
// by consultation approval; this screen intentionally does not invent a manual
// create-order path because the backend exposes none.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ClipboardCheck,
  FlaskConical,
  Loader2,
  Play,
  RefreshCw,
  Route,
  Search,
  TestTube2,
  TriangleAlert,
  X,
} from "lucide-react";
import { RoleGate } from "@/components/design-system/RoleGate";
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
} from "@/components/design-system/States";
import { useSession } from "@/context/session";
import { isApiError } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import { zonedDateKey } from "@/lib/format";
import {
  cancelLabOrder,
  collectLabOrder,
  createLabResult,
  getLabOrder,
  getLabResult,
  listLabOrders,
  listLabResults,
  reviewLabResult,
  routeLabOrder,
  startLabOrder,
  type LabOrder,
  type LabResult,
  type LabResultCreate,
} from "@/lib/api/clinical";

const ORDER_STATUSES = [
  "",
  "approved",
  "routed",
  "collected",
  "in_progress",
  "completed",
  "cancelled",
];

const INTERPRETATIONS = ["unclassified", "normal", "abnormal", "critical"];
const RESULT_STATUSES: LabResultCreate["status"][] = [
  "preliminary",
  "final",
  "amended",
];

export default function LaboratoryPage() {
  const { scope } = useSession();

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-5">
      <RoleGate
        scope={scope}
        permission="lab.read"
        fallback={
          <div className="flex items-start gap-3 rounded-xl border border-alert-line bg-alert-tint px-4 py-4">
            <TriangleAlert size={18} className="mt-0.5 shrink-0 text-alert" />
            <div>
              <div className="text-[13px] font-semibold text-alert">
                You don&apos;t have permission to view laboratory work
              </div>
              <div className="mt-0.5 text-[12.5px] text-[#7a2135]">
                This screen requires the <code>lab.read</code> permission.
              </div>
            </div>
          </div>
        }
      >
        <LaboratoryWorkspace />
      </RoleGate>
    </div>
  );
}

function LaboratoryWorkspace() {
  const { scope } = useSession();
  const canRoute = hasPermission(scope, "lab.route");
  const canUpdate = hasPermission(scope, "lab.update");
  const canResult = hasPermission(scope, "lab.result");
  const canReview = hasPermission(scope, "lab.review");

  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [results, setResults] = useState<LabResult[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<LabOrder | null>(null);
  const [selectedResult, setSelectedResult] = useState<LabResult | null>(null);
  const [status, setStatus] = useState("approved");
  // Facility-local calendar day, not UTC's — see appointments/page.tsx for why.
  const [date, setDate] = useState(() => zonedDateKey(new Date().toISOString()));
  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [resulting, setResulting] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextOrders, pendingResults] = await Promise.all([
        listLabOrders({
          status: status || null,
          date: date || null,
          patient_id: patientId.trim() || null,
          doctor_id: doctorId.trim() || null,
          page: 1,
          page_size: 100,
        }),
        listLabResults({ review_status: "pending_review", page: 1, page_size: 50 }),
      ]);
      setOrders(nextOrders);
      setResults(pendingResults);
      if (selectedOrderId) {
        const stillVisible = nextOrders.some((o) => o.lab_order_id === selectedOrderId);
        if (!stillVisible) setSelectedOrderId(null);
      }
    } catch (e) {
      setError(isApiError(e) ? e.message : "Couldn't load laboratory work.");
      setOrders([]);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [date, doctorId, patientId, selectedOrderId, status]);

  const loadOrder = useCallback(async (labOrderId: string) => {
    setDetailLoading(true);
    setSelectedResult(null);
    try {
      const [order, resultList] = await Promise.all([
        getLabOrder(labOrderId),
        listLabResults({ page: 1, page_size: 100 }),
      ]);
      setSelectedOrder(order);
      const result = resultList
        .filter((r) => r.lab_order_id === labOrderId)
        .sort(
          (a, b) =>
            new Date(b.entered_at).getTime() - new Date(a.entered_at).getTime(),
        )[0];
      setSelectedResult(result ?? null);
    } catch (e) {
      setError(isApiError(e) ? e.message : "Couldn't load lab order detail.");
      setSelectedOrder(null);
      setSelectedResult(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  useEffect(() => {
    if (!selectedOrderId) {
      queueMicrotask(() => {
        setSelectedOrder(null);
        setSelectedResult(null);
      });
      return;
    }
    queueMicrotask(() => loadOrder(selectedOrderId));
  }, [loadOrder, selectedOrderId]);

  async function transition(
    label: string,
    action: (labOrderId: string) => Promise<LabOrder>,
  ) {
    if (!selectedOrder) return;
    setBusy(label);
    setError(null);
    try {
      const next = await action(selectedOrder.lab_order_id);
      setSelectedOrder(next);
      await load();
    } catch (e) {
      setError(isApiError(e) ? e.message : `Couldn't ${label} this order.`);
      await loadOrder(selectedOrder.lab_order_id);
    } finally {
      setBusy(null);
    }
  }

  const selectedStatus = String(selectedOrder?.status ?? "").toLowerCase();
  const actions = useMemo(
    () => ({
      canRoute: canRoute && selectedStatus === "approved",
      canCollect: canUpdate && selectedStatus === "routed",
      canStart: canUpdate && selectedStatus === "collected",
      canCancel:
        canUpdate &&
        ["approved", "routed", "collected", "in_progress"].includes(selectedStatus),
      canEnterResult:
        canResult && ["collected", "in_progress"].includes(selectedStatus),
      canReview:
        canReview &&
        selectedResult &&
        String(selectedResult.review_status).toLowerCase() === "pending_review",
    }),
    [canResult, canReview, canRoute, canUpdate, selectedResult, selectedStatus],
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight text-ink">
            Laboratory
          </h1>
          <p className="mt-0.5 text-[12.5px] text-ink-2">
            Lab orders are created from approved consultations
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex flex-col gap-3">
          <div className="grid gap-2 rounded-xl border border-line bg-surface p-3 sm:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-3">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={fieldCls}
              >
                {ORDER_STATUSES.map((s) => (
                  <option key={s || "all"} value={s}>
                    {s ? s.replace(/_/g, " ") : "all statuses"}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-3">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={fieldCls}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-3">Patient ID</span>
              <input
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className={fieldCls}
                placeholder="optional UUID"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-3">Doctor ID</span>
              <input
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                className={fieldCls}
                placeholder="optional UUID"
              />
            </label>
          </div>

          {error && (
            <div className="rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[12.5px] text-alert">
              {error}
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            {loading ? (
              <ListSkeleton rows={6} />
            ) : error ? (
              <ErrorState message={error} onRetry={load} />
            ) : orders.length === 0 ? (
              <EmptyState
                icon={FlaskConical}
                title="No lab orders"
                description="Orders appear here after a doctor approves a consultation with proposed lab tests."
              />
            ) : (
              orders.map((order) => (
                <button
                  key={order.lab_order_id}
                  onClick={() => setSelectedOrderId(order.lab_order_id)}
                  className={`flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-b-0 hover:bg-surface-2 ${
                    selectedOrderId === order.lab_order_id ? "bg-brand-tint" : ""
                  }`}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-brand">
                    <TestTube2 size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-ink">
                      Patient {order.patient_id.slice(0, 8)}...
                    </div>
                    <div className="text-[11.5px] text-ink-3">
                      {(order.items ?? []).length || 1} test(s) ·{" "}
                      {order.ordered_at.slice(0, 10)}
                    </div>
                  </div>
                  <StatusPill value={order.status} />
                </button>
              ))
            )}
          </div>

          {results.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <div className="border-b border-line px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                Pending result review
              </div>
              {results.slice(0, 6).map((result) => (
                <button
                  key={result.lab_result_id}
                  onClick={() => setSelectedOrderId(result.lab_order_id)}
                  className="flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left last:border-b-0 hover:bg-surface-2"
                >
                  <ClipboardCheck size={15} className="text-ink-3" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                    Patient {result.patient_id.slice(0, 8)}... ·{" "}
                    {result.status}
                  </span>
                  <StatusPill value={result.review_status} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-line bg-surface">
          {!selectedOrderId ? (
            <EmptyState
              icon={Search}
              title="Select an order"
              description="Open a lab order to route, collect, process, enter results, or review."
            />
          ) : detailLoading ? (
            <ListSkeleton rows={5} />
          ) : selectedOrder ? (
            <div className="flex flex-col">
              <div className="border-b border-line px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-[14px] font-semibold text-ink">
                      Lab order
                    </h2>
                    <p className="mt-0.5 text-[11.5px] text-ink-3">
                      {selectedOrder.lab_order_id.slice(0, 8)} · Visit{" "}
                      {selectedOrder.visit_id.slice(0, 8)}
                    </p>
                  </div>
                  <StatusPill value={selectedOrder.status} />
                </div>
              </div>

              <div className="space-y-4 px-4 py-4">
                <InfoGrid order={selectedOrder} />
                <TestList order={selectedOrder} />
                {selectedResult && (
                  <ResultSummary
                    result={selectedResult}
                    canReview={Boolean(actions.canReview)}
                    reviewing={reviewing}
                    onReview={async (note) => {
                      setReviewing(true);
                      setError(null);
                      try {
                        const reviewed = await reviewLabResult(
                          selectedResult.lab_result_id,
                          note,
                        );
                        setSelectedResult(reviewed);
                        await load();
                      } catch (e) {
                        setError(
                          isApiError(e)
                            ? e.message
                            : "Couldn't review this result.",
                        );
                      } finally {
                        setReviewing(false);
                      }
                    }}
                  />
                )}

                <div className="flex flex-wrap gap-2">
                  {actions.canRoute && (
                    <ActionButton
                      icon={Route}
                      label="Route"
                      busy={busy === "route"}
                      onClick={() => transition("route", routeLabOrder)}
                    />
                  )}
                  {actions.canCollect && (
                    <ActionButton
                      icon={Check}
                      label="Collect"
                      busy={busy === "collect"}
                      onClick={() => transition("collect", collectLabOrder)}
                    />
                  )}
                  {actions.canStart && (
                    <ActionButton
                      icon={Play}
                      label="Start"
                      busy={busy === "start"}
                      onClick={() => transition("start", startLabOrder)}
                    />
                  )}
                  {actions.canEnterResult && (
                    <ActionButton
                      icon={ClipboardCheck}
                      label="Enter result"
                      onClick={() => setResulting(true)}
                    />
                  )}
                  {actions.canCancel && (
                    <ActionButton
                      icon={X}
                      label="Cancel"
                      busy={busy === "cancel"}
                      tone="alert"
                      onClick={() =>
                        transition("cancel", (id) =>
                          cancelLabOrder(id, "Cancelled from laboratory workspace"),
                        )
                      }
                    />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <ErrorState
              message="Couldn't load this lab order."
              onRetry={() => selectedOrderId && loadOrder(selectedOrderId)}
            />
          )}
        </div>
      </div>

      {resulting && selectedOrder && (
        <ResultEntryModal
          order={selectedOrder}
          onClose={() => setResulting(false)}
          onDone={async (result) => {
            setResulting(false);
            setSelectedResult(await getLabResult(result.lab_result_id));
            setSelectedOrder(await getLabOrder(selectedOrder.lab_order_id));
            await load();
          }}
        />
      )}
    </div>
  );
}

function InfoGrid({ order }: { order: LabOrder }) {
  const rows = [
    ["Patient", order.patient_id],
    ["Ordered by", order.ordered_by],
    ["Priority", order.priority],
    ["Ordered", order.ordered_at],
    ["Routed", order.routed_at],
    ["Collected", order.collected_at],
    ["In progress", order.in_progress_at],
    ["Completed", order.completed_at],
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-line bg-surface-2 px-3 py-2">
          <div className="text-[10.5px] uppercase tracking-wide text-ink-3">
            {label}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-ink">
            {value ? String(value).replace("T", " ").slice(0, 19) : "Not set"}
          </div>
        </div>
      ))}
    </div>
  );
}

function TestList({ order }: { order: LabOrder }) {
  const items = order.items ?? [];
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        Tests
      </div>
      {items.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface-2 px-3 py-3 text-[12px] text-ink-2">
          No item details returned for this order.
        </div>
      ) : (
        <div className="divide-y divide-line rounded-lg border border-line">
          {items.map((item) => (
            <div key={item.lab_order_item_id} className="px-3 py-2">
              <div className="text-[12.5px] font-medium text-ink">
                {item.test_name}
              </div>
              <div className="text-[11.5px] text-ink-3">
                {item.test_code ?? "No code"}
                {item.specimen_type ? ` · ${item.specimen_type}` : ""}
              </div>
              {item.instructions && (
                <div className="mt-1 text-[11.5px] text-ink-2">
                  {item.instructions}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ResultSummary({
  result,
  canReview,
  reviewing,
  onReview,
}: {
  result: LabResult;
  canReview: boolean;
  reviewing: boolean;
  onReview: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          Latest result
        </div>
        <StatusPill value={result.review_status} />
      </div>
      <div className="text-[12.5px] text-ink">
        {result.result_summary || "No summary entered."}
      </div>
      <div className="mt-2 divide-y divide-line rounded-md border border-line bg-surface">
        {(result.values ?? []).map((value) => (
          <div key={value.lab_result_value_id} className="px-3 py-2 text-[12px]">
            <span className="font-medium text-ink">{value.test_name}</span>
            <span className="text-ink-2">
              {" "}
              · {value.value_text || "No value"} {value.unit || ""}
            </span>
            {value.interpretation && (
              <span className="ml-1 text-ink-3">({value.interpretation})</span>
            )}
          </div>
        ))}
      </div>
      {canReview && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className={fieldCls}
            placeholder="Review note"
          />
          <button
            onClick={() => onReview(note)}
            disabled={reviewing}
            className="inline-flex w-fit items-center gap-2 rounded-lg bg-approved px-3 py-2 text-[12.5px] font-medium text-white disabled:opacity-60"
          >
            {reviewing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Mark reviewed
          </button>
        </div>
      )}
    </div>
  );
}

function ResultEntryModal({
  order,
  onClose,
  onDone,
}: {
  order: LabOrder;
  onClose: () => void;
  onDone: (result: LabResult) => Promise<void>;
}) {
  const items = order.items ?? [];
  const [status, setStatus] = useState<LabResultCreate["status"]>("final");
  const [summary, setSummary] = useState("");
  const [overall, setOverall] =
    useState<NonNullable<LabResultCreate["overall_interpretation"]>>(
      "unclassified",
    );
  const [values, setValues] = useState(
    items.map((item) => ({
      lab_order_item_id: item.lab_order_item_id,
      value_text: "",
      unit: "",
      reference_range_text: "",
      interpretation: "unclassified",
      notes: "",
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const filled = values.filter((v) => v.value_text.trim() || v.notes.trim());
    if (filled.length === 0) {
      setError("Enter at least one result value.");
      return;
    }
    if (status !== "preliminary" && filled.length < items.length) {
      setError("Final and amended results must cover every ordered test.");
      return;
    }
    setBusy(true);
    try {
      const result = await createLabResult(order.lab_order_id, {
        status,
        result_summary: summary.trim() || null,
        overall_interpretation: overall,
        values: filled.map((v) => ({
          lab_order_item_id: v.lab_order_item_id,
          value_text: v.value_text.trim() || null,
          unit: v.unit.trim() || null,
          reference_range_text: v.reference_range_text.trim() || null,
          interpretation: v.interpretation as "unclassified" | "normal" | "abnormal" | "critical",
          notes: v.notes.trim() || null,
        })),
      });
      await onDone(result);
    } catch (e) {
      setError(isApiError(e) ? e.message : "Couldn't save lab result.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/30 px-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl border border-line bg-surface p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">Enter result</h2>
          <button onClick={onClose} className="text-ink-3 hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error && (
            <div className="rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[12px] text-alert">
              {error}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-3">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as LabResultCreate["status"])}
                className={fieldCls}
              >
                {RESULT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-3">Overall</span>
              <select
                value={overall}
                onChange={(e) => setOverall(e.target.value as typeof overall)}
                className={fieldCls}
              >
                {INTERPRETATIONS.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-3">Summary</span>
              <input
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className={fieldCls}
                placeholder="optional"
              />
            </label>
          </div>

          <div className="divide-y divide-line rounded-lg border border-line">
            {values.map((value, index) => (
              <div key={value.lab_order_item_id} className="grid gap-2 px-3 py-3 sm:grid-cols-5">
                <div className="sm:col-span-5 text-[12.5px] font-medium text-ink">
                  {items[index]?.test_name ?? "Test"}
                </div>
                <input
                  value={value.value_text}
                  onChange={(e) =>
                    setValues((prev) =>
                      prev.map((v, i) => i === index ? { ...v, value_text: e.target.value } : v),
                    )
                  }
                  className={fieldCls}
                  placeholder="Value"
                />
                <input
                  value={value.unit}
                  onChange={(e) =>
                    setValues((prev) =>
                      prev.map((v, i) => i === index ? { ...v, unit: e.target.value } : v),
                    )
                  }
                  className={fieldCls}
                  placeholder="Unit"
                />
                <input
                  value={value.reference_range_text}
                  onChange={(e) =>
                    setValues((prev) =>
                      prev.map((v, i) => i === index ? { ...v, reference_range_text: e.target.value } : v),
                    )
                  }
                  className={fieldCls}
                  placeholder="Range"
                />
                <select
                  value={value.interpretation}
                  onChange={(e) =>
                    setValues((prev) =>
                      prev.map((v, i) => i === index ? { ...v, interpretation: e.target.value } : v),
                    )
                  }
                  className={fieldCls}
                >
                  {INTERPRETATIONS.map((i) => (
                    <option key={i} value={i}>{i}</option>
                  ))}
                </select>
                <input
                  value={value.notes}
                  onChange={(e) =>
                    setValues((prev) =>
                      prev.map((v, i) => i === index ? { ...v, notes: e.target.value } : v),
                    )
                  }
                  className={fieldCls}
                  placeholder="Notes"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-ink-2 hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Save result
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  busy,
  tone,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  busy?: boolean;
  tone?: "alert";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium disabled:opacity-60 ${
        tone === "alert"
          ? "border border-alert-line bg-alert-tint text-alert"
          : "border border-brand-line bg-brand-tint text-brand"
      }`}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
      {label}
    </button>
  );
}

function StatusPill({ value }: { value: string }) {
  const normalized = String(value || "unknown").toLowerCase();
  const cls =
    normalized === "completed" || normalized === "reviewed"
      ? "bg-approved-tint text-approved"
      : normalized === "cancelled" || normalized === "critical"
        ? "bg-alert-tint text-alert"
        : normalized === "approved" || normalized === "pending_review"
          ? "bg-draft-tint text-draft"
          : "bg-brand-tint text-brand";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-medium capitalize ${cls}`}>
      {normalized.replace(/_/g, " ")}
    </span>
  );
}

const fieldCls =
  "w-full rounded-lg border border-line-2 bg-surface px-3 py-2 text-[12.5px] text-ink outline-none focus:border-brand";
