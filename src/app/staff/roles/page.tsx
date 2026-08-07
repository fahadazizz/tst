"use client";

// staff/roles/page.tsx — spec §9.6/§9.7: Role list, create custom role,
// rename/describe/delete custom role, and grant/revoke the role's
// permissions. System roles are immutable through tenant APIs (backend
// enforces this with a real 409 — the UI disabling those actions for system
// roles is a convenience, not the actual boundary).
//
// The permission editor is a real diff-and-reconcile against current state
// (GET /roles/{id}/permissions), not a write-only "add permissions" picker —
// possible now that the backend exposes that read endpoint.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Plus, Loader2, X, Pencil, Lock } from "lucide-react";
import { useSession } from "@/context/session";
import { hasPermission } from "@/lib/permissions";
import {
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  type Role,
  type RoleCreate,
} from "@/lib/api/staff";
import {
  listPermissionCatalogue,
  listRolePermissions,
  assignRolePermission,
  removeRolePermission,
  type Permission,
  type RolePermissionDetail,
} from "@/lib/api/rbac";
import { ApiError } from "@/lib/api";
import { defaultMessageFor } from "@/lib/errors";
import { ROLE_WEIGHT_TIERS, closestWeightTier, weightTierLabel } from "@/lib/roleWeightTiers";
import { ROLE_TEMPLATES, type RoleTemplate } from "@/lib/roleTemplates";
import { Loading, ErrorState, EmptyState } from "@/components/design-system/States";

const SCOPE_TYPES = ["organisation", "facility"] as const;

// spec §6.5.2: "Role creation plus multiple permission grants is not one
// documented atomic backend endpoint." A role left half-configured (some
// permissions granted, some not) must never be assignable to staff — thrown
// specifically so the UI can render a blocking state distinct from an
// ordinary save error, per spec point 4.
class PartialRoleConfigurationError extends Error {
  constructor(
    message: string,
    public readonly roleId: string,
  ) {
    super(message);
    this.name = "PartialRoleConfigurationError";
  }
}

/** Creates a Role, then grants every listed permission. If any grant fails,
 *  stops issuing new grants (spec point 1), removes every link this
 *  operation itself created (spec point 2 — best-effort; role_permissions
 *  also carries an ON DELETE CASCADE from roles at the DB level, so a failed
 *  individual removal here still gets cleaned up by the role delete below),
 *  then deletes the newly-created Role, which cannot have any assignments
 *  yet since nothing else has touched it (spec point 3). Only if that final
 *  delete itself fails does this throw PartialRoleConfigurationError instead
 *  of a plain Error — that's the one case needing manual admin
 *  reconciliation (spec points 4-6), not a normal retry. */
async function createRoleWithPermissionsAtomic(
  payload: RoleCreate,
  permissionIds: string[],
): Promise<Role> {
  const created = await createRole(payload);
  if (permissionIds.length === 0) return created;

  const granted: string[] = [];
  let failureReason: unknown = null;
  for (const permissionId of permissionIds) {
    try {
      const link = await assignRolePermission({
        role_id: created.role_id,
        permission_id: permissionId,
      });
      granted.push(link.id);
    } catch (err) {
      failureReason = err;
      break;
    }
  }

  if (failureReason === null) return created;

  await Promise.allSettled(
    granted.map((rolePermissionId) => removeRolePermission(rolePermissionId)),
  );

  try {
    await deleteRole(created.role_id);
  } catch {
    throw new PartialRoleConfigurationError(
      `This role (ID ${created.role_id}) was left in a partially-configured ` +
        "state and could not be automatically cleaned up. It has not been " +
        "assigned to anyone — do not assign it until an administrator " +
        "reconciles or deletes it manually.",
      created.role_id,
    );
  }

  throw new Error(
    `Couldn't finish creating this role: ${defaultMessageFor(failureReason)} ` +
      "Nothing was left behind — the role and any partially-granted " +
      "permissions were rolled back. Fix the issue and try again.",
  );
}

