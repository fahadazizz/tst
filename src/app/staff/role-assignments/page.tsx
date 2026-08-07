"use client";

// staff/role-assignments/page.tsx — spec §9.8: Organisation-scoped and
// Facility-scoped role assignment, with revocation. Unlike §9.7's
// role-permission gap, this one has a real, refresh-safe read contract:
// GET /organisation-roles and GET /facility-roles both return every
// assignment in the Organisation when called with no user_id/facility_id
// filter (confirmed via `list_organisation_roles`/`list_facility_roles` in
// rbac_auth/service.py — user_id=None is not "return nothing", it's
// "don't filter"), so this is a real, complete admin editor, not a
// capability-gated one like the permission catalogue's grant/revoke would
// have to be.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Stethoscope, UserCog, Plus, Loader2, X } from "lucide-react";
import { useSession } from "@/context/session";
import { hasPermission } from "@/lib/permissions";
import {
  listOrganisationRoleAssignments,
  assignOrganisationRole,
  revokeOrganisationRole,
  listFacilityRoleAssignments,
  assignFacilityRole,
  revokeFacilityRole,
  type OrganisationRoleAssignment,
  type FacilityRoleAssignment,
} from "@/lib/api/rbac";
import { listUsers, listRoles, type StaffUser, type Role } from "@/lib/api/staff";
import { listDoctorProfiles, type DoctorProfile } from "@/lib/api/staff-profiles";
import { listFacilities, type Facility } from "@/lib/api/tenant";
import { ApiError } from "@/lib/api";
import { defaultMessageFor } from "@/lib/errors";
import { Loading, ErrorState } from "@/components/design-system/States";

function userName(users: StaffUser[], userId: string): string {
  return users.find((u) => u.user_id === userId)?.full_name ?? userId.slice(0, 8);
}
function roleName(roles: Role[], roleId: string): string {
  return roles.find((r) => r.role_id === roleId)?.role_name ?? roleId.slice(0, 8);
}

