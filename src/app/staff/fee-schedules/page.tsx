"use client";

// staff/fee-schedules/page.tsx — spec §9.11: active fee schedules for the
// active Facility, create, and update (amount/active-state/effective-end
// only — spec's exact list of what's editable).

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Receipt, Plus, Loader2, X, Pencil } from "lucide-react";
import { useSession } from "@/context/session";
import { hasPermission } from "@/lib/permissions";
import {
  listFeeSchedules,
  createFeeSchedule,
  updateFeeSchedule,
  type FeeSchedule,
  type FeeScheduleCreate,
} from "@/lib/api/fee-schedules";
import { listDepartments, type Department } from "@/lib/api/tenant";
import {
  listDoctorProfiles,
  type DoctorProfile,
} from "@/lib/api/staff-profiles";
import { ApiError } from "@/lib/api";
import { defaultMessageFor } from "@/lib/errors";
import { Loading, ErrorState, EmptyState } from "@/components/design-system/States";

export default function FeeSchedulesPage() {
  const { scope, activeFacility } = useSession();
  const [fees, setFees] = useState<FeeSchedule[] | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [doctors, setDoctors] = useState<DoctorProfile[]>([]);
  const [referenceError, setReferenceError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<FeeSchedule | null>(null);

  const canCreate = hasPermission(scope, "fee_schedule.create");
  const canUpdate = hasPermission(scope, "fee_schedule.update");

  function reload() {
    setLoading(true);
    setLoadError(null);
    setReferenceError(null);
    Promise.allSettled([
      listFeeSchedules(),
      listDepartments(activeFacility.facility_id),
      listDoctorProfiles(),
    ])
      .then(([feesResult, departmentsResult, doctorsResult]) => {
        if (feesResult.status === "fulfilled") {
          setFees(feesResult.value);
        } else {
          throw feesResult.reason;
        }
        if (departmentsResult.status === "fulfilled") {
          setDepartments(departmentsResult.value);
        } else {
          setDepartments([]);
          setReferenceError(departmentsResult.reason);
        }
        if (doctorsResult.status === "fulfilled") {
          setDoctors(doctorsResult.value);
        } else {
          setDoctors([]);
          setReferenceError(doctorsResult.reason);
        }
      })
      .catch(setLoadError)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    queueMicrotask(reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFacility.facility_id]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <Link
        href="/staff"
        className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-ink-3 transition-colors hover:text-ink-2"
      >
        <ArrowLeft size={13} /> Back to Staff accounts
      </Link>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-ink">Fee schedules</h1>
          <p className="mt-1 text-[13px] text-ink-2">
            Active Facility: {activeFacility.facility_name}. Appointment billing
            depends on these.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
          >
            <Plus size={14} /> New fee schedule
          </button>
        )}
      </div>

      {showCreate && (
        <FeeScheduleDialog
          mode="create"
          departments={departments}
          doctors={doctors}
          referenceError={referenceError}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            reload();
          }}
        />
      )}
      {editing && (
        <FeeScheduleDialog
          mode="edit"
          fee={editing}
          departments={departments}
          doctors={doctors}
          referenceError={referenceError}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}

      <div className="mt-6">
        {loading && <Loading label="Loading fee schedules…" />}
        {!loading && Boolean(loadError) && <ErrorState error={loadError} onRetry={reload} />}
        {!loading && !loadError && fees && fees.length === 0 && (
          <EmptyState
            icon={Receipt}
            title="No fee schedules yet"
            description={canCreate ? "Create one to enable appointment billing." : undefined}
          />
        )}
        {!loading && !loadError && fees && fees.length > 0 && (
          <div className="divide-y divide-line rounded-xl border border-line bg-surface">
            {fees.map((f) => (
              <div key={f.fee_id} className="flex items-center gap-3 px-4 py-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
                  <Receipt size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">
                    {f.appointment_type}
                  </span>
                  <span className="block truncate text-[11.5px] text-ink-3">
                    {f.amount} {f.currency}
                    {f.effective_from ? ` · from ${f.effective_from}` : ""}
                    {f.effective_to ? ` to ${f.effective_to}` : ""}
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">
                    {scopeLabel(f, departments, doctors)}
                  </span>
                </span>
                {!f.is_active && (
                  <span className="shrink-0 rounded-full border border-alert-line bg-alert-tint px-2 py-0.5 text-[10.5px] font-medium text-alert">
                    Inactive
                  </span>
                )}
                {canUpdate && (
                  <button
                    type="button"
                    onClick={() => setEditing(f)}
                    className="shrink-0 rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-2"
                    aria-label={`Edit ${f.appointment_type}`}
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FeeScheduleDialog({
  mode,
  fee,
  departments,
  doctors,
  referenceError,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  fee?: FeeSchedule;
  departments: Department[];
  doctors: DoctorProfile[];
  referenceError: unknown;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [appointmentType, setAppointmentType] = useState(fee?.appointment_type ?? "");
  const [departmentId, setDepartmentId] = useState(fee?.department_id ?? "");
  const [doctorId, setDoctorId] = useState(fee?.doctor_id ?? "");
  const [amount, setAmount] = useState(fee?.amount ?? "");
  const [currency, setCurrency] = useState(fee?.currency ?? "PKR");
  const [effectiveFrom, setEffectiveFrom] = useState(fee?.effective_from ?? "");
  const [effectiveTo, setEffectiveTo] = useState(fee?.effective_to ?? "");
  const [isActive, setIsActive] = useState(fee?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "create") {
        const payload: FeeScheduleCreate = {
          appointment_type: appointmentType.trim(),
          amount,
          currency: currency.trim().toUpperCase(),
          department_id: departmentId || null,
          doctor_id: doctorId || null,
          ...(effectiveFrom && { effective_from: effectiveFrom }),
          ...(effectiveTo && { effective_to: effectiveTo }),
        };
        await createFeeSchedule(payload);
      } else if (fee) {
        // Spec's exact editable set: amount, active state, effective end.
        await updateFeeSchedule(fee.fee_id, {
          amount,
          is_active: isActive,
          effective_to: effectiveTo || null,
        });
      }
      onSaved();
    } catch (err) {
      // Real overlapping-schedule conflict errors (409) — spec's explicit
      // "conflict display" requirement.
      setError(err instanceof ApiError ? err.message || defaultMessageFor(err) : defaultMessageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[14.5px] font-semibold text-ink">
          {mode === "create" ? "New fee schedule" : "Edit fee schedule"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-2"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>
      {error && (
        <div className="mt-3 rounded-lg border border-alert-line bg-alert-tint px-3.5 py-2.5 text-[12.5px] text-alert">
          {error}
        </div>
      )}
      {mode === "create" && Boolean(referenceError) && (
        <div className="mt-3 rounded-lg border border-alert-line bg-alert-tint px-3.5 py-2.5 text-[12.5px] text-alert">
          Department or Doctor reference data could not be loaded. You can still
          create a Facility-wide fee schedule.
        </div>
      )}
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-2">Appointment type</span>
          <input
            required
            autoFocus
            disabled={mode === "edit"}
            maxLength={50}
            value={appointmentType}
            onChange={(e) => setAppointmentType(e.target.value)}
            placeholder="e.g. consultation, follow_up"
            className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint disabled:opacity-60 placeholder:text-ink-3"
          />
        </label>
        {mode === "create" && (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-ink-2">Department scope</span>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
              >
                <option value="">All Departments</option>
                {departments.map((department) => (
                  <option key={department.department_id} value={department.department_id}>
                    {department.department_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-ink-2">Doctor scope</span>
              <select
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
              >
                <option value="">All Doctors</option>
                {doctors.map((doctor) => (
                  <option key={doctor.profile_id} value={doctor.user_id}>
                    {doctor.display_name ?? doctor.user_id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-ink-2">Amount</span>
            <input
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-ink-2">Currency</span>
            <input
              required
              disabled={mode === "edit"}
              minLength={3}
              maxLength={3}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] uppercase text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint disabled:opacity-60"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-ink-2">Effective from</span>
            <input
              type="date"
              disabled={mode === "edit"}
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint disabled:opacity-60"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-ink-2">Effective to</span>
            <input
              type="date"
              value={effectiveTo}
              onChange={(e) => setEffectiveTo(e.target.value)}
              className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
            />
          </label>
        </div>
        {mode === "edit" && (
          <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active
          </label>
        )}
        <div className="mt-1 flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {mode === "create" ? "Create" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-2"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function scopeLabel(
  fee: FeeSchedule,
  departments: Department[],
  doctors: DoctorProfile[],
): string {
  const department =
    fee.department_id
      ? (departments.find((item) => item.department_id === fee.department_id)
          ?.department_name ?? `Department ${fee.department_id.slice(0, 8)}`)
      : "All Departments";
  const doctor =
    fee.doctor_id
      ? (doctors.find((item) => item.user_id === fee.doctor_id)?.display_name ??
        `Doctor ${fee.doctor_id.slice(0, 8)}`)
      : "All Doctors";
  return `${department} · ${doctor}`;
}
