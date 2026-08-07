"use client";

// settings/specialties/page.tsx — spec §9.4: Specialty list and create/edit.
// Specialties are Organisation-wide (shared across every Facility), unlike
// Departments which are Facility-scoped — confirmed via the backend's
// list_specialties (no facility_id param) vs list_departments (requires
// one).

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Stethoscope, Plus, Loader2, X, Pencil } from "lucide-react";
import { useSession } from "@/context/session";
import { hasPermission } from "@/lib/permissions";
import {
  listSpecialties,
  createSpecialty,
  updateSpecialty,
  type Specialty,
  type SpecialtyCreate,
} from "@/lib/api/tenant";
import { ApiError } from "@/lib/api";
import { defaultMessageFor, parseValidationErrorsByField } from "@/lib/errors";
import { Loading, ErrorState, EmptyState } from "@/components/design-system/States";

export default function SpecialtiesPage() {
  const { scope } = useSession();
  const [specialties, setSpecialties] = useState<Specialty[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Specialty | null>(null);

  const canCreate = hasPermission(scope, "specialty.create");
  const canUpdate = hasPermission(scope, "specialty.update");

  function reload() {
    setLoading(true);
    setLoadError(null);
    listSpecialties()
      .then(setSpecialties)
      .catch(setLoadError)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    queueMicrotask(reload);
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-ink-3 transition-colors hover:text-ink-2"
      >
        <ArrowLeft size={13} /> Back to Settings
      </Link>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-ink">Specialties</h1>
          <p className="mt-1 text-[13px] text-ink-2">
            Clinical specialties shared across every Facility in this Organisation.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
          >
            <Plus size={14} /> New Specialty
          </button>
        )}
      </div>

      {showCreate && (
        <SpecialtyDialog
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            reload();
          }}
        />
      )}
      {editing && (
        <SpecialtyDialog
          mode="edit"
          specialty={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}

      <div className="mt-6">
        {loading && <Loading label="Loading Specialties…" />}
        {!loading && Boolean(loadError) && <ErrorState error={loadError} onRetry={reload} />}
        {!loading && !loadError && specialties && specialties.length === 0 && (
          <EmptyState
            icon={Stethoscope}
            title="No Specialties yet"
            description={canCreate ? "Create your first Specialty to get started." : undefined}
          />
        )}
        {!loading && !loadError && specialties && specialties.length > 0 && (
          <div className="divide-y divide-line rounded-xl border border-line bg-surface">
            {specialties.map((s) => (
              <div key={s.specialty_id} className="flex items-center gap-3 px-4 py-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
                  <Stethoscope size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">
                    {s.specialty_name}
                  </span>
                  <span className="block font-mono text-[11px] text-ink-3">
                    {s.specialty_code}
                  </span>
                </span>
                {!s.is_active && (
                  <span className="shrink-0 rounded-full border border-alert-line bg-alert-tint px-2 py-0.5 text-[10.5px] font-medium text-alert">
                    Inactive
                  </span>
                )}
                {canUpdate && (
                  <button
                    type="button"
                    onClick={() => setEditing(s)}
                    className="shrink-0 rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-2"
                    aria-label={`Edit ${s.specialty_name}`}
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

function SpecialtyDialog({
  mode,
  specialty,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  specialty?: Specialty;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(specialty?.specialty_name ?? "");
  const [code, setCode] = useState(specialty?.specialty_code ?? "");
  const [isActive, setIsActive] = useState(specialty?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);
    try {
      if (mode === "create") {
        const payload: SpecialtyCreate = {
          specialty_name: name.trim(),
          specialty_code: code.trim(),
        };
        await createSpecialty(payload);
      } else if (specialty) {
        await updateSpecialty(specialty.specialty_id, {
          specialty_name: name.trim(),
          specialty_code: code.trim(),
          is_active: isActive,
        });
      }
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.httpStatus === 422) {
        const next = parseValidationErrorsByField(err.details);
        if (Object.keys(next).length > 0) setFieldErrors(next);
        else setError("Some fields are invalid. Please review and try again.");
      } else if (err instanceof ApiError && err.httpStatus === 409) {
        setError(err.message || "A Specialty with this code already exists.");
      } else {
        setError(defaultMessageFor(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[14.5px] font-semibold text-ink">
          {mode === "create" ? "New Specialty" : "Edit Specialty"}
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
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-2">Specialty name</span>
          <input
            required
            autoFocus
            minLength={2}
            maxLength={150}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Pediatrics"
            className={`rounded-lg border bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint placeholder:text-ink-3 ${
              fieldErrors.specialty_name ? "border-alert" : "border-line-2"
            }`}
          />
          {fieldErrors.specialty_name && (
            <span className="text-[11.5px] text-alert">{fieldErrors.specialty_name}</span>
          )}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-2">
            Specialty code (unique per Organisation)
          </span>
          <input
            required
            minLength={1}
            maxLength={20}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. PEDS"
            className={`rounded-lg border bg-surface px-3.5 py-2.5 text-[13.5px] uppercase text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint placeholder:text-ink-3 ${
              fieldErrors.specialty_code ? "border-alert" : "border-line-2"
            }`}
          />
          {fieldErrors.specialty_code && (
            <span className="text-[11.5px] text-alert">{fieldErrors.specialty_code}</span>
          )}
        </label>
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
            {mode === "create" ? "Create Specialty" : "Save changes"}
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