export default function RoleAssignmentsPage() {
  const { scope } = useSession();
  const searchParams = useSearchParams();
  // Deep-link from /staff right after creating a user: ?user_id=<new user>
  // pre-selects them below instead of leaving the picker on whoever's first
  // alphabetically/by list order.
  const presetUserId = searchParams.get("user_id") ?? undefined;
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [refDataError, setRefDataError] = useState<unknown>(null);
  const [refDataLoading, setRefDataLoading] = useState(true);
  const canManage = hasPermission(scope, "role.manage");
  const presetUser = presetUserId
    ? users.find((u) => u.user_id === presetUserId)
    : undefined;

  useEffect(() => {
    Promise.all([listUsers(), listRoles(), listFacilities()])
      .then(([u, r, f]) => {
        setUsers(u);
        setRoles(r);
        setFacilities(f);
      })
      .catch(setRefDataError)
      .finally(() => setRefDataLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <Link
        href="/staff"
        className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-ink-3 transition-colors hover:text-ink-2"
      >
        <ArrowLeft size={13} /> Back to Staff accounts
      </Link>
      <h1 className="text-[20px] font-semibold tracking-tight text-ink">Role assignments</h1>
      <p className="mt-1 text-[13px] text-ink-2">
        Grant or revoke Organisation-scoped and Facility-scoped roles.
      </p>

      {presetUser && (
        <div className="mt-3 rounded-lg border border-brand-line bg-brand-tint px-3.5 py-2.5 text-[12.5px] text-brand">
          Assigning a role for <strong>{presetUser.full_name}</strong> — use
          Facility-scoped below for most staff roles (doctor, receptionist),
          Organisation-scoped for org-wide roles (Owner, admin).
        </div>
      )}

      {refDataLoading && <Loading label="Loading…" />}
      {!refDataLoading && Boolean(refDataError) && (
        <ErrorState error={refDataError} onRetry={() => window.location.reload()} />
      )}
      {!refDataLoading && !refDataError && (
        <div className="mt-6 flex flex-col gap-6">
          <OrganisationAssignments
            users={users}
            roles={roles}
            canManage={canManage}
            presetUserId={presetUserId}
          />
          <FacilityAssignments
            users={users}
            roles={roles}
            facilities={facilities}
            canManage={canManage}
            presetUserId={presetUserId}
          />
        </div>
      )}
    </div>
  );
}

function OrganisationAssignments({
  users,
  roles,
  canManage,
  presetUserId,
}: {
  users: StaffUser[];
  roles: Role[];
  canManage: boolean;
  presetUserId?: string;
}) {
  const [assignments, setAssignments] = useState<OrganisationRoleAssignment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [showAssign, setShowAssign] = useState(false);

  const orgRoles = roles.filter((r) => r.scope_type === "organisation");

  function reload() {
    setLoading(true);
    setLoadError(null);
    listOrganisationRoleAssignments()
      .then(setAssignments)
      .catch(setLoadError)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    queueMicrotask(reload);
  }, []);

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[14.5px] font-semibold text-ink">Organisation-scoped</h2>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowAssign(true)}
            className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-surface-2"
          >
            <Plus size={13} /> Assign
          </button>
        )}
      </div>

      {showAssign && (
        <AssignDialog
          scope="organisation"
          users={users}
          roles={orgRoles}
          presetUserId={presetUserId}
          onClose={() => setShowAssign(false)}
          onAssigned={() => {
            setShowAssign(false);
            reload();
          }}
        />
      )}

      <div className="mt-3">
        {loading && <Loading label="Loading assignments…" />}
        {!loading && Boolean(loadError) && <ErrorState error={loadError} onRetry={reload} />}
        {!loading && !loadError && assignments && assignments.length === 0 && (
          <p className="text-[12.5px] text-ink-2">No Organisation-role assignments yet.</p>
        )}
        {!loading && !loadError && assignments && assignments.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {assignments.map((a) => (
              <AssignmentRow
                key={a.id}
                label={`${userName(users, a.user_id)} — ${roleName(roles, a.role_id)}`}
                onRevoke={() => revokeOrganisationRole(a.id)}
                onRevoked={reload}
                canRevoke={canManage}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function FacilityAssignments({
  users,
  roles,
  facilities,
  canManage,
  presetUserId,
}: {
  users: StaffUser[];
  roles: Role[];
  facilities: Facility[];
  canManage: boolean;
  presetUserId?: string;
}) {
  const [facilityId, setFacilityId] = useState(facilities[0]?.facility_id ?? "");
  const [assignments, setAssignments] = useState<FacilityRoleAssignment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  // Facility-scoped covers most real staff roles (doctor, receptionist), so
  // arriving here for a just-created user opens straight to this form —
  // Organisation-scoped stays a manual click since it's the less common case.
  const [showAssign, setShowAssign] = useState(Boolean(presetUserId) && canManage);
  const [doctorProfiles, setDoctorProfiles] = useState<DoctorProfile[]>([]);
  // Set right after a successful assignment turns out to be Doctor with no
  // existing profile — closes the discovery gap this screen used to leave
  // open (assign the role here, only find out a profile is missing later
  // when a receptionist can't find them in the booking dropdown).
  const [profileNudge, setProfileNudge] = useState<{ userId: string } | null>(null);

  const facilityRoles = roles.filter((r) => r.scope_type === "facility");
  // Same "is this actually a Doctor role" check /staff/doctors uses to
  // build its own eligible-users list — kept identical on purpose so the
  // nudge triggers exactly when that page would actually show this person.
  const doctorRoleIds = new Set(
    facilityRoles
      .filter((r) => r.role_name.toLowerCase() === "doctor")
      .map((r) => r.role_id),
  );
  const doctorProfileUserIds = new Set(doctorProfiles.map((p) => p.user_id));

  function reload() {
    if (!facilityId) return;
    setLoading(true);
    setLoadError(null);
    listFacilityRoleAssignments(facilityId)
      .then(setAssignments)
      .catch(setLoadError)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    queueMicrotask(reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilityId]);

  // Doctor profiles aren't Facility-filtered server-side, so this loads
  // once — same reference data /staff/doctors itself fetches, just reused
  // here to decide whether the nudge is actually needed.
  useEffect(() => {
    queueMicrotask(() => {
      listDoctorProfiles()
        .then(setDoctorProfiles)
        .catch(() => setDoctorProfiles([]));
    });
  }, []);

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[14.5px] font-semibold text-ink">Facility-scoped</h2>
        <div className="flex items-center gap-2">
          <select
            value={facilityId}
            onChange={(e) => setFacilityId(e.target.value)}
            className="rounded-lg border border-line-2 bg-surface px-2.5 py-1.5 text-[12px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
          >
            {facilities.map((f) => (
              <option key={f.facility_id} value={f.facility_id}>
                {f.facility_name}
              </option>
            ))}
          </select>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowAssign(true)}
              disabled={!facilityId}
              className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-surface-2 disabled:opacity-60"
            >
              <Plus size={13} /> Assign
            </button>
          )}
        </div>
      </div>

      {facilities.length === 0 && (
        <p className="mt-3 text-[12.5px] text-ink-2">
          No Facilities exist yet — create one first.
        </p>
      )}

      {showAssign && facilityId && (
        <AssignDialog
          scope="facility"
          facilityId={facilityId}
          users={users}
          roles={facilityRoles}
          presetUserId={presetUserId}
          onClose={() => setShowAssign(false)}
          onAssigned={(userId, roleId) => {
            setShowAssign(false);
            reload();
            setProfileNudge(
              doctorRoleIds.has(roleId) && !doctorProfileUserIds.has(userId)
                ? { userId }
                : null,
            );
          }}
        />
      )}

      {profileNudge && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-draft-line bg-draft-tint px-3.5 py-2.5">
          <div className="flex items-start gap-2 text-[12.5px] text-draft">
            <Stethoscope size={15} className="mt-0.5 shrink-0" />
            <span>
              <strong>{userName(users, profileNudge.userId)}</strong> has no
              bookable Doctor profile yet — without one, receptionists
              won&apos;t be able to find them when booking an appointment.
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/staff/doctors?user_id=${profileNudge.userId}`}
              className="whitespace-nowrap rounded-lg bg-draft px-3 py-1.5 text-[11.5px] font-medium text-white hover:opacity-90"
            >
              Create profile now
            </Link>
            <button
              type="button"
              onClick={() => setProfileNudge(null)}
              className="text-draft/70 hover:text-draft"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {facilityId && (
        <div className="mt-3">
          {loading && <Loading label="Loading assignments…" />}
          {!loading && Boolean(loadError) && <ErrorState error={loadError} onRetry={reload} />}
          {!loading && !loadError && assignments && assignments.length === 0 && (
            <p className="text-[12.5px] text-ink-2">No Facility-role assignments at this Facility yet.</p>
          )}
          {!loading && !loadError && assignments && assignments.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {assignments.map((a) => (
                <AssignmentRow
                  key={a.id}
                  label={`${userName(users, a.user_id)} — ${roleName(roles, a.role_id)}`}
                  onRevoke={() => revokeFacilityRole(a.id)}
                  onRevoked={reload}
                  canRevoke={canManage}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function AssignmentRow({
  label,
  onRevoke,
  onRevoked,
  canRevoke,
}: {
  label: string;
  onRevoke: () => Promise<void>;
  onRevoked: () => void;
  canRevoke: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRevoke() {
    setError(null);
    setBusy(true);
    try {
      await onRevoke();
      onRevoked();
    } catch (err) {
      // Real, stable conflict messages (spec's explicit instruction) — e.g.
      // "Cannot revoke the last active Organisation Owner assignment".
      setError(defaultMessageFor(err));
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center gap-2 rounded-lg border border-line-2 px-3 py-2">
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-brand-tint text-brand">
        <UserCog size={13} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] text-ink">{label}</span>
        {error && <span className="mt-0.5 block text-[11px] text-alert">{error}</span>}
      </span>
      {canRevoke && !confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="shrink-0 rounded-md border border-line px-2.5 py-1 text-[11.5px] font-medium text-ink-2 transition-colors hover:bg-surface-2"
        >
          Revoke
        </button>
      ) : canRevoke ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={handleRevoke}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md bg-alert px-2.5 py-1 text-[11.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy && <Loader2 size={11} className="animate-spin" />}
            Confirm
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="rounded-md border border-line px-2.5 py-1 text-[11.5px] font-medium text-ink-2 transition-colors hover:bg-surface-2"
          >
            Cancel
          </button>
        </div>
      ) : null}
    </li>
  );
}

function AssignDialog({
  scope,
  facilityId,
  users,
  roles,
  presetUserId,
  onClose,
  onAssigned,
}: {
  scope: "organisation" | "facility";
  facilityId?: string;
  users: StaffUser[];
  roles: Role[];
  presetUserId?: string;
  onClose: () => void;
  /** Facility-scoped callers use (userId, roleId) to decide whether to
   *  show the "no bookable profile yet" nudge; organisation-scoped
   *  assignment has no such follow-up and just ignores them. */
  onAssigned: (userId: string, roleId: string) => void;
}) {
  const [userId, setUserId] = useState(presetUserId ?? users[0]?.user_id ?? "");
  const [roleId, setRoleId] = useState(roles[0]?.role_id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!userId || !roleId) {
      setError("Choose a user and a role.");
      return;
    }
    setBusy(true);
    try {
      if (scope === "organisation") {
        await assignOrganisationRole({ user_id: userId, role_id: roleId });
      } else if (facilityId) {
        await assignFacilityRole({ user_id: userId, facility_id: facilityId, role_id: roleId });
      }
      onAssigned(userId, roleId);
    } catch (err) {
      // Real, stable conflict/permission messages — spec's explicit
      // instruction not to collapse these into a generic failure. Covers:
      // dupe-active-assignment (409), org-role can't-reactivate-after-
      // revoke (409), privilege-escalation guards (403), wrong-scope role
      // for this assignment type (422).
      setError(err instanceof ApiError ? err.message || defaultMessageFor(err) : defaultMessageFor(err));
    } finally {
      setBusy(false);
    }
  }

  if (roles.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-line-2 bg-surface-2 p-4 text-[12.5px] text-ink-2">
        No {scope}-scoped roles exist yet — create one from{" "}
        <Link href="/staff/roles" className="text-brand underline">
          Manage roles
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-line-2 bg-surface-2 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-ink">
          Assign {scope === "organisation" ? "Organisation" : "Facility"} role
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
          <span className="text-[11.5px] font-medium text-ink-2">User</span>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
          >
            {users.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.full_name} ({u.email})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-medium text-ink-2">Role</span>
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
          >
            {roles.map((r) => (
              <option key={r.role_id} value={r.role_id}>
                {r.role_name}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-1 flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-md bg-brand px-3.5 py-1.5 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            Assign
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
