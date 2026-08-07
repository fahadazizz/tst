"use client";

// staff/page.tsx — spec §9.5: Staff accounts. Was previously a dead link:
// the Sidebar's "Staff & roles" nav item has pointed at /staff since it was
// added, but no page.tsx existed here at all (same class of bug as the
// /settings hub fixed in T1-1).
//
// Documented flow (spec §9.5) — create and assign are genuinely two
// separate backend calls (POST /auth/users, then POST /organisation-roles
// or /facility-roles), so this screen only does step 1 directly:
//   1. Owner creates user with full name, email, phone, temporary password.
//   2. Owner assigns Organisation or Facility role.        (T1-4)
//   3. For doctors, Owner creates Doctor profile/schedule.  (T1-5)
//   4. User logs in and changes password.
// Step 2 isn't stranded on a separate page with no path to it, though: the
// just-created user's password card links straight to
// /staff/role-assignments?user_id=<id>, which pre-selects them there.
// There is no invitation-email workflow — the backend takes the password
// directly from the Owner, so the UI must not imply an invite was sent.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Plus,
  Loader2,
  X,
  Check,
  Copy,
  ShieldCheck,
  UserCog,
  KeyRound,
  Stethoscope,
  Receipt,
  Pencil,
  ArrowRight,
} from "lucide-react";
import { useSession } from "@/context/session";
import { hasPermission } from "@/lib/permissions";
import {
  listUsers,
  createUser,
  updateUser,
  deactivateUser,
  type StaffUser,
  type UserCreate,
  type UserUpdate,
} from "@/lib/api/staff";
import { ApiError } from "@/lib/api";
import { defaultMessageFor, parseValidationErrorsByField } from "@/lib/errors";
import { Loading, ErrorState, EmptyState } from "@/components/design-system/States";

