"use client";

// /appointments — appointments list + booking (Module 4), wired to the live API.
// List is visible with appointment.read; booking is gated on appointment.write
// (receptionist + admin) per RULE 3. Booking pulls bookable doctors from
// /operations/doctors/availability for the chosen date.
//
// Appointment datetimes are built via facilityLocalISO() (lib/format.ts) —
// the wall-clock date/time typed here means that time AT THE FACILITY, using
// the Facility's real timezone offset, not the browser's.

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  Plus,
  ShieldAlert,
  TriangleAlert,
  X,
  Loader2,
  Clock,
  ArrowRightCircle,
  Check,
  UserX,
} from "lucide-react";
import { RoleGate } from "@/components/design-system/RoleGate";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/design-system/States";
import { useSession } from "@/context/session";
import { hasPermission } from "@/lib/permissions";
import { isApiError, type ApiError } from "@/lib/api";
import {
  listAppointmentsWithMeta,
  createAppointment,
  getDoctorAvailability,
  checkInAppointment,
  confirmAppointment,
  cancelAppointment,
  markAppointmentNoShow,
  joinQueue,
  getQueueEntries,
  type Appointment,
  type DoctorAvailability,
  type AppointmentCreate,
  type QueueEntry,
} from "@/lib/api/operations";
import { getPatient, searchPatients, type Patient } from "@/lib/api/patients";
import { resolveBookingPatients } from "@/lib/bookingHandoff";
import { formatQueueStatus } from "@/lib/queueStatus";
import { facilityLocalISO, zonedDateKey, addDays } from "@/lib/format";

// Facility-local calendar day, not the browser's/UTC's — a receptionist
// after midnight UTC (e.g. 00:24 in Asia/Karachi, still 19:24 UTC the
// previous day) must see the facility's actual "today", not UTC's.
function todayISO() {
  return zonedDateKey(new Date().toISOString());
}

const STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-brand-tint text-brand",
  confirmed: "bg-brand-tint text-brand",
  checked_in: "bg-approved-tint text-approved",
  completed: "bg-surface-2 text-ink-2",
  cancelled: "bg-alert-tint text-alert",
  no_show: "bg-alert-tint text-alert",
};

