"use client";

// settings/facilities/page.tsx — spec §9.2: Facility list + create.

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, MapPinned, Plus, Loader2, X } from "lucide-react";
import { useSession } from "@/context/session";
import { hasPermission } from "@/lib/permissions";
import {
  listFacilities,
  createFacility,
  type Facility,
  type FacilityCreate,
} from "@/lib/api/tenant";
import { ApiError } from "@/lib/api";
import { defaultMessageFor, parseValidationErrorsByField } from "@/lib/errors";
import { Loading, ErrorState, EmptyState } from "@/components/design-system/States";

const FACILITY_TYPES = [
  "hospital",
  "clinic",
  "pharmacy",
  "lab",
  "diagnostic_centre",
  "other",
] as const;

export default function FacilitiesListPage() {
  return (
    <Suspense fallback={null}>
      <FacilitiesListPageInner />
    </Suspense>
  );
}

function FacilitiesListPageInner() {
  const { scope } = useSession();
  const searchParams = useSearchParams();
  const [facilities, setFacilities] = useState<Facility[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [showCreate, setShowCreate] = useState(false);

  const canCreate = hasPermission(scope, "facility.create");

  // Spec §9.2: Facility deactivation has a real security blast radius — show
  // the returned counts, don't silently discard them after the redirect.
  const deactivatedRoles = searchParams.get("deactivated");
  const sessionsEnded = searchParams.get("sessionsEnded");

  function reload() {
    setLoading(true);
    setLoadError(null);
    listFacilities()
      .then(setFacilities)
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
          <h1 className="text-[20px] font-semibold tracking-tight text-ink">Facilities</h1>
          <p className="mt-1 text-[13px] text-ink-2">Facility list, setup, and configuration.</p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
          >
            <Plus size={14} /> New Facility
          </button>
        )}
      </div>

      {deactivatedRoles !== null && sessionsEnded !== null && (
        <div className="mt-4 rounded-lg border border-alert-line bg-alert-tint px-3.5 py-2.5 text-[12.5px] text-alert">
          Facility deactivated — {deactivatedRoles} Facility-role assignment
          {deactivatedRoles === "1" ? "" : "s"} deactivated, {sessionsEnded} session
          {sessionsEnded === "1" ? "" : "s"} ended.
        </div>
      )}

      {showCreate && (
        <CreateFacilityDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            reload();
          }}
        />
      )}

      <div className="mt-6">
        {loading && <Loading label="Loading Facilities…" />}
        {!loading && Boolean(loadError) && <ErrorState error={loadError} onRetry={reload} />}
        {!loading && !loadError && facilities && facilities.length === 0 && (
          <EmptyState
            icon={MapPinned}
            title="No Facilities yet"
            description={canCreate ? "Create your first Facility to get started." : undefined}
          />
        )}
        {!loading && !loadError && facilities && facilities.length > 0 && (
          <div className="divide-y divide-line rounded-xl border border-line bg-surface">
            {facilities.map((f) => (
              <Link
                key={f.facility_id}
                href={`/settings/facilities/${f.facility_id}`}
                className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
                  <MapPinned size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">
                    {f.facility_name}
                  </span>
                  <span className="block truncate text-[11.5px] text-ink-3">
                    {f.facility_type} {f.city ? `· ${f.city}` : ""}
                  </span>
                </span>
                {!f.is_active && (
                  <span className="shrink-0 rounded-full border border-alert-line bg-alert-tint px-2 py-0.5 text-[10.5px] font-medium text-alert">
                    Deactivated
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateFacilityDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    facility_name: "",
    facility_type: "clinic" as (typeof FACILITY_TYPES)[number],
    city: "",
    address: "",
    phone_number: "",
    // Sensible default (the browser's own resolved zone), never hardcoded —
    // same reasoning as lib/format.ts's activeTimeZone default. Admin can
    // change it; this is a real per-Facility field, not a UI fallback.
    timezone:
      typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);
    try {
      const payload: FacilityCreate = {
        facility_name: form.facility_name.trim(),
        facility_type: form.facility_type,
        timezone: form.timezone.trim() || "UTC",
        ...(form.city.trim() && { city: form.city.trim() }),
        ...(form.address.trim() && { address: form.address.trim() }),
        ...(form.phone_number.trim() && { phone_number: form.phone_number.trim() }),
      };
      await createFacility(payload);
      onCreated();
    } catch (err) {
      if (err instanceof ApiError && err.httpStatus === 422) {
        const next = parseValidationErrorsByField(err.details);
        if (Object.keys(next).length > 0) setFieldErrors(next);
        else setError("Some fields are invalid. Please review and try again.");
      } else if (err instanceof ApiError && err.httpStatus === 409) {
        setError(err.message || "A Facility with this identity already exists.");
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
        <h2 className="text-[14.5px] font-semibold text-ink">New Facility</h2>
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
          <span className="text-[12px] font-medium text-ink-2">Facility name</span>
          <input
            required
            autoFocus
            minLength={2}
            maxLength={255}
            value={form.facility_name}
            onChange={(e) => setForm((f) => ({ ...f, facility_name: e.target.value }))}
            className={`rounded-lg border bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint ${
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
            value={form.facility_type}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                facility_type: e.target.value as (typeof FACILITY_TYPES)[number],
              }))
            }
            className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
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
            maxLength={100}
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-2">Address</span>
          <input
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-2">Phone number</span>
          <input
            maxLength={30}
            value={form.phone_number}
            onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))}
            className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-2">Timezone (IANA)</span>
          <input
            required
            maxLength={64}
            value={form.timezone}
            onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
            placeholder="e.g. Asia/Karachi"
            className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint placeholder:text-ink-3"
          />
        </label>
        <div className="mt-1 flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Create Facility
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