export default function StaffPage() {
  const { scope } = useSession();
  const [users, setUsers] = useState<StaffUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createdUser, setCreatedUser] = useState<{ user: StaffUser; password: string } | null>(
    null,
  );

  const canCreate = hasPermission(scope, "user.create");
  const canUpdate = hasPermission(scope, "user.update");
  const canDelete = hasPermission(scope, "user.delete");
  const canManageRoles = hasPermission(scope, "role.read");
  const canAssignRoles = hasPermission(scope, "role.manage");
  const canReadPermissions = hasPermission(scope, "permission_catalogue.read");
  const canReadDoctors = hasPermission(scope, "user.read");
  const canReadFeeSchedules = hasPermission(scope, "fee_schedule.read");

  function reload() {
    setLoading(true);
    setLoadError(null);
    listUsers()
      .then(setUsers)
      .catch(setLoadError)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    queueMicrotask(reload);
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {(canManageRoles ||
        canAssignRoles ||
        canReadPermissions ||
        canReadDoctors ||
        canReadFeeSchedules) && (
        <div className="mb-8 flex flex-nowrap gap-2 overflow-x-auto border-b border-line pb-6">
          {canReadDoctors && (
            <Link
              href="/staff/doctors"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-brand-line hover:bg-brand-tint hover:text-brand"
            >
              <Stethoscope size={14} /> Doctor profiles
            </Link>
          )}
          {canReadFeeSchedules && (
            <Link
              href="/staff/fee-schedules"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-brand-line hover:bg-brand-tint hover:text-brand"
            >
              <Receipt size={14} /> Fee schedules
            </Link>
          )}
          {canManageRoles && (
            <Link
              href="/staff/roles"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-brand-line hover:bg-brand-tint hover:text-brand"
            >
              <ShieldCheck size={14} /> Manage roles
            </Link>
          )}
          {canAssignRoles && (
            <Link
              href="/staff/role-assignments"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-brand-line hover:bg-brand-tint hover:text-brand"
            >
              <UserCog size={14} /> Role assignments
            </Link>
          )}
          {canReadPermissions && (
            <Link
              href="/staff/permissions"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-brand-line hover:bg-brand-tint hover:text-brand"
            >
              <KeyRound size={14} /> Permission catalogue
            </Link>
          )}
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-ink">Staff accounts</h1>
          <p className="mt-1 text-[13px] text-ink-2">
            Users in this Organisation. Assigning roles happens separately once a
            user is created.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
          >
            <Plus size={14} /> New staff account
          </button>
        )}
      </div>

      {createdUser && (
        <TemporaryPasswordCard
          user={createdUser.user}
          password={createdUser.password}
          canAssignRoles={canAssignRoles}
          onDismiss={() => setCreatedUser(null)}
        />
      )}

      {showCreate && (
        <CreateStaffDialog
          onClose={() => setShowCreate(false)}
          onCreated={(user, password) => {
            setShowCreate(false);
            setCreatedUser({ user, password });
            reload();
          }}
        />
      )}

      <div className="mt-6">
        {loading && <Loading label="Loading staff accounts…" />}
        {!loading && Boolean(loadError) && <ErrorState error={loadError} onRetry={reload} />}
        {!loading && !loadError && users && users.length === 0 && (
          <EmptyState
            icon={Users}
            title="No staff accounts yet"
            description={canCreate ? "Create your first staff account to get started." : undefined}
          />
        )}
        {!loading && !loadError && users && users.length > 0 && (
          <div className="divide-y divide-line rounded-xl border border-line bg-surface">
            {users.map((u) => (
              <StaffRow
                key={u.user_id}
                user={u}
                canUpdate={canUpdate}
                canDelete={canDelete}
                onChanged={reload}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StaffRow({
  user,
  canUpdate,
  canDelete,
  onChanged,
}: {
  user: StaffUser;
  canUpdate: boolean;
  canDelete: boolean;
  onChanged: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDeactivate() {
    setError(null);
    setBusy(true);
    try {
      await deactivateUser(user.user_id);
      onChanged();
    } catch (err) {
      setError(defaultMessageFor(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
        <Users size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-ink">
          {user.full_name}
        </span>
        <span className="block truncate text-[11.5px] text-ink-3">
          {user.email}
          {user.phone_number ? ` · ${user.phone_number}` : ""}
        </span>
        {error && <span className="mt-1 block text-[11px] text-alert">{error}</span>}
      </span>
      {!user.is_active && (
        <span className="shrink-0 rounded-full border border-alert-line bg-alert-tint px-2 py-0.5 text-[10.5px] font-medium text-alert">
          Deactivated
        </span>
      )}
      {canDelete && user.is_active && (
        <>
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="shrink-0 rounded-md border border-line px-2.5 py-1.5 text-[11.5px] font-medium text-ink-2 transition-colors hover:bg-surface-2"
            >
              Deactivate
            </button>
          ) : (
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={handleDeactivate}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-md bg-alert px-2.5 py-1.5 text-[11.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy && <Loader2 size={12} className="animate-spin" />}
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="rounded-md border border-line px-2.5 py-1.5 text-[11.5px] font-medium text-ink-2 transition-colors hover:bg-surface-2"
              >
                Cancel
              </button>
            </div>
          )}
        </>
      )}
      {canUpdate && user.is_active && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-2"
          aria-label={`Edit ${user.full_name}`}
        >
          <Pencil size={14} />
        </button>
      )}
      {editing && (
        <EditStaffDialog
          user={user}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function EditStaffDialog({
  user,
  onClose,
  onSaved,
}: {
  user: StaffUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(user.full_name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone_number ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);
    try {
      const payload: UserUpdate = {
        full_name: fullName.trim(),
        email: email.trim(),
        phone_number: phone.trim() || null,
      };
      await updateUser(user.user_id, payload);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.httpStatus === 422) {
        const next = parseValidationErrorsByField(err.details);
        if (Object.keys(next).length > 0) setFieldErrors(next);
        else setError("Some fields are invalid. Please review and try again.");
      } else if (err instanceof ApiError && err.httpStatus === 409) {
        setError(err.message || "A user with this email already exists.");
      } else {
        setError(defaultMessageFor(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-[14.5px] font-semibold text-ink">Edit staff account</h2>
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
            <span className="text-[12px] font-medium text-ink-2">Full name</span>
            <input
              required
              autoFocus
              maxLength={255}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={`rounded-lg border bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint ${
                fieldErrors.full_name ? "border-alert" : "border-line-2"
              }`}
            />
            {fieldErrors.full_name && (
              <span className="text-[11.5px] text-alert">{fieldErrors.full_name}</span>
            )}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-ink-2">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`rounded-lg border bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint ${
                fieldErrors.email ? "border-alert" : "border-line-2"
              }`}
            />
            {fieldErrors.email && (
              <span className="text-[11.5px] text-alert">{fieldErrors.email}</span>
            )}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-ink-2">Phone number</span>
            <input
              maxLength={30}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
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
              Save changes
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
    </div>
  );
}

function TemporaryPasswordCard({
  user,
  password,
  canAssignRoles,
  onDismiss,
}: {
  user: StaffUser;
  password: string;
  canAssignRoles: boolean;
  onDismiss: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied — the password is still selectable as text.
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-approved-line bg-approved-tint p-5">
      <h2 className="text-[14.5px] font-semibold text-ink">
        {user.full_name} was created
      </h2>
      <p className="mt-1 text-[12.5px] text-ink-2">
        This is a <strong>temporary</strong> password — it will not be shown again
        after you leave this page. Hand it off to {user.full_name} through a secure
        channel outside this app (this application has no invitation-email
        workflow), and have them change it at first login.
      </p>
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-line-2 bg-surface px-3.5 py-2.5">
        <code className="min-w-0 flex-1 select-all break-all font-mono text-[13px] text-ink">
          {password}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-2"
          aria-label="Copy temporary password"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <label className="mt-3 flex items-start gap-2 text-[12.5px] text-ink-2">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5"
        />
        I&apos;ve securely recorded or handed off this password.
      </label>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={!acknowledged}
          onClick={onDismiss}
          className="rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Done
        </button>
        {canAssignRoles && (
          <Link
            href={`/staff/role-assignments?user_id=${user.user_id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-2"
          >
            Assign a role <ArrowRight size={13} />
          </Link>
        )}
      </div>
    </div>
  );
}

function CreateStaffDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (user: StaffUser, password: string) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    if (password.length < 8 || password.length > 72) {
      setFieldErrors({ password: "Must be 8–72 characters." });
      return;
    }
    setBusy(true);
    try {
      const payload: UserCreate = {
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        ...(phone.trim() && { phone_number: phone.trim() }),
      };
      const user = await createUser(payload);
      onCreated(user, password);
    } catch (err) {
      if (err instanceof ApiError && err.httpStatus === 422) {
        const next = parseValidationErrorsByField(err.details);
        if (Object.keys(next).length > 0) setFieldErrors(next);
        else setError("Some fields are invalid. Please review and try again.");
      } else if (err instanceof ApiError && err.httpStatus === 409) {
        setError(err.message || "A user with this email already exists.");
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
        <h2 className="text-[14.5px] font-semibold text-ink">New staff account</h2>
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
          <span className="text-[12px] font-medium text-ink-2">Full name</span>
          <input
            required
            autoFocus
            maxLength={255}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={`rounded-lg border bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint ${
              fieldErrors.full_name ? "border-alert" : "border-line-2"
            }`}
          />
          {fieldErrors.full_name && (
            <span className="text-[11.5px] text-alert">{fieldErrors.full_name}</span>
          )}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-2">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`rounded-lg border bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint ${
              fieldErrors.email ? "border-alert" : "border-line-2"
            }`}
          />
          {fieldErrors.email && (
            <span className="text-[11.5px] text-alert">{fieldErrors.email}</span>
          )}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-2">Phone number (optional)</span>
          <input
            maxLength={30}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-2">Temporary password</span>
          <input
            type="text"
            required
            minLength={8}
            maxLength={72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8–72 characters"
            className={`rounded-lg border bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint placeholder:text-ink-3 ${
              fieldErrors.password ? "border-alert" : "border-line-2"
            }`}
          />
          {fieldErrors.password && (
            <span className="text-[11.5px] text-alert">{fieldErrors.password}</span>
          )}
          <span className="text-[11px] text-ink-3">
            Set this yourself and hand it off securely — there is no invitation email.
          </span>
        </label>
        <div className="mt-1 flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Create account
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
