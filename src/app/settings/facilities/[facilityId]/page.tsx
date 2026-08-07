"use client";

// settings/facilities/[facilityId]/page.tsx — spec §9.2/§9.3: Facility setup
// overview (identity + configuration + departments in one boot request),
// edit, configuration, and deactivation.

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  MapPinned,
  Settings2,
  Building,
  Loader2,
  TriangleAlert,
  Plus,
  X,
  Pencil,
} from "lucide-react";
import { useSession } from "@/context/session";
import { hasPermission } from "@/lib/permissions";
import {
  getFacilitySetupOverview,
  updateFacility,
  deactivateFacility,
  saveFacilityConfiguration,
  listSpecialties,
  createDepartment,
  updateDepartment,
  type FacilitySetupOverview,
  type Facility,
  type FacilityUpdate,
  type FacilityConfiguration,
  type Department,
  type Specialty,
} from "@/lib/api/tenant";
import { ApiError } from "@/lib/api";
import { defaultMessageFor, parseValidationErrorsByField } from "@/lib/errors";
import { Loading, ErrorState } from "@/components/design-system/States";

const FACILITY_TYPES = [
  "hospital",
  "clinic",
  "pharmacy",
  "lab",
  "diagnostic_centre",
  "other",
] as const;

const PAYMENT_TIMINGS = ["prepaid", "postpaid", "on_discharge"] as const;

export default function FacilityDetailPage() {
  const params = useParams<{ facilityId: string }>();
  const facilityId = params.facilityId;
  const { scope } = useSession();

  const [overview, setOverview] = useState<FacilitySetupOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  function reload() {
    setLoading(true);
    setLoadError(null);
    getFacilitySetupOverview(facilityId)
      .then(setOverview)
      .catch(setLoadError)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    queueMicrotask(reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilityId]);

  const canUpdate = hasPermission(scope, "facility.update");
  const canDelete = hasPermission(scope, "facility.delete");
  const canConfigure =
    hasPermission(scope, "facility_configuration.read") ||
    hasPermission(scope, "facility_configuration.write");

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <Link
        href="/settings/facilities"
        className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-ink-3 transition-colors hover:text-ink-2"
      >
        <ArrowLeft size={13} /> Back to Facilities
      </Link>

      {loading && <Loading label="Loading Facility…" />}
      {!loading && Boolean(loadError) && <ErrorState error={loadError} onRetry={reload} />}

      {!loading && !loadError && overview && (
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight text-ink">
              {overview.facility.facility_name}
            </h1>
            <p className="mt-1 text-[13px] text-ink-2">
              {overview.facility.facility_type} · {overview.facility.is_active ? "Active" : "Deactivated"}
            </p>
          </div>

          <FacilityForm
            facility={overview.facility}
            editable={canUpdate}
            onSaved={(f) => setOverview((o) => (o ? { ...o, facility: f } : o))}
          />

          {canConfigure && (
            <ConfigurationForm
              facilityId={facilityId}
              configuration={overview.configuration}
              editable={hasPermission(scope, "facility_configuration.write")}
              onSaved={(c) => setOverview((o) => (o ? { ...o, configuration: c } : o))}
            />
          )}

          <DepartmentsCard
            facilityId={facilityId}
            departments={overview.departments}
            canCreate={hasPermission(scope, "department.create")}
            canUpdate={hasPermission(scope, "department.update")}
            onChanged={(departments) =>
              setOverview((o) => (o ? { ...o, departments } : o))
            }
          />

          {canDelete && overview.facility.is_active && (
            <DeactivateFacilityCard facilityId={facilityId} />
          )}
        </div>
      )}
    </div>
  );
}

