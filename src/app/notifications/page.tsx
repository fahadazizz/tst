"use client";

import { useCallback, useEffect, useState } from "react";
import {
  enqueueNotification,
  getNotification,
  listNotificationOutbox,
  listNotifications,
  processNotificationOutbox,
  type Notification,
  type OutboxEvent,
} from "@/lib/api/notifications";
import { isApiError } from "@/lib/api";
import { useSession } from "@/context/session";
import { hasPermission } from "@/lib/permissions";
import { facilityLocalISO, formatDateTime } from "@/lib/format";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/design-system/States";
import { StatusBadge, type BadgeTone } from "@/components/design-system/StatusBadge";
import { Bell, Loader2, Play, Plus, RefreshCw, Search } from "lucide-react";

type StatusFilter = "" | "pending" | "retry" | "delivered" | "failed" | "cancelled";

const STATUS_TONE: Record<string, BadgeTone> = {
  pending: "pending",
  retry: "warning",
  delivered: "approved",
  failed: "warning",
  cancelled: "neutral",
  completed: "approved",
  processing: "active",
  dead_letter: "warning",
};

export default function NotificationsPage() {
  const { scope } = useSession();
  const canRead = hasPermission(scope, "notification.read");
  const canCreate = hasPermission(scope, "notification.create");
  const canUpdate = hasPermission(scope, "notification.update");
  const [items, setItems] = useState<Notification[]>([]);
  const [outbox, setOutbox] = useState<OutboxEvent[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState<number | null>(null);
  const [status, setStatus] = useState<StatusFilter>("");
  const [patientId, setPatientId] = useState("");
  const [notificationId, setNotificationId] = useState("");
  const [detailId, setDetailId] = useState("");
  const [detail, setDetail] = useState<Notification | null>(null);
  const [processed, setProcessed] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    try {
      const [queueResult, outboxResult] = await Promise.all([
        listNotifications({
          patient_id: patientId.trim() || undefined,
          notification_id: notificationId.trim() || undefined,
          status: status || undefined,
          page,
          page_size: pageSize,
        }),
        listNotificationOutbox(),
      ]);
      setItems(queueResult.data);
      setTotal(
        typeof queueResult.meta.total_count === "number"
          ? queueResult.meta.total_count
          : null,
      );
      setOutbox(outboxResult);
    } catch (e) {
      setError(isApiError(e) ? e.message : "Couldn't load notifications.");
    } finally {
      setLoading(false);
    }
  }, [canRead, notificationId, page, pageSize, patientId, status]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  async function loadDetail() {
    if (!detailId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setDetail(await getNotification(detailId.trim()));
    } catch (e) {
      setError(isApiError(e) ? e.message : "Couldn't load notification.");
    } finally {
      setLoading(false);
    }
  }

  async function processOutbox() {
    if (!window.confirm("Process currently due outbox events for this facility?")) return;
    setLoading(true);
    setError(null);
    try {
      const result = await processNotificationOutbox();
      setProcessed(result.processed);
      await load();
    } catch (e) {
      setError(isApiError(e) ? e.message : "Couldn't process outbox.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-5 px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight text-ink">
            Notifications
          </h1>
          <p className="mt-0.5 text-[12.5px] text-ink-2">
            Queue status, detail lookup, outbox ledger, and manual processing
          </p>
        </div>
        {canUpdate && (
          <button
            type="button"
            onClick={processOutbox}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white disabled:opacity-60"
          >
            <Play size={14} /> Process outbox
          </button>
        )}
      </div>

      {!canRead ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ErrorState
            title="Access denied"
            message="You don't have permission to view notifications."
          />
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-line bg-surface p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_150px_120px_auto] md:items-end">
              <TextInput label="Patient ID" value={patientId} onChange={setPatientId} />
              <TextInput
                label="Notification ID"
                value={notificationId}
                onChange={setNotificationId}
              />
              <label>
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  Status
                </span>
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value as StatusFilter);
                    setPage(1);
                  }}
                  className="h-10 w-full rounded-lg border border-line-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-brand"
                >
                  <option value="">All</option>
                  <option value="pending">Pending</option>
                  <option value="retry">Retry</option>
                  <option value="delivered">Delivered</option>
                  <option value="failed">Failed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
              <label>
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  Page size
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="h-10 w-full rounded-lg border border-line-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-brand"
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand px-3.5 text-[12.5px] font-medium text-white disabled:opacity-60"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Refresh
              </button>
            </div>
            {error && <div className="mt-3 text-[12px] text-alert">{error}</div>}
            {processed !== null && (
              <div className="mt-3 text-[12px] text-ink-3">
                Processed {processed} due outbox events.
              </div>
            )}
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-semibold text-ink">Queue</h2>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={page === 1}
                    onClick={() => setPage(Math.max(1, page - 1))}
                    className="rounded-lg border border-line-2 px-2.5 py-1 text-[11.5px] text-ink-2 disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={total !== null && page * pageSize >= total}
                    onClick={() => setPage(page + 1)}
                    className="rounded-lg border border-line-2 px-2.5 py-1 text-[11.5px] text-ink-2 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
              {loading && items.length === 0 ? (
                <ListSkeleton rows={4} />
              ) : items.length === 0 ? (
                <EmptyState icon={Bell} title="No notifications found" />
              ) : (
                <div className="flex flex-col gap-2">
                  {items.map((item) => (
                    <NotificationRow key={item.notification_id} item={item} />
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4">
              {canCreate && <EnqueueForm onCreated={load} />}
              <section className="rounded-xl border border-line bg-surface p-4">
                <h2 className="mb-3 text-[13px] font-semibold text-ink">Detail</h2>
                <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                  <input
                    value={detailId}
                    onChange={(e) => setDetailId(e.target.value)}
                    placeholder="Notification ID"
                    className="h-10 rounded-lg border border-line-2 bg-surface px-3 text-[13px] text-ink outline-none focus:border-brand"
                  />
                  <button
                    type="button"
                    onClick={loadDetail}
                    disabled={!detailId.trim() || loading}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand px-3.5 text-[12.5px] font-medium text-white disabled:opacity-50"
                  >
                    <Search size={14} /> Load
                  </button>
                </div>
                {detail && <div className="mt-3"><NotificationRow item={detail} /></div>}
              </section>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-3 text-[13px] font-semibold text-ink">Outbox</h2>
            {outbox.length === 0 ? (
              <div className="text-[12px] text-ink-3">No outbox events returned.</div>
            ) : (
              <div className="grid gap-2 lg:grid-cols-2">
                {outbox.map((event) => (
                  <div key={event.event_id} className="rounded-lg border border-line bg-surface-2 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-[12.5px] font-medium text-ink">
                        {event.event_type}
                      </div>
                      <StatusBadge tone={STATUS_TONE[event.status] ?? "neutral"}>
                        {event.status.replaceAll("_", " ")}
                      </StatusBadge>
                    </div>
                    <div className="mt-1 text-[11.5px] text-ink-3">
                      {event.aggregate_type} · {event.attempts}/{event.max_attempts} · {formatDateTime(event.created_at)}
                    </div>
                    {event.last_error && (
                      <div className="mt-1 text-[11.5px] text-alert">{event.last_error}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function NotificationRow({ item }: { item: Notification }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-[12.5px] font-medium text-ink">
          {item.template_key}
        </div>
        <StatusBadge tone={STATUS_TONE[item.status] ?? "neutral"}>
          {item.status.replaceAll("_", " ")}
        </StatusBadge>
      </div>
      <div className="mt-1 text-[11.5px] text-ink-3">
        {item.channel} · {item.recipient} · {item.attempts}/{item.max_attempts}
      </div>
      <div className="mt-1 truncate font-mono text-[11px] text-ink-3">
        {item.notification_id}
      </div>
      {item.last_error && <div className="mt-1 text-[11.5px] text-alert">{item.last_error}</div>}
    </div>
  );
}

function EnqueueForm({ onCreated }: { onCreated: () => void }) {
  const [templateKey, setTemplateKey] = useState("");
  const [channel, setChannel] = useState("email");
  const [language, setLanguage] = useState("en");
  const [recipient, setRecipient] = useState("");
  const [patientId, setPatientId] = useState("");
  const [maxAttempts, setMaxAttempts] = useState("3");
  const [scheduledAt, setScheduledAt] = useState("");
  const [payload, setPayload] = useState("{}");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await enqueueNotification({
        template_key: templateKey.trim(),
        channel,
        language: language.trim() || "en",
        recipient: recipient.trim(),
        patient_id: patientId.trim() || null,
        payload: payload.trim() ? JSON.parse(payload) : {},
        max_attempts: Math.max(1, Math.min(10, Number(maxAttempts) || 3)),
        scheduled_at: scheduledAt ? localDateTimeInputToIso(scheduledAt) : null,
      });
      setTemplateKey("");
      setLanguage("en");
      setRecipient("");
      setPatientId("");
      setMaxAttempts("3");
      setScheduledAt("");
      setPayload("{}");
      onCreated();
    } catch (err) {
      setError(
        err instanceof SyntaxError
          ? "Payload must be valid JSON."
          : isApiError(err)
            ? err.message
            : "Couldn't enqueue notification.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <Plus size={15} className="text-brand" />
        <h2 className="text-[13px] font-semibold text-ink">Enqueue</h2>
      </div>
      <div className="flex flex-col gap-2">
        <TextInput label="Template key" value={templateKey} onChange={setTemplateKey} required />
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="mb-1 block text-[11px] font-medium text-ink-2">Channel</span>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="h-9 w-full rounded-lg border border-line-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-brand"
            >
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </label>
          <TextInput label="Language" value={language} onChange={setLanguage} required />
        </div>
        <TextInput label="Recipient" value={recipient} onChange={setRecipient} required />
        <TextInput label="Patient ID" value={patientId} onChange={setPatientId} />
        <div className="grid grid-cols-2 gap-2">
          <TextInput
            label="Max attempts"
            value={maxAttempts}
            onChange={setMaxAttempts}
            required
          />
          <label>
            <span className="mb-1 block text-[11px] font-medium text-ink-2">
              Scheduled at
            </span>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="h-9 w-full rounded-lg border border-line-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-brand"
            />
          </label>
        </div>
        <label>
          <span className="mb-1 block text-[11px] font-medium text-ink-2">Payload JSON</span>
          <textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-line-2 bg-surface px-2.5 py-2 text-[13px] text-ink outline-none focus:border-brand"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="mt-1 inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-brand px-3 text-[12.5px] font-medium text-white disabled:opacity-50"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          Enqueue
        </button>
      </div>
      {error && <div className="mt-3 text-[12px] text-alert">{error}</div>}
    </form>
  );
}

function localDateTimeInputToIso(value: string) {
  const [date, time] = value.split("T");
  return date && time ? facilityLocalISO(date, time) : value;
}

function TextInput({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label>
      <span className="mb-1 block text-[11px] font-medium text-ink-2">{label}</span>
      <input
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-line-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-brand"
      />
    </label>
  );
}