export default function RolesPage() {
  const { scope } = useSession();
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);

  const canManage = hasPermission(scope, "role.manage");

  function reload() {
    setLoading(true);
    setLoadError(null);
    listRoles()
      .then(setRoles)
      .catch(setLoadError)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    queueMicrotask(reload);
  }, []);

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
          <h1 className="text-[20px] font-semibold tracking-tight text-ink">Roles</h1>
          <p className="mt-1 text-[13px] text-ink-2">
            System roles are immutable. Custom roles can be renamed, described, or
            deleted.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
          >
            <Plus size={14} /> New role
          </button>
        )}
      </div>

      {showCreate && (
        <RoleDialog
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            reload();
          }}
        />
      )}
      {editing && (
        <RoleDialog
          mode="edit"
          role={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}

      <div className="mt-6">
        {loading && <Loading label="Loading roles…" />}
        {!loading && Boolean(loadError) && <ErrorState error={loadError} onRetry={reload} />}
        {!loading && !loadError && roles && roles.length === 0 && (
          <EmptyState icon={ShieldCheck} title="No roles yet" />
        )}
        {!loading && !loadError && roles && roles.length > 0 && (
          <div className="divide-y divide-line rounded-xl border border-line bg-surface">
            {roles.map((r) => (
              <RoleRow
                key={r.role_id}
                role={r}
                canManage={canManage}
                onEdit={() => setEditing(r)}
                onDeleted={reload}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RoleRow({
  role,
  canManage,
  onEdit,
  onDeleted,
}: {
  role: Role;
  canManage: boolean;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    setBusy(true);
    try {
      await deleteRole(role.role_id);
      onDeleted();
    } catch (err) {
      setError(defaultMessageFor(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
        {role.is_system_role ? <Lock size={15} /> : <ShieldCheck size={16} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-ink">
          {role.role_name}
        </span>
        <span className="block truncate text-[11.5px] text-ink-3">
          {role.scope_type}
          {!role.is_system_role &&
            ` · ${weightTierLabel(role.weight)}`}
          {role.description ? ` · ${role.description}` : ""}
        </span>
        {error && <span className="mt-1 block text-[11px] text-alert">{error}</span>}
      </span>
      {role.is_system_role ? (
        <span className="shrink-0 rounded-full border border-line-2 bg-surface-2 px-2 py-0.5 text-[10.5px] font-medium text-ink-3">
          System
        </span>
      ) : (
        canManage && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onEdit}
              className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-2"
              aria-label={`Edit ${role.role_name}`}
            >
              <Pencil size={14} />
            </button>
            {!confirming ? (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-md border border-line px-2.5 py-1.5 text-[11.5px] font-medium text-ink-2 transition-colors hover:bg-surface-2"
              >
                Delete
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleDelete}
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
              </>
            )}
          </div>
        )
      )}
    </div>
  );
}

function RoleDialog({
  mode,
  role,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  role?: Role;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(role?.role_name ?? "");
  const [scopeType, setScopeType] = useState<(typeof SCOPE_TYPES)[number]>(
    (role?.scope_type as (typeof SCOPE_TYPES)[number]) ?? "organisation",
  );
  const [description, setDescription] = useState(role?.description ?? "");
  const [weightTier, setWeightTier] = useState<number>(
    closestWeightTier(role?.weight),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partialConfig, setPartialConfig] = useState<PartialRoleConfigurationError | null>(
    null,
  );
  const [appliedTemplateKey, setAppliedTemplateKey] = useState<string | null>(null);

  const [catalogue, setCatalogue] = useState<Permission[] | null>(null);
  const [loadingPermissions, setLoadingPermissions] = useState(true);
  const [permissionsLoadError, setPermissionsLoadError] = useState<unknown>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // permission_id -> role_permission_id for the currently-granted set (edit
  // mode only) — needed to know which DELETE to call for an unchecked box.
  const [originalGrants, setOriginalGrants] = useState<Map<string, string>>(
    new Map(),
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(async () => {
      setLoadingPermissions(true);
      setPermissionsLoadError(null);
      try {
        const [perms, grants] = await Promise.all([
          listPermissionCatalogue(),
          mode === "edit" && role
            ? listRolePermissions(role.role_id)
            : Promise.resolve<RolePermissionDetail[]>([]),
        ]);
        if (cancelled) return;
        setCatalogue(perms);
        const grantMap = new Map<string, string>();
        for (const g of grants) {
          grantMap.set(g.permission.permission_id, g.role_permission_id);
        }
        setOriginalGrants(grantMap);
        setSelectedIds(new Set(grantMap.keys()));
      } catch (err) {
        if (!cancelled) setPermissionsLoadError(err);
      } finally {
        if (!cancelled) setLoadingPermissions(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // mode/role identity don't change within one dialog's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function togglePermission(permissionId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(permissionId)) next.delete(permissionId);
      else next.add(permissionId);
      return next;
    });
    // Editing the checklist by hand after applying a template is expected
    // (spec: "presets, not a hard lock-in") — clear the applied badge so the
    // description/UI stops implying an exact, unmodified template match.
    setAppliedTemplateKey(null);
  }

  // spec §6.5.1: resolve every permission the template names against the
  // CURRENT live catalogue and abort (no partial pre-check) if any is
  // missing/renamed — never guess a permission_id, never proceed on a
  // catalogue that doesn't actually have what the template asks for.
  function applyTemplate(template: RoleTemplate) {
    setError(null);
    if (!catalogue) return;
    const byName = new Map(catalogue.map((p) => [p.permission_name, p.permission_id]));
    const missing = template.permissionNames.filter((n) => !byName.has(n));
    if (missing.length > 0) {
      setError(
        `Template "${template.displayName}" requires permission(s) not present ` +
          `in the current catalogue: ${missing.join(", ")}. Not applied — the ` +
          "backend permission catalogue has drifted from this template's " +
          "definition; an admin needs to update lib/roleTemplates.ts or the " +
          "backend catalogue before this template can be used.",
      );
      return;
    }
    const ids = template.permissionNames.map((n) => byName.get(n)!);
    setSelectedIds(new Set(ids));
    setName(template.displayName);
    setScopeType(template.scopeType);
    setWeightTier(template.defaultWeight);
    setDescription(`Created from product template ${template.key}@${template.version}`);
    setAppliedTemplateKey(template.key);
  }

  // Grants/revokes only the diff against what the role held on open — not a
  // full replace — so a permission nobody touched isn't re-sent.
  async function reconcilePermissions(roleId: string) {
    const toAdd = [...selectedIds].filter((id) => !originalGrants.has(id));
    const toRemove = [...originalGrants.entries()]
      .filter(([permissionId]) => !selectedIds.has(permissionId))
      .map(([, rolePermissionId]) => rolePermissionId);
    if (toAdd.length === 0 && toRemove.length === 0) return;

    const results = await Promise.allSettled([
      ...toAdd.map((permissionId) =>
        assignRolePermission({ role_id: roleId, permission_id: permissionId }),
      ),
      ...toRemove.map((rolePermissionId) => removeRolePermission(rolePermissionId)),
    ]);
    const failures = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    if (failures.length > 0) {
      throw new Error(
        `Role saved, but ${failures.length} permission change${
          failures.length === 1 ? "" : "s"
        } failed: ${failures.map((f) => defaultMessageFor(f.reason)).join("; ")}`,
      );
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPartialConfig(null);
    setBusy(true);
    try {
      if (mode === "create") {
        const payload: RoleCreate = {
          role_name: name.trim(),
          scope_type: scopeType,
          description: description.trim() || null,
          is_system_role: false,
          weight: weightTier,
        };
        // Creation + grants together, with full rollback on partial failure
        // (spec §6.5.2) — not the plain create-then-reconcile path edit mode
        // uses, since a brand-new role must never be left half-configured.
        await createRoleWithPermissionsAtomic(payload, [...selectedIds]);
      } else if (role) {
        await updateRole(role.role_id, {
          role_name: name.trim(),
          description: description.trim() || null,
          weight: weightTier,
        });
        await reconcilePermissions(role.role_id);
      }
      onSaved();
    } catch (err) {
      if (err instanceof PartialRoleConfigurationError) {
        setPartialConfig(err);
      } else if (err instanceof ApiError && err.httpStatus === 409) {
        setError(err.message || "This role cannot be changed.");
      } else if (err instanceof Error && !(err instanceof ApiError)) {
        // reconcilePermissions'/createRoleWithPermissionsAtomic's own thrown
        // Error (partial permission-change failure, fully rolled back).
        setError(err.message);
      } else {
        setError(defaultMessageFor(err));
      }
    } finally {
      setBusy(false);
    }
  }

  // Group by top_level_domain, then module_name — same grouping
  // /staff/permissions uses for the read-only catalogue.
  const grouped = new Map<string, Map<string, Permission[]>>();
  for (const p of catalogue ?? []) {
    const domain = p.top_level_domain ?? "Other";
    if (!grouped.has(domain)) grouped.set(domain, new Map());
    const domainGroup = grouped.get(domain)!;
    if (!domainGroup.has(p.module_name)) domainGroup.set(p.module_name, []);
    domainGroup.get(p.module_name)!.push(p);
  }

  if (partialConfig) {
    // spec §6.5.2 points 4-6: blocking state, no retry-submit offered here —
    // the role exists in a half-configured, unassignable state and needs an
    // administrator to look at it directly (delete it and start over, or
    // manually finish granting/revoking its permissions).
    return (
      <div className="mt-4 rounded-xl border border-alert-line bg-alert-tint p-5">
        <h2 className="text-[14.5px] font-semibold text-alert">
          Partial role configuration — action needed
        </h2>
        <p className="mt-2 text-[12.5px] text-alert">{partialConfig.message}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 rounded-lg border border-alert-line px-4 py-2 text-[13px] font-medium text-alert transition-colors hover:bg-alert-tint"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[14.5px] font-semibold text-ink">
          {mode === "create" ? "New role" : "Edit role"}
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
      {mode === "create" && (
        <div className="mt-4 flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-2">Start from a template (optional)</span>
          <div className="flex flex-wrap gap-1.5">
            {ROLE_TEMPLATES.map((t) => (
              <button
                key={t.key}
                type="button"
                disabled={!catalogue}
                onClick={() => applyTemplate(t)}
                className={`rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  appliedTemplateKey === t.key
                    ? "border-brand bg-brand-tint text-brand"
                    : "border-line-2 text-ink-2 hover:bg-surface-2"
                }`}
              >
                {t.displayName}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-ink-3">
            Pre-fills the name, scope, authority tier, and permission checklist
            below — a starting point, not a lock-in. Edit anything before
            saving.
          </span>
        </div>
      )}
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-2">Role name</span>
          <input
            required
            autoFocus
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
          />
        </label>
        {mode === "create" && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-ink-2">Scope</span>
            <select
              value={scopeType}
              onChange={(e) => setScopeType(e.target.value as (typeof SCOPE_TYPES)[number])}
              className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
            >
              {SCOPE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-ink-3">
              Cannot be changed after creation once any assignment exists.
            </span>
          </label>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-2">Description (optional)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-2">Assignment authority</span>
          <div className="grid grid-cols-2 gap-2">
            {ROLE_WEIGHT_TIERS.map((tier) => (
              <label
                key={tier.value}
                className={`flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2 transition-colors ${
                  weightTier === tier.value
                    ? "border-brand bg-brand-tint"
                    : "border-line-2 hover:bg-surface-2"
                }`}
              >
                <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
                  <input
                    type="radio"
                    name="weightTier"
                    checked={weightTier === tier.value}
                    onChange={() => setWeightTier(tier.value)}
                    className="size-3.5"
                  />
                  {tier.label}
                </span>
                <span className="text-[10.5px] text-ink-3">{tier.hint}</span>
              </label>
            ))}
          </div>
          <span className="text-[11px] text-ink-3">
            Controls who can hand this role out — not what it can do. Someone
            can only assign a role at or below their own tier (a tie also
            blocks it). This has no effect on the permission checklist below.
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-2">Permissions</span>
          {loadingPermissions ? (
            <div className="flex items-center gap-2 py-3 text-[12px] text-ink-2">
              <Loader2 size={13} className="animate-spin" /> Loading permission catalogue…
            </div>
          ) : permissionsLoadError ? (
            <div className="rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[12px] text-alert">
              Couldn&apos;t load the permission catalogue. {defaultMessageFor(permissionsLoadError)}
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-line-2 px-3 py-2">
              {[...grouped.entries()].map(([domain, modules]) => (
                <div key={domain} className="border-b border-line-2 py-2 last:border-b-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                    {domain}
                  </div>
                  {[...modules.entries()].map(([moduleName, perms]) => (
                    <div key={moduleName} className="mt-1.5">
                      <div className="text-[10.5px] font-medium text-ink-3">{moduleName}</div>
                      <div className="mt-1 flex flex-col gap-1">
                        {perms.map((p) => (
                          <label
                            key={p.permission_id}
                            className="flex items-center gap-2 text-[12px] text-ink"
                          >
                            <input
                              type="checkbox"
                              checked={selectedIds.has(p.permission_id)}
                              onChange={() => togglePermission(p.permission_id)}
                              className="size-3.5 rounded border-line-2"
                            />
                            {p.display_name ?? p.permission_name}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          <span className="text-[11px] text-ink-3">
            {selectedIds.size} permission{selectedIds.size === 1 ? "" : "s"} selected.
          </span>
        </div>
        <div className="mt-1 flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {mode === "create" ? "Create role" : "Save changes"}
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
