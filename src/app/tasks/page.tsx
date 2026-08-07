"use client";

// /tasks — follow-up tasks (Operations). Uses the real task/referral-era
// backend contracts: assigned worklist, patient task history, contact attempts,
// appointment linking, completion disposition, and archive.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  archiveTask,
  completeTask,
  createTask,
  linkTaskAppointment,
  listPatientAppointments,
  listPatientTasks,
  listTaskContactAttempts,
  listTasks,
  recordTaskContactAttempt,
  startTask,
  updateTask,
  type Appointment,
  type FollowUpContactAttempt,
  type FollowUpTask,
  type TaskDisposition,
} from "@/lib/api/operations";
import {
  Archive,
  CalendarClock,
  Check,
  CheckSquare,
  ClipboardList,
  History,
  Link2,
  Loader2,
  Mail,
  Pencil,
  Play,
  Plus,
  Save,
  X,
} from "lucide-react";
import { RoleGate } from "@/components/design-system/RoleGate";
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
} from "@/components/design-system/States";
import { StatusBadge, type BadgeTone } from "@/components/design-system/StatusBadge";
import { useSession } from "@/context/session";
import { formatDateTime, zonedDateKey } from "@/lib/format";
import { isApiError } from "@/lib/api";
import { searchPatients } from "@/lib/api/patients";
import { hasPermission } from "@/lib/permissions";
import { Typeahead, type TypeaheadItem } from "@/components/operations/Typeahead";

type TaskStatusFilter = "open" | "pending" | "in_progress" | "completed" | "archived" | "all";
type DueFilter = "all" | "overdue" | "today" | "upcoming" | "none";

const STATUS_TONE: Record<string, BadgeTone> = {
  pending: "pending",
  in_progress: "active",
  completed: "approved",
  archived: "neutral",
};

const DISPOSITIONS: { value: TaskDisposition; label: string }[] = [
  { value: "appointment_scheduled", label: "Appointment scheduled" },
  { value: "patient_declined", label: "Patient declined" },
  { value: "unable_to_contact", label: "Unable to contact" },
  { value: "no_longer_required", label: "No longer required" },
  { value: "doctor_cancelled", label: "Doctor cancelled" },
];

