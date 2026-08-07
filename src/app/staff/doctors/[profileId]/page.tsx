"use client";

// staff/doctors/[profileId]/page.tsx — spec §9.9/§9.10: Doctor detail, edit,
// deactivate, specialty links, and the full schedule surface (weekly view,
// bulk creation, single edit/delete, exceptions list/create/delete).

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Stethoscope,
  Loader2,
  TriangleAlert,
  Plus,
  X,
  Trash2,
  CalendarOff,
  Edit3,
} from "lucide-react";
import {
  getDoctorProfile,
  updateDoctorProfile,
  deactivateDoctorProfile,
  addDoctorSpecialty,
  removeDoctorSpecialty,
  listDoctorSchedules,
  createDoctorSchedule,
  bulkCreateDoctorSchedules,
  updateDoctorSchedule,
  deleteDoctorSchedule,
  listDoctorScheduleExceptions,
  createDoctorScheduleException,
  deleteDoctorScheduleException,
  type DoctorProfile,
  type DoctorSchedule,
  type DoctorScheduleCreate,
  type DoctorScheduleUpdate,
  type DoctorScheduleException,
} from "@/lib/api/staff-profiles";
import { listSpecialties, type Specialty } from "@/lib/api/tenant";
import { useSession } from "@/context/session";
import { hasPermission } from "@/lib/permissions";
import { ApiError } from "@/lib/api";
import { defaultMessageFor } from "@/lib/errors";
import { zonedDateKey } from "@/lib/format";
import { Loading, ErrorState } from "@/components/design-system/States";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function DoctorDetailPage() {
  const params = useParams<{ profileId: string }>();
  const profileId = params.profileId;
  const { scope, activeFacility } = useSession();

  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const canUpdate = hasPermission(scope, "user.update");
  const canDelete = hasPermission(scope, "user.delete");

  function reload() {
    setLoading(true);
    setLoadError(null);
    getDoctorProfile(profileId)
      .then(setProfile)
      .catch(setLoadError)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    queueMicrotask(reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <Link
        href="/staff/doctors"
        className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-ink-3 transition-colors hover:text-ink-2"
      >
        <ArrowLeft size={13} /> Back to Doctor profiles
      </Link>

      {loading && <Loading label="Loading Doctor profile…" />}
      {!loading && Boolean(loadError) && <ErrorState error={loadError} onRetry={reload} />}

      {!loading && !loadError && profile && (
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight text-ink">
              {profile.display_name ?? "Doctor profile"}
            </h1>
            <p className="mt-1 text-[13px] text-ink-2">
              {profile.designation ?? "—"} · Active Facility: {activeFacility.facility_name}
            </p>
          </div>

          <ProfileForm
            profile={profile}
            editable={canUpdate}
            onSaved={(p) => setProfile(p)}
          />

          <SpecialtiesCard
            profile={profile}
            editable={canUpdate}
            onChanged={(specialties) =>
              setProfile((p) => (p ? { ...p, specialties } : p))
            }
          />

          <SchedulesCard doctorId={profile.user_id} editable={canUpdate} />

          <ExceptionsCard doctorId={profile.user_id} editable={canUpdate} />

          {canDelete && (
            <DeactivateCard profileId={profile.profile_id} />
          )}
        </div>
      )}
    </div>
  );
}

function ProfileForm({
  profile,
  editable,
  onSaved,
}: {
  profile: DoctorProfile;
  editable: boolean;
  onSaved: (p: DoctorProfile) => void;
}) {
  const [qualification, setQualification] = useState(profile.qualification ?? "");
  const [licenseNumber, setLicenseNumber] = useState(profile.license_number ?? "");
  const [pmdcNumber, setPmdcNumber] = useState(profile.pmdc_number ?? "");
  const [yearsExperience, setYearsExperience] = useState(
    profile.years_of_experience?.toString() ?? "",
  );
  const [bio, setBio] = useState(profile.bio ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const updated = await updateDoctorProfile(profile.profile_id, {
        qualification: qualification.trim() || null,
        license_number: licenseNumber.trim() || null,
        pmdc_number: pmdcNumber.trim() || null,
        years_of_experience: yearsExperience ? Number(yearsExperience) : null,
        bio: bio.trim() || null,
      });
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setError(defaultMessageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
          <Stethoscope size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14.5px] font-semibold text-ink">Profile</h2>
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
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-ink-2">Qualification</span>
                <input
                  disabled={!editable}
                  maxLength={255}
                  value={qualification}
                  onChange={(e) => setQualification(e.target.value)}
                  className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint disabled:opacity-60"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-ink-2">Years of experience</span>
                <input
                  type="number"
                  disabled={!editable}
                  min={0}
                  max={80}
                  value={yearsExperience}
                  onChange={(e) => setYearsExperience(e.target.value)}
                  className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint disabled:opacity-60"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-ink-2">License number</span>
                <input
                  disabled={!editable}
                  maxLength={100}
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint disabled:opacity-60"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-ink-2">PMDC number</span>
                <input
                  disabled={!editable}
                  maxLength={50}
                  value={pmdcNumber}
                  onChange={(e) => setPmdcNumber(e.target.value)}
                  className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint disabled:opacity-60"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-ink-2">Bio</span>
              <textarea
                disabled={!editable}
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint disabled:opacity-60"
              />
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

function SpecialtiesCard({
  profile,
  editable,
  onChanged,
}: {
  profile: DoctorProfile;
  editable: boolean;
  onChanged: (specialties: DoctorProfile["specialties"]) => void;
}) {
  const [allSpecialties, setAllSpecialties] = useState<Specialty[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const links = profile.specialties ?? [];

  useEffect(() => {
    listSpecialties()
      .then(setAllSpecialties)
      .catch(() => {
        // Best-effort — the picker just shows empty if this fails.
      });
  }, []);

  const linkedIds = new Set(links.map((l) => l.specialty_id));
  const available = allSpecialties.filter((s) => !linkedIds.has(s.specialty_id));

  function specialtyName(id: string): string {
    return allSpecialties.find((s) => s.specialty_id === id)?.specialty_name ?? id.slice(0, 8);
  }

  async function handleAdd() {
    if (!selected) return;
    setError(null);
    setBusy(true);
    try {
      const link = await addDoctorSpecialty(profile.profile_id, {
        specialty_id: selected,
        is_primary: links.length === 0,
      });
      onChanged([...links, link]);
      setSelected("");
    } catch (err) {
      setError(defaultMessageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(linkId: string) {
    setError(null);
    setBusy(true);
    try {
      await removeDoctorSpecialty(profile.profile_id, linkId);
      onChanged(links.filter((l) => l.id !== linkId));
    } catch (err) {
      setError(defaultMessageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-[14.5px] font-semibold text-ink">Specialties</h2>
      {error && (
        <div className="mt-3 rounded-lg border border-alert-line bg-alert-tint px-3.5 py-2.5 text-[12.5px] text-alert">
          {error}
        </div>
      )}
      {links.length === 0 && <p className="mt-2 text-[12.5px] text-ink-2">No specialties linked.</p>}
      {links.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {links.map((l) => (
            <li
              key={l.id}
              className="flex items-center gap-1.5 rounded-full border border-line-2 bg-surface-2 px-2.5 py-1 text-[12px] text-ink"
            >
              {specialtyName(l.specialty_id)}
              {l.is_primary && <span className="text-[10px] text-brand">· primary</span>}
              {editable && (
                <button
                  type="button"
                  onClick={() => handleRemove(l.id)}
                  disabled={busy}
                  className="text-ink-3 hover:text-alert"
                  aria-label="Remove"
                >
                  <X size={11} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && available.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="rounded-lg border border-line-2 bg-surface px-3 py-1.5 text-[12.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
          >
            <option value="">Add a specialty…</option>
            {available.map((s) => (
              <option key={s.specialty_id} value={s.specialty_id}>
                {s.specialty_name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!selected || busy}
            className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-surface-2 disabled:opacity-60"
          >
            Add
          </button>
        </div>
      )}
    </section>
  );
}

function SchedulesCard({ doctorId, editable }: { doctorId: string; editable: boolean }) {
  const { activeFacility } = useSession();
  const [schedules, setSchedules] = useState<DoctorSchedule[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<DoctorSchedule | null>(null);

  function reload() {
    setLoading(true);
    setLoadError(null);
    listDoctorSchedules(doctorId)
      .then(setSchedules)
      .catch(setLoadError)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    queueMicrotask(reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId]);

  async function handleDelete(scheduleId: string) {
    try {
      await deleteDoctorSchedule(scheduleId);
      reload();
    } catch {
      // Surfaced inline per-row would need more state; a reload without the
      // deleted row disappearing signals failure clearly enough here.
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[14.5px] font-semibold text-ink">Weekly schedule</h2>
        {editable && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowBulkCreate(true)}
              className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-surface-2"
            >
              <Plus size={13} /> Bulk
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-surface-2"
            >
              <Plus size={13} /> Add session
            </button>
          </div>
        )}
      </div>

      {showCreate && (
        <ScheduleDialog
          mode="create"
          doctorId={doctorId}
          facilityId={activeFacility.facility_id}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            reload();
          }}
        />
      )}

      {showBulkCreate && (
        <BulkScheduleDialog
          doctorId={doctorId}
          facilityId={activeFacility.facility_id}
          onClose={() => setShowBulkCreate(false)}
          onSaved={() => {
            setShowBulkCreate(false);
            reload();
          }}
        />
      )}

      {editingSchedule && (
        <ScheduleDialog
          mode="edit"
          doctorId={doctorId}
          facilityId={activeFacility.facility_id}
          schedule={editingSchedule}
          onClose={() => setEditingSchedule(null)}
          onSaved={() => {
            setEditingSchedule(null);
            reload();
          }}
        />
      )}

      <div className="mt-3">
        {loading && <Loading label="Loading schedule…" />}
        {!loading && Boolean(loadError) && <ErrorState error={loadError} onRetry={reload} />}
        {!loading && !loadError && schedules && schedules.length === 0 && (
          <p className="text-[12.5px] text-ink-2">No schedule configured yet.</p>
        )}
        {!loading && !loadError && schedules && schedules.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {schedules.map((s) => (
              <li
                key={s.schedule_id}
                className="flex items-center gap-2 rounded-lg border border-line-2 px-3 py-2 text-[12.5px]"
              >
                <span className="w-20 shrink-0 font-medium text-ink">
                  {s.day_name ?? DAYS[s.day_of_week]}
                </span>
                <span className="min-w-0 flex-1 text-ink-2">
                  {s.start_time}–{s.end_time} · {s.slot_duration_minutes}min slots · max{" "}
                  {s.max_patients}
                </span>
                {!s.is_active && (
                  <span className="shrink-0 rounded-full border border-alert-line bg-alert-tint px-2 py-0.5 text-[10.5px] font-medium text-alert">
                    Inactive
                  </span>
                )}
                {editable && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingSchedule(s)}
                      className="rounded-md p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-2"
                      aria-label="Edit session"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(s.schedule_id)}
                      className="rounded-md p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-alert"
                      aria-label="Delete session"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ScheduleDialog({
  mode,
  doctorId,
  facilityId,
  schedule,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  doctorId: string;
  facilityId: string;
  schedule?: DoctorSchedule;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [dayOfWeek, setDayOfWeek] = useState(schedule?.day_of_week ?? 0);
  const [startTime, setStartTime] = useState(schedule?.start_time ?? "09:00");
  const [endTime, setEndTime] = useState(schedule?.end_time ?? "17:00");
  const [slotDuration, setSlotDuration] = useState(schedule?.slot_duration_minutes ?? 15);
  const [maxPatients, setMaxPatients] = useState(schedule?.max_patients ?? 20);
  const [effectiveFrom, setEffectiveFrom] = useState(
    // Facility-local calendar day, not UTC's — see appointments/page.tsx for why.
    schedule?.effective_from ?? zonedDateKey(new Date().toISOString()),
  );
  const [effectiveTo, setEffectiveTo] = useState(schedule?.effective_to ?? "");
  const [isActive, setIsActive] = useState(schedule?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "create") {
        const payload: DoctorScheduleCreate = {
          doctor_id: doctorId,
          facility_id: facilityId,
          day_of_week: dayOfWeek,
          start_time: startTime,
          end_time: endTime,
          slot_duration_minutes: slotDuration,
          max_patients: maxPatients,
          effective_from: effectiveFrom,
          effective_to: effectiveTo || null,
        };
        await createDoctorSchedule(payload);
      } else {
        const payload: DoctorScheduleUpdate = {
          start_time: startTime,
          end_time: endTime,
          slot_duration_minutes: slotDuration,
          max_patients: maxPatients,
          effective_from: effectiveFrom,
          effective_to: effectiveTo || null,
          is_active: isActive,
        };
        await updateDoctorSchedule(schedule!.schedule_id, payload);
      }
      onSaved();
    } catch (err) {
      // Real time-window/date-window conflict errors (409) — spec's
      // explicit instruction to surface these, not hide as generic.
      setError(err instanceof ApiError ? err.message || defaultMessageFor(err) : defaultMessageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-line-2 bg-surface-2 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-ink">
          {mode === "create" ? "New session" : "Edit session"}
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
          <span className="text-[11.5px] font-medium text-ink-2">Day</span>
          <select
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(Number(e.target.value))}
            disabled={mode === "edit"}
            className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
          >
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-medium text-ink-2">Start time</span>
            <input
              type="time"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-medium text-ink-2">End time</span>
            <input
              type="time"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-medium text-ink-2">Slot duration (min)</span>
            <input
              type="number"
              min={5}
              max={120}
              value={slotDuration}
              onChange={(e) => setSlotDuration(Number(e.target.value))}
              className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-medium text-ink-2">Max patients</span>
            <input
              type="number"
              min={1}
              max={200}
              value={maxPatients}
              onChange={(e) => setMaxPatients(Number(e.target.value))}
              className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-medium text-ink-2">Effective from</span>
          <input
            type="date"
            required
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-medium text-ink-2">Effective to (optional)</span>
          <input
            type="date"
            value={effectiveTo}
            onChange={(e) => setEffectiveTo(e.target.value)}
            className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
          />
        </label>
        {mode === "edit" && (
          <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="size-4 rounded border-line-2"
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
            {mode === "create" ? "Add" : "Save"}
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

function BulkScheduleDialog({
  doctorId,
  facilityId,
  onClose,
  onSaved,
}: {
  doctorId: string;
  facilityId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [slotDuration, setSlotDuration] = useState(15);
  const [maxPatients, setMaxPatients] = useState(20);
  // Facility-local calendar day, not UTC's — see appointments/page.tsx for why.
  const [effectiveFrom, setEffectiveFrom] = useState(() => zonedDateKey(new Date().toISOString()));
  const [effectiveTo, setEffectiveTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDay(day: number) {
    setSelectedDays((current) =>
      current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort((a, b) => a - b),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (selectedDays.length === 0) {
      setError("Select at least one day.");
      return;
    }
    setBusy(true);
    try {
      await bulkCreateDoctorSchedules({
        doctor_id: doctorId,
        facility_id: facilityId,
        schedules: selectedDays.map((day) => ({
          doctor_id: doctorId,
          facility_id: facilityId,
          day_of_week: day,
          start_time: startTime,
          end_time: endTime,
          slot_duration_minutes: slotDuration,
          max_patients: maxPatients,
          effective_from: effectiveFrom,
          effective_to: effectiveTo || null,
        })),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message || defaultMessageFor(err) : defaultMessageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-line-2 bg-surface-2 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-ink">Bulk weekly sessions</h3>
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
        <div>
          <div className="mb-1 text-[11.5px] font-medium text-ink-2">Days</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DAYS.map((day, index) => (
              <label
                key={day}
                className="flex items-center gap-2 rounded-md border border-line-2 bg-surface px-2.5 py-2 text-[12.5px] text-ink-2"
              >
                <input
                  type="checkbox"
                  checked={selectedDays.includes(index)}
                  onChange={() => toggleDay(index)}
                  className="size-4 rounded border-line-2"
                />
                {day}
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-medium text-ink-2">Start time</span>
            <input
              type="time"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-medium text-ink-2">End time</span>
            <input
              type="time"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-medium text-ink-2">Slot duration (min)</span>
            <input
              type="number"
              min={5}
              max={120}
              value={slotDuration}
              onChange={(e) => setSlotDuration(Number(e.target.value))}
              className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-medium text-ink-2">Max patients</span>
            <input
              type="number"
              min={1}
              max={200}
              value={maxPatients}
              onChange={(e) => setMaxPatients(Number(e.target.value))}
              className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-medium text-ink-2">Effective from</span>
            <input
              type="date"
              required
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-medium text-ink-2">Effective to</span>
            <input
              type="date"
              value={effectiveTo}
              onChange={(e) => setEffectiveTo(e.target.value)}
              className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
            />
          </label>
        </div>
        <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[11.5px] text-ink-2">
          The backend creates the selected rows in one transaction; any conflict
          aborts the whole batch.
        </div>
        <div className="mt-1 flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-md bg-brand px-3.5 py-1.5 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            Create batch
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

function ExceptionsCard({ doctorId, editable }: { doctorId: string; editable: boolean }) {
  const { activeFacility } = useSession();
  // Facility-local calendar day, not UTC's — see appointments/page.tsx for why.
  const [date, setDate] = useState(() => zonedDateKey(new Date().toISOString()));
  const [exceptions, setExceptions] = useState<DoctorScheduleException[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [showCreate, setShowCreate] = useState(false);

  function reload() {
    setLoading(true);
    setLoadError(null);
    listDoctorScheduleExceptions(doctorId, date)
      .then(setExceptions)
      .catch(setLoadError)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    queueMicrotask(reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId, date]);

  async function handleDelete(exceptionId: string) {
    try {
      await deleteDoctorScheduleException(exceptionId);
      reload();
    } catch {
      // Same as schedules — a failed delete leaves the row visible on reload.
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[14.5px] font-semibold text-ink">Schedule exceptions</h2>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-line-2 bg-surface px-2.5 py-1.5 text-[12px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
          />
          {editable && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-surface-2"
            >
              <Plus size={13} /> Add
            </button>
          )}
        </div>
      </div>

      {showCreate && (
        <ExceptionDialog
          doctorId={doctorId}
          facilityId={activeFacility.facility_id}
          date={date}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            reload();
          }}
        />
      )}

      <div className="mt-3">
        {loading && <Loading label="Loading exceptions…" />}
        {!loading && Boolean(loadError) && <ErrorState error={loadError} onRetry={reload} />}
        {!loading && !loadError && exceptions && exceptions.length === 0 && (
          <p className="text-[12.5px] text-ink-2">No exceptions on this date.</p>
        )}
        {!loading && !loadError && exceptions && exceptions.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {exceptions.map((ex) => (
              <li
                key={ex.exception_id}
                className="flex items-center gap-2 rounded-lg border border-line-2 px-3 py-2 text-[12.5px]"
              >
                <CalendarOff size={14} className="shrink-0 text-alert" />
                <span className="min-w-0 flex-1 text-ink">
                  {ex.exception_type}
                  {ex.start_time && ex.end_time ? ` · ${ex.start_time}–${ex.end_time}` : " · full day"}
                  {ex.reason ? ` · ${ex.reason}` : ""}
                </span>
                {editable && (
                  <button
                    type="button"
                    onClick={() => handleDelete(ex.exception_id)}
                    className="shrink-0 rounded-md p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-alert"
                    aria-label="Delete exception"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ExceptionDialog({
  doctorId,
  facilityId,
  date,
  onClose,
  onSaved,
}: {
  doctorId: string;
  facilityId: string;
  date: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [exceptionType, setExceptionType] = useState<"leave" | "holiday" | "blocked">("leave");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await createDoctorScheduleException({
        doctor_id: doctorId,
        facility_id: facilityId,
        exception_date: date,
        exception_type: exceptionType,
        reason: reason.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(defaultMessageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-line-2 bg-surface-2 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-ink">New exception — {date}</h3>
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
          <span className="text-[11.5px] font-medium text-ink-2">Type</span>
          <select
            value={exceptionType}
            onChange={(e) => setExceptionType(e.target.value as "leave" | "holiday" | "blocked")}
            className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
          >
            <option value="leave">Leave</option>
            <option value="holiday">Holiday</option>
            <option value="blocked">Blocked</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-medium text-ink-2">Reason (optional)</span>
          <input
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
          />
        </label>
        <div className="mt-1 flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-md bg-brand px-3.5 py-1.5 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            Add
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

function DeactivateCard({ profileId }: { profileId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDeactivate() {
    setError(null);
    setBusy(true);
    try {
      await deactivateDoctorProfile(profileId);
      router.push("/staff/doctors");
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
          <h2 className="text-[14.5px] font-semibold text-ink">Deactivate profile</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-2">
            Soft-deactivates this Doctor profile. The underlying staff account is
            unaffected.
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
              Deactivate profile
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