function appointmentConflictMessage(err: ApiError): string {
  const details = err.details as
    | { suggested_alternative_slot?: unknown }
    | null
    | undefined;
  const suggested =
    typeof details?.suggested_alternative_slot === "string"
      ? details.suggested_alternative_slot
      : null;
  if (suggested) {
    const time = new Date(suggested).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${err.message} Suggested alternative: ${time}.`;
  }
  return err.message || "Some details are invalid. Check the time and try again.";
}

function prettyDateLabel(date: string): string {
  const today = todayISO();
  const tomorrow = addDays(today, 1);
  if (date === today) return "Today";
  if (date === tomorrow) return "Tomorrow";
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export default function AppointmentsPage() {
  return (
    <Suspense fallback={null}>
      <AppointmentsPageInner />
    </Suspense>
  );
}

function AppointmentsPageInner() {
  const { scope } = useSession();
  const canBook = hasPermission(scope, "appointment.write");
  const router = useRouter();
  const searchParams = useSearchParams();
  // Handoff from patient registration (patients/new/page.tsx) — a patient
  // just created there redirects here with ?patientId=&openBooking=1
  // instead of dropping the receptionist back on the patient list with no
  // path forward. Read once at mount; the modal itself owns patientId
  // state from here on.
  const [initialPatientId] = useState(() => searchParams.get("patientId"));

  const [date, setDate] = useState(todayISO());
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState(() => searchParams.get("openBooking") === "1");

  // Strip the handoff params from the URL once consumed, so a later
  // refresh (after closing without booking, or after booking succeeds)
  // doesn't silently reopen the modal.
  useEffect(() => {
    if (searchParams.get("openBooking") || searchParams.get("patientId")) {
      router.replace("/appointments");
    }
    // Intentionally run once on mount only — router/searchParams identity
    // changes on every navigation and would otherwise re-fire this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [toast, setToast] = useState<string | null>(null);
  const [busyAppointmentId, setBusyAppointmentId] = useState<string | null>(null);
  const [queueResults, setQueueResults] = useState<Record<string, QueueEntry>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, meta } = await listAppointmentsWithMeta({ date, page_size: 100 });
      setAppts(data);
      setTotalCount(meta.total_count ?? data.length);
    } catch (e) {
      setError(
        isApiError(e) && e.code === "PERMISSION_DENIED"
          ? "You don't have permission to view appointments."
          : "Couldn't load appointments. Please try again.",
      );
      setAppts([]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  // queueResults starts as a one-time snapshot from checkInAndQueue()'s own
  // joinQueue() response — accurate at the moment of check-in, but never
  // updated after. If another patient gets called ahead of them, the badge
  // would silently keep showing the original position/status forever. This
  // polls every tracked queue (getQueueEntries — same operations:queue:read
  // permission already used to view /queue) and refreshes each entry by
  // appointment_id, so the inline badge stays live instead of going stale
  // the moment anything else happens in that queue.
  useEffect(() => {
    const queueIds = [...new Set(Object.values(queueResults).map((e) => e.queue_id))];
    if (queueIds.length === 0) return;

    let cancelled = false;
    const poll = () => {
      Promise.all(queueIds.map((id) => getQueueEntries(id).catch(() => [])))
        .then((results) => {
          if (cancelled) return;
          const byAppointmentId = new Map(
            results
              .flat()
              .filter((e) => e.appointment_id)
              .map((e) => [e.appointment_id as string, e]),
          );
          setQueueResults((current) => {
            let changed = false;
            const next = { ...current };
            for (const appointmentId of Object.keys(current)) {
              const fresh = byAppointmentId.get(appointmentId);
              const prev = current[appointmentId];
              if (!fresh || !prev) continue;
              const stale =
                fresh.entry_id !== prev.entry_id ||
                fresh.entry_status !== prev.entry_status ||
                fresh.queue_position !== prev.queue_position ||
                fresh.queue_token !== prev.queue_token ||
                fresh.estimated_wait_minutes !== prev.estimated_wait_minutes;
              if (stale) {
                next[appointmentId] = fresh;
                changed = true;
              }
            }
            return changed ? next : current;
          });
        })
        .catch(() => {
          // Best-effort — the last-known snapshot stays visible rather than
          // erroring out the whole board over a transient poll failure.
        });
    };

    const interval = setInterval(poll, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [queueResults]);

  async function handleConfirm(id: string) {
    setBusyAppointmentId(id);
    setToast(null);
    try {
      await confirmAppointment(id);
      setToast("Appointment confirmed.");
    } catch (e) {
      setToast(isApiError(e) ? e.message : "Couldn't confirm appointment.");
    } finally {
      setBusyAppointmentId(null);
      void load();
    }
  }

  async function handleCancel(a: Appointment) {
    const reason = window.prompt("Cancellation reason");
    if (!reason?.trim()) return;
    setBusyAppointmentId(a.appointment_id);
    setToast(null);
    try {
      await cancelAppointment(a.appointment_id, reason.trim());
      setToast("Appointment cancelled.");
    } catch (e) {
      setToast(isApiError(e) ? e.message : "Couldn't cancel appointment.");
    } finally {
      setBusyAppointmentId(null);
      void load();
    }
  }

  async function handleNoShow(a: Appointment) {
    setBusyAppointmentId(a.appointment_id);
    setToast(null);
    try {
      await markAppointmentNoShow(a.appointment_id);
      setToast("Appointment marked no-show.");
    } catch (e) {
      setToast(isApiError(e) ? e.message : "Couldn't mark no-show.");
    } finally {
      setBusyAppointmentId(null);
      void load();
    }
  }

  async function checkInAndQueue(a: Appointment) {
    setBusyAppointmentId(a.appointment_id);
    setToast(null);
    try {
      await checkInAppointment(a.appointment_id);
      const entry = await joinQueue({
        facility_id: scope.active_facility_id,
        doctor_id: String(a.doctor_id),
        patient_id: String(a.patient_id),
        appointment_id: a.appointment_id,
      });
      setQueueResults((current) => ({ ...current, [a.appointment_id]: entry }));
      setToast(
        `Checked in and queued — token ${entry.queue_token ?? entry.queue_position}, Visit ${entry.visit_id.slice(0, 8)}…, Queue ${entry.queue_id.slice(0, 8)}….`,
      );
    } catch (e) {
      setToast(
        isApiError(e) && e.httpStatus === 409
          ? "This patient is already in the queue."
          : isApiError(e)
            ? e.message
            : "Couldn't check in and add to queue.",
      );
    } finally {
      setBusyAppointmentId(null);
      void load();
    }
  }

  const isToday = date === todayISO();
  const isTomorrow = date === addDays(todayISO(), 1);

  return (
    <div className="mx-auto max-w-[1080px] px-6 py-6">
      <RoleGate
        scope={scope}
        permission="appointment.read"
        fallback={
          <div className="flex items-start gap-3 rounded-xl border border-alert-line bg-alert-tint px-4 py-4">
            <ShieldAlert size={18} className="mt-0.5 shrink-0 text-alert" />
            <div>
              <div className="text-[13px] font-semibold text-alert">
                You don&apos;t have permission to view appointments
              </div>
              <div className="mt-0.5 text-[12.5px] text-[#7a2135]">
                This requires the <code>appointment.read</code> permission.
              </div>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {toast && (
            <div className="flex items-center gap-2 rounded-lg border border-brand-line bg-brand-tint px-3.5 py-2 text-[12.5px] text-brand">
              <Check size={14} /> {toast}
            </div>
          )}

          {/* Header */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-[19px] font-semibold tracking-tight text-ink">
                Appointments
              </h1>
              <p className="mt-0.5 text-[12.5px] text-ink-2">
                {prettyDateLabel(date)} · scheduling for this facility
              </p>
            </div>
            {canBook && (
              <button
                onClick={() => setBooking(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
              >
                <Plus size={15} />
                Book appointment
              </button>
            )}
          </div>

          {/* Date controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
              <button
                type="button"
                onClick={() => setDate(todayISO())}
                className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  isToday ? "bg-brand text-white" : "text-ink-2 hover:bg-surface-2"
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setDate(addDays(todayISO(), 1))}
                className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  isTomorrow ? "bg-brand text-white" : "text-ink-2 hover:bg-surface-2"
                }`}
              >
                Tomorrow
              </button>
            </div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
            />
            {!loading && !error && (
              <span className="ml-auto text-[12px] text-ink-3">
                {totalCount} {totalCount === 1 ? "appointment" : "appointments"}
                {totalCount > appts.length && ` (showing ${appts.length})`}
              </span>
            )}
          </div>

          {/* List */}
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            {loading ? (
              <ListSkeleton rows={5} />
            ) : error ? (
              <ErrorState message={error} onRetry={load} />
            ) : appts.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title={`No appointments for ${prettyDateLabel(date).toLowerCase()}`}
                description={
                  canBook
                    ? "Book an appointment to get the day started."
                    : "Nothing scheduled for this date."
                }
                action={
                  canBook ? (
                    <button
                      onClick={() => setBooking(true)}
                      className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white hover:opacity-90"
                    >
                      <Plus size={15} /> Book appointment
                    </button>
                  ) : undefined
                }
              />
            ) : (
              appts.map((a) => {
                const time = a.appointment_datetime
                  ? new Date(a.appointment_datetime).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—";
                return (
                  <div
                    key={a.appointment_id}
                    className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
                  >
                    <span className="flex w-16 shrink-0 flex-col items-center rounded-lg bg-surface-2 px-2 py-1.5">
                      <Clock size={13} className="text-ink-3" />
                      <span className="mt-0.5 font-mono text-[11.5px] font-medium text-ink">
                        {time}
                      </span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-ink">
                        {a.visit_reason || a.appointment_type || "Appointment"}
                      </div>
                      <div className="truncate text-[11.5px] text-ink-3">
                        Patient {a.patient_id?.slice(0, 8)}…
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium capitalize ${
                        STATUS_STYLES[a.status] ?? "bg-surface-2 text-ink-2"
                      }`}
                    >
                      {(a.status ?? "").replace(/_/g, " ")}
                    </span>
                    <AppointmentActions
                      appointment={a}
                      canManage={canBook}
                      busy={busyAppointmentId === a.appointment_id}
                      queuedEntry={queueResults[a.appointment_id]}
                      onConfirm={() => handleConfirm(a.appointment_id)}
                      onCheckInAndQueue={() => checkInAndQueue(a)}
                      onCancel={() => handleCancel(a)}
                      onNoShow={() => handleNoShow(a)}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </RoleGate>

      {booking && (
        <BookingModal
          date={date}
          initialPatientId={initialPatientId}
          onClose={() => setBooking(false)}
          onBooked={() => {
            setBooking(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function AppointmentActions({
  appointment,
  canManage,
  busy,
  queuedEntry,
  onConfirm,
  onCheckInAndQueue,
  onCancel,
  onNoShow,
}: {
  appointment: Appointment;
  canManage: boolean;
  busy: boolean;
  queuedEntry?: QueueEntry;
  onConfirm: () => void;
  onCheckInAndQueue: () => void;
  onCancel: () => void;
  onNoShow: () => void;
}) {
  if (!canManage) return <span className="w-[120px]" />;
  if (busy) {
    return (
      <span className="inline-flex w-[140px] items-center justify-end gap-1.5 text-[11.5px] text-ink-3">
        <Loader2 size={13} className="animate-spin" />
        Working
      </span>
    );
  }
  if (queuedEntry) {
    return (
      <span className="w-[180px] text-right text-[11px] text-brand">
        {formatQueueStatus(queuedEntry)}
      </span>
    );
  }
  if (appointment.status === "scheduled") {
    return (
      <div className="ml-auto flex items-center gap-1">
        <IconAction icon={Check} label="Confirm" onClick={onConfirm} />
        <IconAction
          icon={ArrowRightCircle}
          label="Check in and queue"
          onClick={onCheckInAndQueue}
        />
        <IconAction icon={UserX} label="No-show" onClick={onNoShow} />
        <IconAction icon={X} label="Cancel" onClick={onCancel} />
      </div>
    );
  }
  if (appointment.status === "confirmed") {
    return (
      <div className="ml-auto flex items-center gap-1">
        <IconAction
          icon={ArrowRightCircle}
          label="Check in and queue"
          onClick={onCheckInAndQueue}
        />
        <IconAction icon={UserX} label="No-show" onClick={onNoShow} />
        <IconAction icon={X} label="Cancel" onClick={onCancel} />
      </div>
    );
  }
  if (appointment.status === "checked_in") {
    return (
      <div className="ml-auto flex items-center gap-1">
        <IconAction
          icon={ArrowRightCircle}
          label="Send to queue"
          onClick={onCheckInAndQueue}
        />
      </div>
    );
  }
  return <span className="w-[120px]" />;
}

function IconAction({
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

function BookingModal({
  date,
  initialPatientId,
  onClose,
  onBooked,
}: {
  date: string;
  /** Carried forward from patient registration's handoff redirect
   *  (?patientId=). When present, this patient is fetched by id and
   *  pre-selected, overriding the generic "first row of the search"
   *  default below — the whole point is not making the receptionist
   *  re-search for someone they just created. */
  initialPatientId?: string | null;
  onClose: () => void;
  onBooked: () => void;
}) {
  const [doctors, setDoctors] = useState<DoctorAvailability[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(true);

  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [time, setTime] = useState("09:00");
  const [reason, setReason] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      setLoadingRefs(true);
      Promise.all([
        getDoctorAvailability(date),
        searchPatients({ limit: 100 }),
        // Fetched by id, not relied on to appear in the search page above
        // — a just-registered patient has no ordering guarantee of
        // showing up in an arbitrary 100-row result. Its own catch, not
        // the outer one: a failure here (e.g. the patient was removed
        // between redirect and modal open) should fall back to the
        // generic search below, not block doctors/patients from loading
        // at all.
        initialPatientId
          ? getPatient(initialPatientId).catch(() => null)
          : Promise.resolve(null),
      ])
        .then(([docs, pats, handoffPatient]) => {
          if (cancelled) return;
          const { patients: merged, selectedPatientId } = resolveBookingPatients(
            pats,
            handoffPatient,
          );
          setDoctors(docs);
          setPatients(merged);
          if (docs.length) setDoctorId(docs[0].doctor_id);
          if (selectedPatientId) setPatientId(selectedPatientId);
        })
        .catch(() => {
          if (!cancelled) setError("Couldn't load doctors or patients.");
        })
        .finally(() => {
          if (!cancelled) setLoadingRefs(false);
        });
      });
    return () => {
      cancelled = true;
    };
  }, [date, initialPatientId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!patientId || !doctorId) {
      setError("Select a patient and a doctor.");
      return;
    }
    const payload: AppointmentCreate = {
      patient_id: patientId,
      doctor_id: doctorId,
      appointment_type: "consultation",
      appointment_datetime: facilityLocalISO(date, time),
      ...(reason.trim() && { visit_reason: reason.trim() }),
    } as AppointmentCreate;

    setBusy(true);
    try {
      await createAppointment(payload);
      onBooked();
    } catch (err) {
      if (isApiError(err)) {
        if (err.httpStatus === 409) {
          setError(appointmentConflictMessage(err));
        } else if (err.httpStatus === 422) {
          setError(appointmentConflictMessage(err));
        } else {
          setError(err.message || "Couldn't book the appointment.");
        }
      } else {
        setError("Couldn't book the appointment.");
      }
    } finally {
      setBusy(false);
    }
  }

  const cls =
    "rounded-lg border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-brand";

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/30 px-4">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Book appointment</h2>
            <p className="text-[11.5px] text-ink-3">{prettyDateLabel(date)}</p>
          </div>
          <button onClick={onClose} className="text-ink-3 hover:text-ink">
            <X size={18} />
          </button>
        </div>

        {loadingRefs ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-ink-2">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : doctors.length === 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-draft-line bg-draft-tint px-3.5 py-3 text-[12.5px] text-draft">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" />
            No bookable doctors for {prettyDateLabel(date).toLowerCase()}. A doctor
            schedule needs to be set up before appointments can be booked.
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3.5">
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[12px] text-alert">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-ink-2">Patient</span>
              <select
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className={cls}
              >
                {patients.length === 0 && <option value="">No patients</option>}
                {patients.map((p) => (
                  <option key={p.patient_id} value={p.patient_id}>
                    {p.full_name} ({p.mrn})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-ink-2">Doctor</span>
              <select
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                className={cls}
              >
                {doctors.map((d) => (
                  <option key={d.doctor_id} value={d.doctor_id}>
                    Dr {d.doctor_id.slice(0, 8)}… · {d.waiting_count} waiting
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-ink-2">Time</span>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className={cls}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-ink-2">Type</span>
                <input value="Consultation" readOnly className={`${cls} text-ink-3`} />
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-ink-2">
                Reason (optional)
              </span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={cls}
                placeholder="e.g. Follow-up, fever…"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {busy && <Loader2 size={15} className="animate-spin" />}
              Book appointment
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