export default function TasksPage() {
  const { scope } = useSession();
  const canRead = hasPermission(scope, "task.read");
  const canCreate = hasPermission(scope, "task.write");
  const canUpdate = hasPermission(scope, "task.update");
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>("open");
  const [dueFilter, setDueFilter] = useState<DueFilter>("all");
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientLabel, setPatientLabel] = useState("");
  const [patientItems, setPatientItems] = useState<TypeaheadItem[]>([]);

  const load = useCallback(async () => {
    if (!canRead) {
      setError("You don't have permission to view tasks.");
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const status =
        statusFilter === "all" || statusFilter === "open" ? undefined : statusFilter;
      const list = patientId
        ? await listPatientTasks(patientId)
        : await listTasks({ assigned_to: scope.user_id, status });
      setTasks(filterTasks(list, statusFilter, dueFilter));
    } catch (e) {
      setError(isApiError(e) ? e.message : "Couldn't load tasks. Please try again.");
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [canRead, dueFilter, patientId, scope.user_id, statusFilter]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  useEffect(() => {
    if (patientId || patientQuery.trim().length < 2) {
      queueMicrotask(() => setPatientItems([]));
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const results = await searchPatients({ q: patientQuery.trim(), limit: 8 });
        if (!cancelled) {
          setPatientItems(
            results.map((p) => ({ key: p.patient_id, label: p.full_name, sublabel: p.mrn })),
          );
        }
      } catch {
        if (!cancelled) setPatientItems([]);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [patientQuery, patientId]);

  const counts = useMemo(
    () => ({
      open: tasks.filter((t) => ["pending", "in_progress"].includes(t.status)).length,
      completed: tasks.filter((t) => t.status === "completed").length,
      archived: tasks.filter((t) => t.status === "archived").length,
    }),
    [tasks],
  );

  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-5 px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight text-ink">Tasks</h1>
          <p className="mt-0.5 text-[12.5px] text-ink-2">
            Follow-up worklist, contact history, and appointment closure
          </p>
        </div>
        {canCreate && (
          <RoleGate scope={scope} permission="task.write">
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
            >
              <Plus size={15} /> New task
            </button>
          </RoleGate>
        )}
      </div>

      <section className="rounded-xl border border-line bg-surface px-4 py-3">
        <div className="grid gap-3 md:grid-cols-[1fr_160px_150px]">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              Patient
            </span>
            <Typeahead
              items={patientItems}
              value={patientId ? patientLabel : patientQuery}
              onChange={(v) => {
                setPatientQuery(v);
                setPatientId(null);
              }}
              onSelect={(item) => {
                setPatientId(item.key);
                setPatientLabel(item.label);
                setPatientQuery(item.label);
              }}
              placeholder="My assigned tasks, or search a patient..."
            />
          </label>
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as TaskStatusFilter)}
            options={[
              ["open", "Open"],
              ["pending", "Pending"],
              ["in_progress", "In progress"],
              ["completed", "Completed"],
              ["archived", "Archived"],
              ["all", "All"],
            ]}
          />
          <FilterSelect
            label="Due"
            value={dueFilter}
            onChange={(value) => setDueFilter(value as DueFilter)}
            options={[
              ["all", "All"],
              ["overdue", "Overdue"],
              ["today", "Today"],
              ["upcoming", "Upcoming"],
              ["none", "No due date"],
            ]}
          />
        </div>
        {patientId && (
          <button
            type="button"
            onClick={() => {
              setPatientId(null);
              setPatientLabel("");
              setPatientQuery("");
            }}
            className="mt-2 text-[11.5px] font-medium text-brand hover:underline"
          >
            Return to my assigned worklist
          </button>
        )}
      </section>

      {loading ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ListSkeleton rows={4} />
        </div>
      ) : error ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ErrorState message={error} onRetry={load} />
        </div>
      ) : tasks.length === 0 ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <EmptyState
            icon={ClipboardList}
            title="No tasks found"
            description="Follow-up tasks matching the current filters will show up here."
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            <span>Open {counts.open}</span>
            <span>Completed {counts.completed}</span>
            <span>Archived {counts.archived}</span>
          </div>
          {tasks.map((task) => (
            <TaskRow
              key={task.task_id}
              task={task}
              reload={load}
              canUpdate={canUpdate}
            />
          ))}
        </div>
      )}

      {adding && (
        <AddTaskModal
          userId={scope.user_id}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function filterTasks(
  list: FollowUpTask[],
  statusFilter: TaskStatusFilter,
  dueFilter: DueFilter,
) {
  return list.filter((task) => {
    const status = task.status.toLowerCase();
    const statusOk =
      statusFilter === "all" ||
      (statusFilter === "open" && ["pending", "in_progress"].includes(status)) ||
      status === statusFilter;
    if (!statusOk) return false;
    if (dueFilter === "all") return true;
    if (!task.due_date) return dueFilter === "none";
    // Facility-local calendar day, not UTC's — see appointments/page.tsx for why.
    const today = zonedDateKey(new Date().toISOString());
    const due = task.due_date.slice(0, 10);
    if (dueFilter === "today") return due === today;
    if (dueFilter === "overdue") return due < today;
    if (dueFilter === "upcoming") return due > today;
    return true;
  });
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-lg border border-line-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-brand"
      >
        {options.map(([optionValue, text]) => (
          <option key={optionValue} value={optionValue}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function TaskRow({
  task,
  reload,
  canUpdate,
}: {
  task: FollowUpTask;
  reload: () => void;
  canUpdate: boolean;
}) {
  const [panel, setPanel] = useState<"history" | "contact" | "link" | "complete" | "edit" | null>(
    null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const terminal = ["completed", "archived"].includes(task.status);

  async function run(action: string, fn: () => Promise<unknown>) {
    setBusy(action);
    setError(null);
    try {
      await fn();
      setPanel(null);
      reload();
    } catch (e) {
      setError(isApiError(e) ? e.message : `Couldn't ${action}.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border-b border-line px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-lg ${
            task.status === "completed"
              ? "bg-approved-tint text-approved"
              : "bg-surface-2 text-ink-3"
          }`}
        >
          {task.status === "completed" ? <Check size={15} /> : <CheckSquare size={15} />}
        </span>
        <div className="min-w-[14rem] flex-1">
          <div className="text-[13px] text-ink">{task.instruction}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-3">
            {task.due_date && (
              <span className="inline-flex items-center gap-1">
                <CalendarClock size={12} /> Due {task.due_date.slice(0, 10)}
              </span>
            )}
            <span>{task.contact_attempt_count} contact attempts</span>
            {task.last_contact_at && <span>Last {formatDateTime(task.last_contact_at)}</span>}
            {task.resulting_appointment_id && <span>Appointment linked</span>}
          </div>
        </div>
        <StatusBadge tone={STATUS_TONE[task.status] ?? "neutral"}>
          {task.status.replaceAll("_", " ")}
        </StatusBadge>
        {!terminal && canUpdate && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {task.status === "pending" && (
              <IconButton
                label="Start"
                icon={Play}
                disabled={busy !== null}
                onClick={() => run("start the task", () => startTask(task.task_id))}
              />
            )}
            <IconButton
              label="Email attempt"
              icon={Mail}
              disabled={busy !== null}
              onClick={() => setPanel(panel === "contact" ? null : "contact")}
            />
            <IconButton
              label="History"
              icon={History}
              disabled={busy !== null}
              onClick={() => setPanel(panel === "history" ? null : "history")}
            />
            <IconButton
              label="Link appointment"
              icon={Link2}
              disabled={busy !== null}
              onClick={() => setPanel(panel === "link" ? null : "link")}
            />
            <IconButton
              label="Edit"
              icon={Pencil}
              disabled={busy !== null}
              onClick={() => setPanel(panel === "edit" ? null : "edit")}
            />
            <IconButton
              label="Complete"
              icon={Check}
              disabled={busy !== null || task.status !== "in_progress"}
              onClick={() => setPanel(panel === "complete" ? null : "complete")}
            />
            <IconButton
              label="Archive"
              icon={Archive}
              disabled={busy !== null}
              onClick={() => run("archive the task", () => archiveTask(task.task_id))}
            />
          </div>
        )}
      </div>

      {error && <div className="mt-2 text-[11px] text-alert">{error}</div>}
      {busy && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-3">
          <Loader2 size={12} className="animate-spin" /> Working...
        </div>
      )}

      {canUpdate && panel === "contact" && (
        <ContactPanel
          onSave={(notes) =>
            run("record the contact attempt", () =>
              recordTaskContactAttempt(task.task_id, { channel: "email", notes }),
            )
          }
        />
      )}
      {panel === "history" && <HistoryPanel taskId={task.task_id} />}
      {canUpdate && panel === "link" && (
        <LinkAppointmentPanel
          task={task}
          onLink={(appointmentId) =>
            run("link the appointment", () =>
              linkTaskAppointment(task.task_id, { appointment_id: appointmentId }),
            )
          }
        />
      )}
      {canUpdate && panel === "edit" && (
        <EditPanel
          task={task}
          onSave={(payload) => run("update the task", () => updateTask(task.task_id, payload))}
        />
      )}
      {canUpdate && panel === "complete" && (
        <CompletePanel
          task={task}
          onComplete={(disposition, notes, appointmentId) =>
            run("complete the task", () =>
              completeTask(task.task_id, disposition, notes, appointmentId),
            )
          }
        />
      )}
    </div>
  );
}

function IconButton({
  label,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: typeof Check;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-lg border border-line-2 bg-surface text-ink-3 hover:border-brand-line hover:text-brand disabled:cursor-not-allowed disabled:opacity-45"
    >
      <Icon size={14} />
    </button>
  );
}

function ContactPanel({ onSave }: { onSave: (notes: string) => void }) {
  const [notes, setNotes] = useState("");
  return (
    <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-ink-2">Contact notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
        />
      </label>
      <button
        type="button"
        onClick={() => onSave(notes.trim())}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[12px] font-medium text-white"
      >
        <Mail size={13} /> Record email attempt
      </button>
    </div>
  );
}

function HistoryPanel({ taskId }: { taskId: string }) {
  const [attempts, setAttempts] = useState<FollowUpContactAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await listTaskContactAttempts(taskId);
        if (!cancelled) setAttempts(list);
      } catch (e) {
        if (!cancelled) setError(isApiError(e) ? e.message : "Couldn't load contact history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  return (
    <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3">
      {loading ? (
        <div className="flex items-center gap-1.5 text-[11px] text-ink-3">
          <Loader2 size={12} className="animate-spin" /> Loading history...
        </div>
      ) : error ? (
        <div className="text-[11px] text-alert">{error}</div>
      ) : attempts.length === 0 ? (
        <div className="text-[12px] text-ink-3">No contact attempts recorded.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {attempts.map((attempt) => (
            <div key={attempt.contact_attempt_id} className="text-[12px] text-ink-2">
              <div className="font-medium text-ink">
                {attempt.outcome.replaceAll("_", " ")} · {formatDateTime(attempt.attempted_at)}
              </div>
              <div>{attempt.recipient || "No valid contact"}</div>
              {attempt.notes && <div className="text-ink-3">{attempt.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LinkAppointmentPanel({
  task,
  onLink,
}: {
  task: FollowUpTask;
  onLink: (appointmentId: string) => void;
}) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentId, setAppointmentId] = useState(task.resulting_appointment_id ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listPatientAppointments(task.patient_id);
        if (!cancelled) setAppointments(list);
      } catch (e) {
        if (!cancelled) setError(isApiError(e) ? e.message : "Couldn't load appointments.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [task.patient_id]);

  return (
    <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3">
      {loading ? (
        <div className="flex items-center gap-1.5 text-[11px] text-ink-3">
          <Loader2 size={12} className="animate-spin" /> Loading appointments...
        </div>
      ) : error ? (
        <div className="text-[11px] text-alert">{error}</div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[18rem] flex-1">
            <span className="mb-1 block text-[11px] font-medium text-ink-2">
              Resulting appointment
            </span>
            <select
              value={appointmentId}
              onChange={(e) => setAppointmentId(e.target.value)}
              className="w-full rounded-lg border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
            >
              <option value="">Select appointment</option>
              {appointments.map((appointment) => (
                <option key={appointment.appointment_id} value={appointment.appointment_id}>
                  {appointment.appointment_datetime
                    ? formatDateTime(appointment.appointment_datetime)
                    : appointment.appointment_id}{" "}
                  · {appointment.status}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!appointmentId}
            onClick={() => onLink(appointmentId)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[12px] font-medium text-white disabled:opacity-50"
          >
            <Link2 size={13} /> Link
          </button>
        </div>
      )}
    </div>
  );
}

function EditPanel({
  task,
  onSave,
}: {
  task: FollowUpTask;
  onSave: (payload: { instruction: string; due_date?: string | null }) => void;
}) {
  const [instruction, setInstruction] = useState(task.instruction);
  const [dueDate, setDueDate] = useState(task.due_date?.slice(0, 10) ?? "");
  return (
    <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3">
      <div className="grid gap-2 md:grid-cols-[1fr_150px_auto] md:items-end">
        <label>
          <span className="mb-1 block text-[11px] font-medium text-ink-2">Instruction</span>
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            className="w-full rounded-lg border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
          />
        </label>
        <label>
          <span className="mb-1 block text-[11px] font-medium text-ink-2">Due date</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-lg border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
          />
        </label>
        <button
          type="button"
          disabled={!instruction.trim()}
          onClick={() =>
            onSave({ instruction: instruction.trim(), due_date: dueDate || null })
          }
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[12px] font-medium text-white disabled:opacity-50"
        >
          <Save size={13} /> Save
        </button>
      </div>
    </div>
  );
}

function CompletePanel({
  task,
  onComplete,
}: {
  task: FollowUpTask;
  onComplete: (disposition: TaskDisposition, notes: string, appointmentId?: string) => void;
}) {
  const [disposition, setDisposition] = useState<TaskDisposition>("patient_declined");
  const [notes, setNotes] = useState("");
  const [appointmentId, setAppointmentId] = useState(task.resulting_appointment_id ?? "");
  const needsAppointment = disposition === "appointment_scheduled" && !appointmentId;

  return (
    <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3">
      <div className="grid gap-2 md:grid-cols-[220px_1fr_auto] md:items-end">
        <label>
          <span className="mb-1 block text-[11px] font-medium text-ink-2">Disposition</span>
          <select
            value={disposition}
            onChange={(e) => setDisposition(e.target.value as TaskDisposition)}
            className="w-full rounded-lg border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
          >
            {DISPOSITIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-[11px] font-medium text-ink-2">Notes</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
          />
        </label>
        <button
          type="button"
          disabled={needsAppointment}
          onClick={() => onComplete(disposition, notes.trim(), appointmentId || undefined)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-approved px-3 py-2 text-[12px] font-medium text-white disabled:opacity-50"
        >
          <Check size={13} /> Complete
        </button>
      </div>
      {disposition === "appointment_scheduled" && (
        <label className="mt-2 block">
          <span className="mb-1 block text-[11px] font-medium text-ink-2">
            Appointment ID
          </span>
          <input
            value={appointmentId}
            onChange={(e) => setAppointmentId(e.target.value)}
            placeholder="Use Link appointment first, or paste the appointment ID"
            className="w-full rounded-lg border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
          />
        </label>
      )}
    </div>
  );
}

function AddTaskModal({
  userId,
  onClose,
  onDone,
}: {
  userId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientLabel, setPatientLabel] = useState("");
  const [patientItems, setPatientItems] = useState<TypeaheadItem[]>([]);

  useEffect(() => {
    if (patientId || patientQuery.trim().length < 2) {
      queueMicrotask(() => setPatientItems([]));
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const results = await searchPatients({ q: patientQuery.trim(), limit: 8 });
        if (!cancelled) {
          setPatientItems(
            results.map((p) => ({ key: p.patient_id, label: p.full_name, sublabel: p.mrn })),
          );
        }
      } catch {
        if (!cancelled) setPatientItems([]);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [patientQuery, patientId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!patientId) {
      setError("Search for and select a patient first.");
      return;
    }
    if (!instruction.trim()) {
      setError("Describe the task first.");
      return;
    }
    setBusy(true);
    try {
      await createTask({
        patient_id: patientId,
        source: "manual",
        instruction: instruction.trim(),
        assigned_to: userId,
        ...(dueDate ? { due_date: dueDate } : {}),
      });
      onDone();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Couldn't create the task.");
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
          <h2 className="text-[15px] font-semibold text-ink">New task</h2>
          <button onClick={onClose} className="text-ink-3 hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[12px] text-alert">
              {error}
            </div>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-2">
              Patient <span className="text-alert">*</span>
            </span>
            <Typeahead
              items={patientItems}
              value={patientId ? patientLabel : patientQuery}
              onChange={(v) => {
                setPatientQuery(v);
                setPatientId(null);
              }}
              onSelect={(item) => {
                setPatientId(item.key);
                setPatientLabel(item.label);
                setPatientQuery(item.label);
              }}
              placeholder="Search patients..."
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-2">
              Task <span className="text-alert">*</span>
            </span>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={2}
              className={cls}
              placeholder="e.g. Call patient to follow up on lab results"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-2">Due date</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={cls}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            Create task
          </button>
        </form>
      </div>
    </div>
  );
}