function FacilityForm({
  facility,
  editable,
  onSaved,
}: {
  facility: Facility;
  editable: boolean;
  onSaved: (f: Facility) => void;
}) {
  const [form, setForm] = useState({
    facility_name: facility.facility_name,
    facility_type: facility.facility_type as (typeof FACILITY_TYPES)[number],
    city: facility.city ?? "",
    address: facility.address ?? "",
    phone_number: facility.phone_number ?? "",
    timezone: facility.timezone ?? "Asia/Karachi",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSaved(false);
    setBusy(true);
    try {
      const payload: FacilityUpdate = {
        facility_name: form.facility_name.trim(),
        facility_type: form.facility_type,
        city: form.city.trim() || null,
        address: form.address.trim() || null,
        phone_number: form.phone_number.trim() || null,
        timezone: form.timezone.trim() || null,
      };
      const updated = await updateFacility(facility.facility_id, payload);
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError && err.httpStatus === 422) {
        const next = parseValidationErrorsByField(err.details);
        if (Object.keys(next).length > 0) setFieldErrors(next);
        else setError("Some fields are invalid. Please review and try again.");
      } else {
        setError(defaultMessageFor(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
          <MapPinned size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14.5px] font-semibold text-ink">Facility details</h2>
          {error && (
            <div className="mt-3 rounded-lg border border-alert-line bg-alert-tint px-3.5 py-2.5 text-[12.5px] text-alert">
              {error}
            </div>
          )}
          {saved && !error && (
            <div className="mt-3 rounded-lg border border-approved-line bg-approved-tint px-3.5 py-2.5 text-[12.5px] text-approved">
              Saved.
            </div>
          )}
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-ink-2">Facility name</span>
              <input
                required
                disabled={!editable}
                minLength={2}
                maxLength={255}
                value={form.facility_name}
                onChange={(e) => setForm((f) => ({ ...f, facility_name: e.target.value }))}
                className={`rounded-lg border bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint disabled:opacity-60 ${
                  fieldErrors.facility_name ? "border-alert" : "border-line-2"
                }`}
              />
              {fieldErrors.facility_name && (
                <span className="text-[11.5px] text-alert">{fieldErrors.facility_name}</span>
              )}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-ink-2">Facility type</span>
              <select
                disabled={!editable}
                value={form.facility_type}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    facility_type: e.target.value as (typeof FACILITY_TYPES)[number],
                  }))
                }
                className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint disabled:opacity-60"
              >
                {FACILITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-ink-2">City</span>
              <input
                disabled={!editable}
                maxLength={100}
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint disabled:opacity-60"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-ink-2">Address</span>
              <input
                disabled={!editable}
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint disabled:opacity-60"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-ink-2">Phone number</span>
              <input
                disabled={!editable}
                maxLength={30}
                value={form.phone_number}
                onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))}
                className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint disabled:opacity-60"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-ink-2">Timezone (IANA)</span>
              <input
                required
                disabled={!editable}
                maxLength={64}
                value={form.timezone}
                onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                placeholder="e.g. Asia/Karachi"
                className={`rounded-lg border bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint disabled:opacity-60 placeholder:text-ink-3 ${
                  fieldErrors.timezone ? "border-alert" : "border-line-2"
                }`}
              />
              {fieldErrors.timezone && (
                <span className="text-[11.5px] text-alert">{fieldErrors.timezone}</span>
              )}
            </label>
            {editable && (
              <button
                type="submit"
                disabled={busy}
                className="mt-1 flex items-center justify-center gap-2 self-start rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                Save changes
              </button>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}

function ConfigurationForm({
  facilityId,
  configuration,
  editable,
  onSaved,
}: {
  facilityId: string;
  configuration: FacilityConfiguration | null;
  editable: boolean;
  onSaved: (c: FacilityConfiguration) => void;
}) {
  const [form, setForm] = useState({
    payment_collection_timing:
      (configuration?.payment_collection_timing as (typeof PAYMENT_TIMINGS)[number]) ??
      "prepaid",
    default_currency: configuration?.default_currency ?? "PKR",
    tax_rate: configuration?.tax_rate ?? 0,
    receipt_language: configuration?.receipt_language ?? "en",
    receipt_format: configuration?.receipt_format ?? "standard",
    queue_display_config: configuration?.queue_display_config
      ? JSON.stringify(configuration.queue_display_config, null, 2)
      : "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      let queueDisplayConfig: Record<string, unknown> | null = null;
      const queueConfigText = form.queue_display_config.trim();
      if (queueConfigText) {
        const parsed = JSON.parse(queueConfigText) as unknown;
        if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
          setError("Queue display configuration must be a JSON object.");
          setBusy(false);
          return;
        }
        queueDisplayConfig = parsed as Record<string, unknown>;
      }
      const updated = await saveFacilityConfiguration({
        facility_id: facilityId,
        payment_collection_timing: form.payment_collection_timing,
        default_currency: form.default_currency.trim().toUpperCase(),
        tax_rate: form.tax_rate,
        receipt_language: form.receipt_language.trim(),
        receipt_format: form.receipt_format.trim(),
        queue_display_config: queueDisplayConfig,
      });
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError("Queue display configuration must be valid JSON.");
      } else {
        setError(defaultMessageFor(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
          <Settings2 size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14.5px] font-semibold text-ink">Configuration</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-2">
            Determines where payment collection appears in operational flows.
            {!configuration && " Not yet configured — saving will create it."}
          </p>
          {error && (
            <div className="mt-3 rounded-lg border border-alert-line bg-alert-tint px-3.5 py-2.5 text-[12.5px] text-alert">
              {error}
            </div>
          )}
          {saved && !error && (
            <div className="mt-3 rounded-lg border border-approved-line bg-approved-tint px-3.5 py-2.5 text-[12.5px] text-approved">
              Saved.
            </div>
          )}
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-ink-2">
                Payment collection timing
              </span>
              <select
                disabled={!editable}
                value={form.payment_collection_timing}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    payment_collection_timing: e.target
                      .value as (typeof PAYMENT_TIMINGS)[number],
                  }))
                }
                className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint disabled:opacity-60"
              >
                {PAYMENT_TIMINGS.map((t) => (
                  <option key={t} value={t}>
                    {t.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-ink-2">Currency (ISO 4217)</span>
                <input
                  disabled={!editable}
                  minLength={3}
                  maxLength={3}
                  value={form.default_currency}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, default_currency: e.target.value }))
                  }
                  className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] uppercase text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint disabled:opacity-60"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-ink-2">Tax rate (%)</span>
                <input
                  type="number"
                  disabled={!editable}
                  min={0}
                  max={100}
                  step="0.01"
                  value={form.tax_rate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, tax_rate: Number(e.target.value) }))
                  }
                  className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint disabled:opacity-60"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-ink-2">
                  Receipt language (ISO 639-1)
                </span>
                <select
                  disabled={!editable}
                  value={form.receipt_language}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, receipt_language: e.target.value }))
                  }
                  className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint disabled:opacity-60"
                >
                  <option value="en">English (en)</option>
                  <option value="ur">Urdu (ur)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-ink-2">Receipt format</span>
                <input
                  disabled={!editable}
                  maxLength={20}
                  value={form.receipt_format}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, receipt_format: e.target.value }))
                  }
                  className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint disabled:opacity-60"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-ink-2">
                Queue display configuration
              </span>
              <textarea
                disabled={!editable}
                rows={4}
                value={form.queue_display_config}
                onChange={(e) =>
                  setForm((f) => ({ ...f, queue_display_config: e.target.value }))
                }
                placeholder='{"show_estimated_wait": true, "show_doctor_name": true}'
                className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 font-mono text-[12.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint disabled:opacity-60 placeholder:text-ink-3"
              />
            </label>
            {editable && (
              <button
                type="submit"
                disabled={busy}
                className="mt-1 flex items-center justify-center gap-2 self-start rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                Save configuration
              </button>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}

function DepartmentsCard({
  facilityId,
  departments,
  canCreate,
  canUpdate,
  onChanged,
}: {
  facilityId: string;
  departments: FacilitySetupOverview["departments"];
  canCreate: boolean;
  canUpdate: boolean;
  onChanged: (departments: Department[]) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);

  // Specialties are only needed for the department form's picker — loaded
  // lazily the first time a create/edit dialog opens, not on every page
  // load (most visits to this screen never touch the department form).
  useEffect(() => {
    if (!showCreate && !editing) return;
    let cancelled = false;
    listSpecialties()
      .then((data) => !cancelled && setSpecialties(data))
      .catch(() => {
        // Best-effort — the specialty picker just shows empty if this fails;
        // department name/code fields (the required ones) still work.
      });
    return () => {
      cancelled = true;
    };
  }, [showCreate, editing]);

  function replaceDepartment(updated: Department) {
    const exists = departments.some((d) => d.department_id === updated.department_id);
    onChanged(
      exists
        ? departments.map((d) => (d.department_id === updated.department_id ? updated : d))
        : [...departments, updated],
    );
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
          <Building size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <h2 className="text-[14.5px] font-semibold text-ink">Departments</h2>
            {canCreate && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-surface-2"
              >
                <Plus size={13} /> Add
              </button>
            )}
          </div>

          {showCreate && (
            <DepartmentDialog
              mode="create"
              facilityId={facilityId}
              specialties={specialties}
              onClose={() => setShowCreate(false)}
              onSaved={(d) => {
                setShowCreate(false);
                replaceDepartment(d);
              }}
            />
          )}
          {editing && (
            <DepartmentDialog
              mode="edit"
              facilityId={facilityId}
              department={editing}
              specialties={specialties}
              onClose={() => setEditing(null)}
              onSaved={(d) => {
                setEditing(null);
                replaceDepartment(d);
              }}
            />
          )}

          {departments.length === 0 ? (
            <p className="mt-3 text-[12.5px] text-ink-2">No departments yet.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1.5">
              {departments.map((d) => {
                const specialty = specialties.find((s) => s.specialty_id === d.specialty_id);
                return (
                  <li
                    key={d.department_id}
                    className="flex items-center gap-2 rounded-lg border border-line-2 px-3 py-2 text-[12.5px]"
                  >
                    <span className="min-w-0 flex-1 truncate text-ink">
                      {d.department_name}
                      {specialty && (
                        <span className="ml-1.5 text-ink-3">· {specialty.specialty_name}</span>
                      )}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-ink-3">
                      {d.department_code}
                    </span>
                    {!d.is_active && (
                      <span className="shrink-0 rounded-full border border-alert-line bg-alert-tint px-2 py-0.5 text-[10.5px] font-medium text-alert">
                        Inactive
                      </span>
                    )}
                    {canUpdate && (
                      <button
                        type="button"
                        onClick={() => setEditing(d)}
                        className="shrink-0 rounded-md p-1 text-ink-3 transition-colors hover:bg-surface hover:text-ink-2"
                        aria-label={`Edit ${d.department_name}`}
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function DepartmentDialog({
  mode,
  facilityId,
  department,
  specialties,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  facilityId: string;
  department?: Department;
  specialties: Specialty[];
  onClose: () => void;
  onSaved: (d: Department) => void;
}) {
  const [name, setName] = useState(department?.department_name ?? "");
  const [code, setCode] = useState(department?.department_code ?? "");
  const [specialtyId, setSpecialtyId] = useState(department?.specialty_id ?? "");
  const [isActive, setIsActive] = useState(department?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);
    try {
      let saved: Department;
      if (mode === "create") {
        saved = await createDepartment({
          facility_id: facilityId,
          department_name: name.trim(),
          department_code: code.trim(),
          specialty_id: specialtyId || null,
        });
      } else if (department) {
        saved = await updateDepartment(department.department_id, {
          department_name: name.trim(),
          department_code: code.trim(),
          specialty_id: specialtyId || null,
          is_active: isActive,
        });
      } else {
        return;
      }
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError && err.httpStatus === 422) {
        const next = parseValidationErrorsByField(err.details);
        if (Object.keys(next).length > 0) setFieldErrors(next);
        else setError("Some fields are invalid. Please review and try again.");
      } else if (err instanceof ApiError && err.httpStatus === 409) {
        setError(err.message || "A Department with this code already exists at this Facility.");
      } else {
        setError(defaultMessageFor(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-line-2 bg-surface-2 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-ink">
          {mode === "create" ? "New Department" : "Edit Department"}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-ink-3 transition-colors hover:bg-surface hover:text-ink-2"
          aria-label="Close"
        >
          <X size={15} />
        </button>
      </div>
      {error && (
        <div className="mt-2.5 rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[12px] text-alert">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-medium text-ink-2">Department name</span>
          <input
            required
            autoFocus
            minLength={2}
            maxLength={255}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Emergency"
            className={`rounded-md border bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint placeholder:text-ink-3 ${
              fieldErrors.department_name ? "border-alert" : "border-line-2"
            }`}
          />
          {fieldErrors.department_name && (
            <span className="text-[11px] text-alert">{fieldErrors.department_name}</span>
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-medium text-ink-2">
            Department code (unique per Facility)
          </span>
          <input
            required
            minLength={1}
            maxLength={20}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. ER"
            className={`rounded-md border bg-surface px-3 py-2 text-[13px] uppercase text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint placeholder:text-ink-3 ${
              fieldErrors.department_code ? "border-alert" : "border-line-2"
            }`}
          />
          {fieldErrors.department_code && (
            <span className="text-[11px] text-alert">{fieldErrors.department_code}</span>
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-medium text-ink-2">Specialty (optional)</span>
          <select
            value={specialtyId}
            onChange={(e) => setSpecialtyId(e.target.value)}
            className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
          >
            <option value="">None</option>
            {specialties.map((s) => (
              <option key={s.specialty_id} value={s.specialty_id}>
                {s.specialty_name}
              </option>
            ))}
          </select>
        </label>
        {mode === "edit" && (
          <label className="flex items-center gap-2 text-[12px] text-ink-2">
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
            className="flex items-center justify-center gap-2 rounded-md bg-brand px-3.5 py-1.5 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            {mode === "create" ? "Create" : "Save"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-line px-3.5 py-1.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-surface"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function DeactivateFacilityCard({ facilityId }: { facilityId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDeactivate() {
    setError(null);
    setBusy(true);
    try {
      const result = await deactivateFacility(facilityId);
      router.push(
        `/settings/facilities?deactivated=${result.facility_roles_deactivated}&sessionsEnded=${result.sessions_ended}`,
      );
    } catch (err) {
      setError(defaultMessageFor(err));
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-alert-line bg-surface p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-alert-tint text-alert">
          <TriangleAlert size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14.5px] font-semibold text-ink">Deactivate Facility</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-2">
            This deactivates every Facility-role assignment at this Facility and ends
            active sessions for affected users.
          </p>
          {error && (
            <div className="mt-3 rounded-lg border border-alert-line bg-alert-tint px-3.5 py-2.5 text-[12.5px] text-alert">
              {error}
            </div>
          )}
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="mt-4 rounded-lg border border-alert-line px-3.5 py-2 text-[12.5px] font-medium text-alert transition-colors hover:bg-alert-tint"
            >
              Deactivate Facility
            </button>
          ) : (
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={handleDeactivate}
                disabled={busy}
                className="flex items-center justify-center gap-2 rounded-lg bg-alert px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                Confirm deactivation
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-2"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
