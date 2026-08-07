"use client";

// staff/doctors/page.tsx — spec §9.9: Doctor profile list + create.
// Creates a profile for an EXISTING user (spec: "for an existing user with
// an active doctor role") — this screen does not create users, that is
// /staff's job; it links a Doctor profile onto one that already exists.

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Stethoscope, Plus, Loader2, X } from "lucide-react";
import { useSession } from "@/context/session";
import { hasPermission } from "@/lib/permissions";
import {
  listDoctorProfiles,
  createDoctorProfile,
  type DoctorProfile,
  type DoctorProfileCreate,
} from "@/lib/api/staff-profiles";
import { listUsers, listRoles, type StaffUser, type Role } from "@/lib/api/staff";
import {
  listFacilityRoleAssignments,
  type FacilityRoleAssignment,
} from "@/lib/api/rbac";
import { ApiError } from "@/lib/api";
import { defaultMessageFor, parseValidationErrorsByField } from "@/lib/errors";
import { Loading, ErrorState, EmptyState } from "@/components/design-system/States";

export default function DoctorProfilesPage() {
  return (
    <Suspense fallback={null}>
      <DoctorProfilesPageInner />
    </Suspense>
  );
}

function DoctorProfilesPageInner() {
  const { scope, activeFacility } = useSession();
  const searchParams = useSearchParams();
  // Deep-link from the role-assignments nudge (staff/role-assignments/
  // page.tsx) — "no bookable profile yet for this person, create one now?"
  // right after granting them Doctor, instead of leaving the admin to
  // stumble onto this page later and re-find them in the eligible list.
  const [presetUserId] = useState(() => searchParams.get("user_id") ?? undefined);
  const [profiles, setProfiles] = useState<DoctorProfile[] | null>(null);
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [facilityAssignments, setFacilityAssignments] = useState<
    FacilityRoleAssignment[]
  >([]);
  const [doctorRoleRefError, setDoctorRoleRefError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [showCreate, setShowCreate] = useState(Boolean(presetUserId));

  const canCreate = hasPermission(scope, "user.create");

  function reload() {
    setLoading(true);
    setLoadError(null);
    setDoctorRoleRefError(null);
    Promise.allSettled([
      listDoctorProfiles(),
      listUsers(),
      listRoles(),
      listFacilityRoleAssignments(activeFacility.facility_id),
    ])
      .then(([profilesResult, usersResult, rolesResult, assignmentsResult]) => {
        if (profilesResult.status === "fulfilled") {
          setProfiles(profilesResult.value);
        } else {
          throw profilesResult.reason;
        }
        if (usersResult.status === "fulfilled") {
          setUsers(usersResult.value);
        } else {
          throw usersResult.reason;
        }
        if (rolesResult.status === "fulfilled") {
          setRoles(rolesResult.value);
        } else {
          setRoles([]);
          setDoctorRoleRefError(rolesResult.reason);
        }
        if (assignmentsResult.status === "fulfilled") {
          setFacilityAssignments(assignmentsResult.value);
        } else {
          setFacilityAssignments([]);
          setDoctorRoleRefError(assignmentsResult.reason);
        }
      })
      .catch(setLoadError)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    queueMicrotask(reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFacility.facility_id]);

  function userName(userId: string): string {
    return users.find((u) => u.user_id === userId)?.full_name ?? userId.slice(0, 8);
  }

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
          <h1 className="text-[20px] font-semibold tracking-tight text-ink">Doctor profiles</h1>
          <p className="mt-1 text-[13px] text-ink-2">
            Clinical profiles, schedules, and specialty links for existing staff.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
          >
            <Plus size={14} /> New Doctor profile
          </button>
        )}
      </div>

      {showCreate && (
        <CreateDoctorProfileDialog
          users={users}
          roles={roles}
          facilityAssignments={facilityAssignments}
          activeFacilityName={activeFacility.facility_name}
          roleRefError={doctorRoleRefError}
          existingProfileUserIds={new Set((profiles ?? []).map((p) => p.user_id))}
          presetUserId={presetUserId}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            reload();
          }}
        />
      )}

      <div className="mt-6">
        {loading && <Loading label="Loading Doctor profiles…" />}
        {!loading && Boolean(loadError) && <ErrorState error={loadError} onRetry={reload} />}
        {!loading && !loadError && profiles && profiles.length === 0 && (
          <EmptyState
            icon={Stethoscope}
            title="No Doctor profiles yet"
            description={canCreate ? "Create one for an existing staff account." : undefined}
          />
        )}
        {!loading && !loadError && profiles && profiles.length > 0 && (
          <div className="divide-y divide-line rounded-xl border border-line bg-surface">
            {profiles.map((p) => (
              <Link
                key={p.profile_id}
                href={`/staff/doctors/${p.profile_id}`}
                className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
                  <Stethoscope size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">
                    {p.display_name ?? userName(p.user_id)}
                  </span>
                  <span className="block truncate text-[11.5px] text-ink-3">
                    {p.qualification ?? "—"}
                    {p.designation ? ` · ${p.designation}` : ""}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateDoctorProfileDialog({
  users,
  roles,
  facilityAssignments,
  activeFacilityName,
  roleRefError,
  existingProfileUserIds,
  presetUserId,
  onClose,
  onCreated,
}: {
  users: StaffUser[];
  roles: Role[];
  facilityAssignments: FacilityRoleAssignment[];
  activeFacilityName: string;
  roleRefError: unknown;
  existingProfileUserIds: Set<string>;
  /** From a ?user_id= deep-link (the role-assignments nudge). Only applied
   *  if this user is actually eligible at the currently active Facility —
   *  the assignment may have happened at a different one, in which case
   *  this silently falls through to the first real eligible user, same as
   *  arriving here with no preset at all. */
  presetUserId?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const doctorRoleIds = new Set(
    roles
      .filter((r) => r.scope_type === "facility" && r.role_name.toLowerCase() === "doctor")
      .map((r) => r.role_id),
  );
  const doctorUserIds = new Set(
    facilityAssignments
      .filter((a) => a.is_active && doctorRoleIds.has(a.role_id))
      .map((a) => a.user_id),
  );
  const eligibleUsers = users.filter(
    (u) =>
      u.is_active &&
      !existingProfileUserIds.has(u.user_id) &&
      doctorUserIds.has(u.user_id),
  );
  const [userId, setUserId] = useState(
    presetUserId && eligibleUsers.some((u) => u.user_id === presetUserId)
      ? presetUserId
      : eligibleUsers[0]?.user_id ?? "",
  );
  const [displayName, setDisplayName] = useState("");
  const [designation, setDesignation] = useState("");
  const [qualification, setQualification] = useState("");
  const [pmdcNumber, setPmdcNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!userId) {
      setError("Choose a staff account.");
      return;
    }
    setBusy(true);
    try {
      const payload: DoctorProfileCreate = {
        user_id: userId,
        ...(displayName.trim() && { display_name: displayName.trim() }),
        ...(designation.trim() && { designation: designation.trim() }),
        ...(qualification.trim() && { qualification: qualification.trim() }),
        ...(pmdcNumber.trim() && { pmdc_number: pmdcNumber.trim() }),
      };
      await createDoctorProfile(payload);
      onCreated();
    } catch (err) {
      if (err instanceof ApiError && err.httpStatus === 422) {
        const fieldErrors = parseValidationErrorsByField(err.details);
        const messages = Object.values(fieldErrors);
        setError(messages.length > 0 ? messages.join(" ") : "Some fields are invalid. Please review and try again.");
      } else {
        setError(defaultMessageFor(err));
      }
    } finally {
      setBusy(false);
    }
  }

  if (eligibleUsers.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-line bg-surface p-5 text-[12.5px] text-ink-2">
        {roleRefError
          ? "Doctor-role assignment data could not be loaded, so profile creation is disabled until the role reference data is available."
          : `No active staff account at ${activeFacilityName} has an active Doctor role without an existing Doctor profile.`}
        <Link href="/staff/role-assignments" className="ml-1 text-brand underline">
          Manage role assignments
        </Link>{" "}
        first.
        <button
          type="button"
          onClick={onClose}
          className="ml-3 rounded-md border border-line px-2.5 py-1 text-[11.5px] font-medium text-ink-2 transition-colors hover:bg-surface-2"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[14.5px] font-semibold text-ink">New Doctor profile</h2>
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
          <span className="text-[12px] font-medium text-ink-2">Staff account</span>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
          >
            {eligibleUsers.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.full_name} ({u.email})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-2">Display name (optional)</span>
          <input
            maxLength={100}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Dr. Ayesha Khan"
            className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint placeholder:text-ink-3"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-2">Designation (optional)</span>
          <input
            maxLength={100}
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            placeholder="e.g. Consultant Physician"
            className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint placeholder:text-ink-3"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-2">Qualification (optional)</span>
          <input
            maxLength={255}
            value={qualification}
            onChange={(e) => setQualification(e.target.value)}
            placeholder="e.g. MBBS, FCPS"
            className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint placeholder:text-ink-3"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-2">PMDC number (optional)</span>
          <input
            maxLength={50}
            value={pmdcNumber}
            onChange={(e) => setPmdcNumber(e.target.value)}
            className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
          />
        </label>
        <div className="mt-1 flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Create profile
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
