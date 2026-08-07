"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Building2,
  Check,
  CreditCard,
  Edit3,
  FileSearch,
  KeyRound,
  LayoutDashboard,
  ShieldAlert,
  Loader2,
  LogIn,
  LogOut,
  MapPinned,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings2,
  Trash2,
  UserCog,
  Eye,
  EyeOff,
  X,
} from "lucide-react";
import { useAuth } from "@/context/auth";
import { usePlatformAuth, type PlatformIdentity } from "@/context/platform-auth";
import {
  createPlatformConfig,
  createPlatformGroup,
  createPlatformGroupSubscription,
  createPlatformUser,
  deletePlatformConfig,
  deactivatePlatformGroup,
  deactivatePlatformOrganisation,
  deactivatePlatformUser,
  getPlatformConfig,
  getPlatformOrganisation,
  getPlatformUser,
  getPlatformDashboard,
  getPlatformGroup,
  getPlatformGroupCapacity,
  listPlatformGroupOrganisations,
  listPlatformGroups,
  listPlatformAuditLogs,
  listPlatformConfigs,
  listPlatformUsers,
  provisionPlatformOrganisation,
  resetPlatformUserMfa,
  startPlatformImpersonation,
  updatePlatformConfig,
  updatePlatformGroup,
  updatePlatformGroupSubscription,
  updatePlatformOrganisation,
  updatePlatformUser,
  type PlatformConfig,
  type PlatformConfigCreate,
  type PlatformConfigUpdate,
  type ImpersonationStartResponse,
  type PlatformGroup,
  type PlatformGroupCapacity,
  type PlatformGroupCreate,
  type PlatformGroupUpdate,
  type PlatformAuditLog,
  type PlatformDashboard,
  type PlatformOrganisation,
  type PlatformOrganisationUpdate,
  type PlatformUser,
  type PlatformUserCreate,
  type PlatformUserUpdate,
  type ProvisionOrganisationResponse,
  listPlatformOrgAuditEvents,
  listPlatformOrgLoginAttempts,
  listPlatformOrgRoleChanges,
  listPlatformOrgCrossFacilityAccess,
  listPlatformOrgFacilities,
  createPlatformOrgFacility,
  updatePlatformOrgFacility,
  deactivatePlatformOrgFacility,
  getPlatformOrgIntelligenceDashboard,
  changePlatformPassword,
} from "@/lib/api/platform";
import type {
  AuditEvent,
  CrossFacilityAccess,
  LoginAttempt,
  RoleChange,
} from "@/lib/api/compliance";
import type { Facility, FacilityCreate, FacilityUpdate } from "@/lib/api/tenant";
import type { IntelligenceDashboard } from "@/lib/api/intelligence";
import { ExecutionCard } from "@/components/intelligence/ExecutionCard";
import { addDays } from "@/lib/format";
import { isApiError } from "@/lib/api";
import { ErrorState, Loading } from "@/components/design-system/States";

// The viewer's own local calendar day. Deliberately NOT `zonedDateKey()` from
// lib/format — that reads the tenant Facility timezone set by the tenant
// SessionProvider, and the Platform Console has no Facility concept at all.
// Reusing it here would risk a stale tenant timezone leaking into a platform
// screen after "End impersonation" (which clears tenant tokens/cache but not
// that module-level timezone) navigates back to /platform client-side.
function localToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

type ViewKey =
  | "overview"
  | "groups"
  | "inspect"
  | "users"
  | "config"
  | "audit"
  | "impersonation"
  | "account";

type InspectTab =
  | "overview"
  | "facilities"
  | "audit"
  | "login"
  | "roles"
  | "cross"
  | "analytics";

interface OverviewShape {
  groups: string;
  organisations: string;
  facilities: string;
  tenantUsers: string;
  platformUsers: string;
  subscriptions: string;
  outbox: string;
  recentAudit: string;
}

export default function PlatformHomePage() {
  const router = useRouter();
  const { logout, identity, identityState } = usePlatformAuth();
  const { applyImpersonationSession } = useAuth();
  // Auditor is the one real role that must never see write affordances —
  // confirmed against the backend's own require_platform_permission():
  // admin/super_admin bypass every check, auditor passes only permissions
  // ending in ":read". Default to the safe (no-write) assumption while
  // identity is still resolving, rather than briefly flashing write buttons
  // an auditor can't actually use.
  // Fail OPEN, not closed: the backend is the real enforcement boundary
  // (every write endpoint checks the real permission regardless of what
  // this UI shows), so if identity resolution hasn't succeeded yet — or
  // ever, for whatever reason — hiding every write button everywhere is
  // strictly worse than showing them and letting a real 403 explain itself.
  // Only hide once the role is POSITIVELY confirmed as auditor.
  const canWrite = identity?.platform_role !== "auditor";
  // Impersonation is the one action worth the opposite default: it's
  // super_admin-only and irreversible-feeling enough that showing the entry
  // point before role is confirmed is worse than a brief "still loading".
  const canImpersonate = identity?.platform_role === "super_admin";

  const [view, setView] = useState<ViewKey>("overview");
  const [inspectOrganisationId, setInspectOrganisationId] = useState<string | null>(null);
  const [inspectTab, setInspectTab] = useState<InspectTab>("overview");
  const [impersonateOrganisationId, setImpersonateOrganisationId] = useState<
    string | null
  >(null);

  function goInspect(organisationId: string, tab: InspectTab = "overview") {
    setInspectOrganisationId(organisationId);
    setInspectTab(tab);
    setView("inspect");
  }

  const [groups, setGroups] = useState<PlatformGroup[]>([]);
  const [groupCapacities, setGroupCapacities] = useState<Map<string, PlatformGroupCapacity>>(
    new Map(),
  );
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<PlatformGroup | null>(null);
  const [capacity, setCapacity] = useState<PlatformGroupCapacity | null>(null);
  const [organisations, setOrganisations] = useState<PlatformOrganisation[]>([]);
  const [recentAudit, setRecentAudit] = useState<PlatformAuditLog | null>(null);
  const [recentAuditState, setRecentAuditState] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  // Platform-wide aggregate — independent of which Group is selected below,
  // unlike the old overview that reused the selected Group's capacity as a
  // stand-in for a global count.
  const [dashboard, setDashboard] = useState<PlatformDashboard | null>(null);
  const [dashboardState, setDashboardState] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(false);
  const [subscriptionMode, setSubscriptionMode] = useState<"create" | "update" | null>(null);
  const [showProvision, setShowProvision] = useState(false);
  const [provisionResult, setProvisionResult] =
    useState<ProvisionOrganisationResponse | null>(null);
  const [editingOrganisation, setEditingOrganisation] =
    useState<PlatformOrganisation | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function handleLogout() {
    await logout();
    router.replace("/platform/login");
  }

  const loadGroups = useCallback(async () => {
    setLoadingGroups(true);
    setError(null);
    try {
      const [groupsResult, auditResult] = await Promise.allSettled([
        listPlatformGroups(),
        listPlatformAuditLogs({ limit: 1, offset: 0 }),
      ]);
      if (auditResult.status === "fulfilled") {
        setRecentAudit(auditResult.value[0] ?? null);
        setRecentAuditState("ready");
      } else {
        setRecentAudit(null);
        setRecentAuditState("unavailable");
      }
      if (groupsResult.status === "rejected") {
        throw groupsResult.reason;
      }
      const next = groupsResult.value;
      setGroups(next);
      setSelectedGroupId((current) => {
        if (current && next.some((group) => group.group_id === current)) {
          return current;
        }
        return next[0]?.group_id ?? null;
      });
      // Capacity per group, fetched for the whole list at once — this is
      // exactly the "can I provision one more here" question the list
      // needs to answer at a glance, not just for whichever group happens
      // to be selected. GET /groups has no bulk-capacity field, so this is
      // N parallel per-group calls; fine at the scale a platform-ops list
      // of Groups actually runs at.
      const capacityEntries = await Promise.allSettled(
        next.map((group) =>
          getPlatformGroupCapacity(group.group_id).then(
            (capacity) => [group.group_id, capacity] as const,
          ),
        ),
      );
      setGroupCapacities(
        new Map(
          capacityEntries
            .filter(
              (r): r is PromiseFulfilledResult<readonly [string, PlatformGroupCapacity]> =>
                r.status === "fulfilled",
            )
            .map((r) => r.value),
        ),
      );
    } catch (err) {
      setGroups([]);
      setSelectedGroupId(null);
      setSelectedGroup(null);
      setGroupCapacities(new Map());
      setError(isApiError(err) ? err.message : "Couldn't load platform groups.");
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  const loadDetail = useCallback(async (groupId: string) => {
    setLoadingDetail(true);
    setDetailError(null);
    try {
      const [group, groupCapacity, groupOrganisations] = await Promise.all([
        getPlatformGroup(groupId),
        getPlatformGroupCapacity(groupId),
        listPlatformGroupOrganisations(groupId),
      ]);
      setSelectedGroup(group);
      setCapacity(groupCapacity);
      setOrganisations(groupOrganisations);
    } catch (err) {
      setSelectedGroup(null);
      setCapacity(null);
      setOrganisations([]);
      setDetailError(
        isApiError(err) ? err.message : "Couldn't load the selected group.",
      );
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(loadGroups);
  }, [loadGroups]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(async () => {
      setDashboardState("loading");
      try {
        const result = await getPlatformDashboard();
        if (cancelled) return;
        setDashboard(result);
        setDashboardState("ready");
      } catch {
        if (!cancelled) {
          setDashboard(null);
          setDashboardState("unavailable");
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedGroupId) {
      queueMicrotask(() => {
        setSelectedGroup(null);
        setCapacity(null);
        setOrganisations([]);
      });
      return;
    }
    queueMicrotask(() => loadDetail(selectedGroupId));
  }, [loadDetail, selectedGroupId]);

  const overview = useMemo<OverviewShape>(() => {
    const unavailable = dashboardState === "unavailable" || !dashboard;
    const loading = dashboardState === "loading";
    const breakdown = (b: { active: number; total: number } | undefined) =>
      loading ? "…" : unavailable || !b ? "unavailable" : `${b.active}/${b.total} active`;
    return {
      groups: breakdown(dashboard?.groups),
      organisations: breakdown(dashboard?.organisations),
      facilities: breakdown(dashboard?.facilities),
      tenantUsers: breakdown(dashboard?.tenant_users),
      platformUsers: breakdown(dashboard?.platform_users),
      subscriptions: loading
        ? "…"
        : unavailable
          ? "unavailable"
          : `${dashboard.subscriptions.groups_with_active_subscription}/${dashboard.subscriptions.groups_total} active` +
            (dashboard.subscriptions.near_capacity.length > 0
              ? ` · ${dashboard.subscriptions.near_capacity.length} near capacity`
              : ""),
      outbox: loading
        ? "…"
        : unavailable
          ? "unavailable"
          : `${dashboard.outbox.pending_or_retry} pending · ${dashboard.outbox.dead_letter} dead-letter`,
      recentAudit:
        recentAuditState === "loading"
          ? "loading"
          : recentAuditState === "unavailable"
            ? "unavailable"
            : (recentAudit?.action_type ?? "none"),
    };
  }, [dashboard, dashboardState, recentAudit?.action_type, recentAuditState]);

  async function handleCreated(group: PlatformGroup) {
    setShowCreate(false);
    setToast("Group created.");
    await loadGroups();
    setSelectedGroupId(group.group_id);
  }

  async function handleUpdated(group: PlatformGroup) {
    setEditing(false);
    setToast("Group updated.");
    await loadGroups();
    setSelectedGroupId(group.group_id);
  }

  async function handleSubscriptionSaved(groupId: string) {
    setSubscriptionMode(null);
    setToast("Subscription saved.");
    await loadDetail(groupId);
  }

  async function handleProvisioned(result: ProvisionOrganisationResponse) {
    setShowProvision(false);
    setProvisionResult(result);
    setToast("Organisation provisioned.");
    await loadDetail(result.group_id);
  }

  async function handleOrganisationUpdated() {
    setEditingOrganisation(null);
    setToast("Organisation updated.");
    if (selectedGroupId) await loadDetail(selectedGroupId);
  }

  async function handlePrepareOrganisationEdit(organisation: PlatformOrganisation) {
    setDetailError(null);
    setToast(null);
    try {
      const detail = await getPlatformOrganisation(organisation.organisation_id);
      setEditingOrganisation(detail);
    } catch (err) {
      setDetailError(
        isApiError(err) ? err.message : "Couldn't load this Organisation.",
      );
    }
  }

  async function handleImpersonationStarted(session: ImpersonationStartResponse) {
    await applyImpersonationSession(session);
    router.push("/dashboard");
  }

  async function handleDeactivateOrganisation(organisation: PlatformOrganisation) {
    if (!window.confirm(`Deactivate ${organisation.organisation_name}?`)) return;
    setToast(null);
    setDetailError(null);
    try {
      await deactivatePlatformOrganisation(organisation.organisation_id);
      setToast("Organisation deactivated.");
      if (selectedGroupId) await loadDetail(selectedGroupId);
    } catch (err) {
      setDetailError(
        isApiError(err) ? err.message : "Couldn't deactivate this organisation.",
      );
    }
  }

  async function handleDeactivate(group: PlatformGroup) {
    if (!window.confirm(`Deactivate ${group.group_name}?`)) return;
    setToast(null);
    setDetailError(null);
    try {
      await deactivatePlatformGroup(group.group_id);
      setToast("Group deactivated.");
      await loadGroups();
    } catch (err) {
      setDetailError(
        isApiError(err) ? err.message : "Couldn't deactivate this group.",
      );
    }
  }

  return (
    <main className="min-h-screen bg-bg">
      <div className="flex min-h-screen">
        <PlatformSidebar
          view={view}
          onSelect={setView}
          canImpersonate={canImpersonate}
          identity={identity}
          identityState={identityState}
          onLogout={() => void handleLogout()}
        />

        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-7">
          <div className="mx-auto max-w-[1080px]">
            {toast && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-brand-line bg-brand-tint px-3.5 py-2 text-[12.5px] text-brand">
                <Check size={14} />
                {toast}
              </div>
            )}
            {detailError && (
              <div className="mb-4 rounded-xl border border-alert-line bg-alert-tint px-3.5 py-2.5 text-[12.5px] text-alert">
                {detailError}
              </div>
            )}

            {view === "overview" && (
              <OverviewWorkspace
                overview={overview}
                dashboard={dashboard}
                onInspectGroup={() => setView("groups")}
              />
            )}

            {view === "groups" && (
              <section className="grid grid-cols-1 gap-5 lg:grid-cols-[340px_1fr]">
                <div className="rounded-2xl border border-line bg-surface">
                  <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                    <div>
                      <h2 className="text-[14px] font-semibold text-ink">Groups</h2>
                      <p className="text-[11.5px] text-ink-3">
                        Platform-level customer groups
                      </p>
                    </div>
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => setShowCreate(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[12px] font-medium text-white"
                      >
                        <Plus size={13} /> New
                      </button>
                    )}
                  </div>
                  {loadingGroups ? (
                    <Loading label="Loading groups..." />
                  ) : error ? (
                    <ErrorState message={error} onRetry={loadGroups} />
                  ) : groups.length === 0 ? (
                    <div className="px-5 py-10 text-center text-[12.5px] text-ink-2">
                      No platform groups exist yet.
                    </div>
                  ) : (
                    <div className="max-h-[560px] divide-y divide-line overflow-auto">
                      {groups.map((group) => (
                        <button
                          key={group.group_id}
                          type="button"
                          onClick={() => {
                            setSelectedGroupId(group.group_id);
                            setEditing(false);
                            setSubscriptionMode(null);
                            setShowProvision(false);
                            setEditingOrganisation(null);
                            setProvisionResult(null);
                            setToast(null);
                          }}
                          className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 ${
                            selectedGroupId === group.group_id ? "bg-brand-tint" : ""
                          }`}
                        >
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
                            <Building2 size={16} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-medium text-ink">
                              {group.group_name}
                            </span>
                            <span className="block truncate text-[11.5px] text-ink-3">
                              {group.group_type}
                            </span>
                            <MiniCapacityBar capacity={groupCapacities.get(group.group_id)} />
                          </span>
                          <StatusPill active={group.is_active} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-line bg-surface">
                  <div className="flex min-h-[58px] items-center justify-between gap-3 border-b border-line px-5 py-3">
                    <div>
                      <h2 className="text-[14px] font-semibold text-ink">
                        {selectedGroup?.group_name ?? "Group detail"}
                      </h2>
                      <p className="text-[11.5px] text-ink-3">
                        Detail, capacity, and organisations
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => selectedGroupId && void loadDetail(selectedGroupId)}
                      disabled={!selectedGroupId || loadingDetail}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[12px] font-medium text-ink-2 disabled:opacity-50"
                    >
                      {loadingDetail ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <RefreshCw size={13} />
                      )}
                      Refresh
                    </button>
                  </div>

                  {loadingDetail ? (
                    <Loading label="Loading group detail..." />
                  ) : selectedGroup ? (
                    <div className="p-5">
                      {editing ? (
                        <GroupForm
                          mode="edit"
                          group={selectedGroup}
                          onCancel={() => setEditing(false)}
                          onSaved={handleUpdated}
                        />
                      ) : (
                        <>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-[18px] font-semibold text-ink">
                                {selectedGroup.group_name}
                              </div>
                              <div className="mt-1 text-[12.5px] text-ink-2">
                                {selectedGroup.group_type}
                                {selectedGroup.contact_email
                                  ? ` · ${selectedGroup.contact_email}`
                                  : ""}
                              </div>
                              <div className="mt-1 font-mono text-[11px] text-ink-3">
                                {selectedGroup.group_id}
                              </div>
                            </div>
                            {canWrite && (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditing(true)}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[12px] font-medium text-ink-2 hover:bg-surface-2"
                                >
                                  <Edit3 size={13} />
                                  Edit
                                </button>
                                {selectedGroup.is_active && (
                                  <button
                                    type="button"
                                    onClick={() => void handleDeactivate(selectedGroup)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[12px] font-medium text-alert"
                                  >
                                    <Trash2 size={13} />
                                    Deactivate
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {provisionResult && provisionResult.group_id === selectedGroup.group_id && (
                            <ProvisionResultPanel result={provisionResult} />
                          )}

                          <dl className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                            <DetailItem label="Contact person" value={selectedGroup.contact_person_name} />
                            <DetailItem label="Contact phone" value={selectedGroup.contact_phone} />
                            <DetailItem label="Billing address" value={selectedGroup.billing_address} />
                            <DetailItem label="Updated" value={formatDateTime(selectedGroup.updated_at)} />
                          </dl>
                        </>
                      )}

                      <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_1fr]">
                        <CapacityPanel
                          capacity={capacity}
                          onCreateSubscription={() => setSubscriptionMode("create")}
                          onUpdateSubscription={() => setSubscriptionMode("update")}
                          canWrite={canWrite}
                        />
                        <OrganisationPanel
                          organisations={organisations}
                          canWrite={canWrite}
                          onProvision={() => setShowProvision(true)}
                          onEdit={(organisation) =>
                            void handlePrepareOrganisationEdit(organisation)
                          }
                          onInspect={(organisation, tab) => goInspect(organisation.organisation_id, tab)}
                          onDeactivate={(organisation) =>
                            void handleDeactivateOrganisation(organisation)
                          }
                        />
                      </div>

                      {subscriptionMode && (
                        <div className="mt-4 rounded-xl border border-line-2 p-4">
                          <SubscriptionForm
                            mode={subscriptionMode}
                            groupId={selectedGroup.group_id}
                            capacity={capacity}
                            onCancel={() => setSubscriptionMode(null)}
                            onSaved={() => handleSubscriptionSaved(selectedGroup.group_id)}
                          />
                        </div>
                      )}

                      {showProvision && (
                        <div className="mt-4 rounded-xl border border-line-2 p-4">
                          <ProvisionOrganisationForm
                            groupId={selectedGroup.group_id}
                            onCancel={() => setShowProvision(false)}
                            onSaved={handleProvisioned}
                          />
                        </div>
                      )}

                      {editingOrganisation && (
                        <div className="mt-4 rounded-xl border border-line-2 p-4">
                          <OrganisationForm
                            organisation={editingOrganisation}
                            onCancel={() => setEditingOrganisation(null)}
                            onSaved={handleOrganisationUpdated}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex min-h-[360px] items-center justify-center text-[12.5px] text-ink-2">
                      Select a group to inspect it.
                    </div>
                  )}
                </div>
              </section>
            )}

            {view === "inspect" &&
              (inspectOrganisationId ? (
                <InspectOrganisationWorkspace
                  organisationId={inspectOrganisationId}
                  initialTab={inspectTab}
                  canWrite={canWrite}
                  onChangeOrganisation={() => setInspectOrganisationId(null)}
                />
              ) : (
                <GroupOrganisationPicker
                  title="Inspect an Organisation"
                  description="Pick an Organisation to view its facilities, audit trail, and analytics."
                  onPick={(organisation) => goInspect(organisation.organisation_id)}
                />
              ))}

            {view === "users" && <PlatformUsersWorkspace canWrite={canWrite} />}
            {view === "config" && <PlatformConfigWorkspace canWrite={canWrite} />}
            {view === "audit" && <PlatformAuditWorkspace />}

            {view === "impersonation" &&
              (canImpersonate ? (
                <ImpersonationWorkspace
                  organisationId={impersonateOrganisationId}
                  onChangeOrganisation={() => setImpersonateOrganisationId(null)}
                  onPickOrganisation={(organisation) =>
                    setImpersonateOrganisationId(organisation.organisation_id)
                  }
                  onStarted={handleImpersonationStarted}
                />
              ) : (
                <div className="rounded-2xl border border-alert-line bg-alert-tint p-6 text-[13px] text-alert">
                  Impersonation is restricted to Super Admins.
                </div>
              ))}

            {view === "account" && (
              <PlatformAccountPanel
                onClose={() => setView("overview")}
                onPasswordChanged={async () => {
                  await logout();
                  router.replace(
                    `/platform/login?resetSuccess=${encodeURIComponent(
                      "Your password was changed. Please sign in again.",
                    )}`,
                  );
                }}
              />
            )}

            {showCreate && (
              <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 px-4">
                <div className="w-full max-w-xl rounded-2xl border border-line bg-surface p-5 shadow-xl">
                  <GroupForm
                    mode="create"
                    onCancel={() => setShowCreate(false)}
                    onSaved={handleCreated}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function OverviewCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-[11.5px] font-medium uppercase tracking-wide text-ink-3">
        {label}
      </div>
      {/* Some values (Subscriptions' near-capacity count, Outbox health,
          Recent audit's action name) run longer than the original short
          "N active" cards — wrap instead of clipping with an ellipsis. */}
      <div className="mt-2 text-[17px] font-semibold leading-snug text-ink">
        {value}
      </div>
    </div>
  );
}

const NAV_ITEMS: { key: ViewKey; label: string; icon: typeof LayoutDashboard; superAdminOnly?: boolean }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "groups", label: "Groups & Organisations", icon: Building2 },
  { key: "inspect", label: "Inspect Organisation", icon: FileSearch },
  { key: "users", label: "Platform Users", icon: UserCog },
  { key: "config", label: "Platform Config", icon: Settings2 },
  { key: "audit", label: "Platform Audit Log", icon: BarChart3 },
  { key: "impersonation", label: "Impersonation", icon: LogIn, superAdminOnly: true },
  { key: "account", label: "Account", icon: KeyRound },
];

function PlatformSidebar({
  view,
  onSelect,
  canImpersonate,
  identity,
  identityState,
  onLogout,
}: {
  view: ViewKey;
  onSelect: (view: ViewKey) => void;
  canImpersonate: boolean;
  identity: PlatformIdentity | null;
  identityState: "loading" | "ready" | "unavailable";
  onLogout: () => void;
}) {
  return (
    <aside className="flex w-[240px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="border-b border-line px-4 py-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-brand">
          Platform Console
        </p>
        <div className="mt-2">
          {identityState === "loading" ? (
            <div className="text-[12.5px] text-ink-2">Loading identity…</div>
          ) : identity ? (
            <>
              <div className="truncate text-[13.5px] font-medium text-ink">
                {identity.full_name}
              </div>
              <RolePill role={identity.platform_role} />
            </>
          ) : (
            <div className="text-[11.5px] text-alert">
              Couldn&apos;t resolve who you are — Impersonation stays hidden
              until confirmed; other actions still show (the backend still
              enforces the real permission either way).
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_ITEMS.filter((item) => !item.superAdminOnly || canImpersonate).map(
          (item) => {
            const Icon = item.icon;
            const active = view === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelect(item.key)}
                className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] font-medium transition-colors ${
                  active
                    ? "border-r-2 border-brand bg-brand-tint text-brand"
                    : "text-ink-2 hover:bg-surface-2"
                }`}
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          },
        )}
      </nav>

      <div className="border-t border-line p-3">
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] font-medium text-ink hover:bg-surface-2"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </aside>
  );
}

function OverviewWorkspace({
  overview,
  dashboard,
  onInspectGroup,
}: {
  overview: OverviewShape;
  dashboard: PlatformDashboard | null;
  onInspectGroup: () => void;
}) {
  const nearCapacity = dashboard?.subscriptions.near_capacity ?? [];
  const deadLetter = dashboard?.outbox.dead_letter ?? 0;
  const hasSignals = nearCapacity.length > 0 || deadLetter > 0;

  return (
    <div className="flex flex-col gap-5">
      <section className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-4">
        <OverviewCard label="Groups" value={overview.groups} />
        <OverviewCard label="Organisations" value={overview.organisations} />
        <OverviewCard label="Facilities" value={overview.facilities} />
        <OverviewCard label="Tenant users" value={overview.tenantUsers} />
        <OverviewCard label="Platform users" value={overview.platformUsers} />
        <OverviewCard label="Subscriptions" value={overview.subscriptions} />
        <OverviewCard label="Outbox health" value={overview.outbox} />
        <OverviewCard label="Recent audit" value={overview.recentAudit} />
      </section>

      <section className="rounded-2xl border border-line bg-surface">
        <div className="border-b border-line px-5 py-3">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
            <ShieldAlert size={15} className="text-alert" />
            Needs attention
          </h2>
          <p className="text-[11.5px] text-ink-3">
            Groups near a subscription limit, and any dead-lettered outbox
            work — the two things worth checking before something a tenant
            does actually fails.
          </p>
        </div>
        {!hasSignals ? (
          <div className="px-5 py-8 text-center text-[12.5px] text-ink-2">
            Nothing needs attention right now.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {deadLetter > 0 && (
              <div className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="text-[12.5px] text-ink">
                  <span className="font-medium">{deadLetter}</span> dead-lettered
                  outbox {deadLetter === 1 ? "job" : "jobs"} — background work
                  that failed and stopped retrying.
                </div>
              </div>
            )}
            {nearCapacity.map((alert) => (
              <button
                key={alert.group_id}
                type="button"
                onClick={onInspectGroup}
                className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-2"
              >
                <div>
                  <div className="text-[12.5px] font-medium text-ink">
                    {alert.group_name}
                  </div>
                  <div className="mt-0.5 text-[11px] text-ink-3">
                    {alert.organisation_count}/{alert.max_organisations} organisations
                    · {alert.facility_count}/{alert.max_facilities} facilities ·{" "}
                    {alert.user_count}/{alert.max_users} users
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-alert-tint px-2 py-0.5 text-[10.5px] font-medium text-alert">
                  Near capacity
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// Self-contained Group -> Organisation picker, reused by both Inspect
// Organisation and Impersonation — each of those workspaces is entered
// directly from the sidebar with no organisation chosen yet, so they need
// their own way to pick one rather than depending on whatever the Groups &
// Organisations workspace happens to have selected.
function GroupOrganisationPicker({
  title,
  description,
  onPick,
}: {
  title: string;
  description: string;
  onPick: (organisation: PlatformOrganisation) => void;
}) {
  const [groups, setGroups] = useState<PlatformGroup[]>([]);
  const [groupId, setGroupId] = useState<string>("");
  const [organisations, setOrganisations] = useState<PlatformOrganisation[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(async () => {
      setLoadingGroups(true);
      try {
        const next = await listPlatformGroups();
        if (cancelled) return;
        setGroups(next);
        setGroupId(next[0]?.group_id ?? "");
      } catch (err) {
        if (!cancelled) setError(isApiError(err) ? err.message : "Couldn't load groups.");
      } finally {
        if (!cancelled) setLoadingGroups(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!groupId) {
      queueMicrotask(() => setOrganisations([]));
      return;
    }
    let cancelled = false;
    queueMicrotask(async () => {
      setLoadingOrgs(true);
      try {
        const next = await listPlatformGroupOrganisations(groupId);
        if (!cancelled) setOrganisations(next);
      } catch (err) {
        if (!cancelled) setError(isApiError(err) ? err.message : "Couldn't load organisations.");
      } finally {
        if (!cancelled) setLoadingOrgs(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-[12.5px] text-ink-2">{description}</p>
      {error && (
        <div className="mt-3 rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[12px] text-alert">
          {error}
        </div>
      )}
      <div className="mt-4 grid max-w-md gap-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            Group
          </span>
          <select
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
            disabled={loadingGroups}
            className="h-10 w-full rounded-lg border border-line-2 bg-surface px-3 text-[13px] text-ink outline-none focus:border-brand disabled:bg-surface-2 disabled:text-ink-3"
          >
            {groups.map((g) => (
              <option key={g.group_id} value={g.group_id}>
                {g.group_name}
              </option>
            ))}
          </select>
        </label>
        {loadingOrgs ? (
          <div className="flex items-center gap-2 text-[12.5px] text-ink-2">
            <Loader2 size={14} className="animate-spin" /> Loading organisations…
          </div>
        ) : organisations.length === 0 ? (
          <div className="text-[12.5px] text-ink-2">
            {groupId ? "No organisations under this group." : "No groups exist yet."}
          </div>
        ) : (
          <div className="divide-y divide-line rounded-lg border border-line-2">
            {organisations.map((organisation) => (
              <button
                key={organisation.organisation_id}
                type="button"
                onClick={() => onPick(organisation)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-[12.5px] text-ink transition-colors hover:bg-surface-2"
              >
                {organisation.organisation_name}
                <StatusPill active={organisation.is_active} />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

const INSPECT_TABS: { key: InspectTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "facilities", label: "Facilities" },
  { key: "audit", label: "Audit" },
  { key: "login", label: "Login Attempts" },
  { key: "roles", label: "Role Changes" },
  { key: "cross", label: "Cross-Facility" },
  { key: "analytics", label: "Analytics" },
];

function InspectOrganisationWorkspace({
  organisationId,
  initialTab,
  canWrite,
  onChangeOrganisation,
}: {
  organisationId: string;
  initialTab: InspectTab;
  canWrite: boolean;
  onChangeOrganisation: () => void;
}) {
  const [organisation, setOrganisation] = useState<PlatformOrganisation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<InspectTab>(initialTab);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const detail = await getPlatformOrganisation(organisationId);
      setOrganisation(detail);
    } catch (err) {
      setOrganisation(null);
      setError(isApiError(err) ? err.message : "Couldn't load this organisation.");
    } finally {
      setLoading(false);
    }
  }, [organisationId]);

  useEffect(() => {
    queueMicrotask(() => setTab(initialTab));
    queueMicrotask(load);
    // organisationId change is what should re-trigger this, not initialTab —
    // switching tabs on an already-loaded org must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organisationId]);

  async function handleDeactivate() {
    if (!organisation) return;
    if (!window.confirm(`Deactivate ${organisation.organisation_name}?`)) return;
    try {
      await deactivatePlatformOrganisation(organisation.organisation_id);
      setToast("Organisation deactivated.");
      await load();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Couldn't deactivate this organisation.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onChangeOrganisation}
        className="inline-flex items-center gap-1.5 self-start text-[12.5px] font-medium text-ink-2 hover:text-ink"
      >
        <RefreshCw size={12} />
        Choose a different organisation
      </button>

      {loading ? (
        <Loading label="Loading organisation..." />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : organisation ? (
        <>
          <div className="rounded-2xl border border-line bg-surface px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[16px] font-semibold text-ink">
                    {organisation.organisation_name}
                  </h2>
                  <StatusPill active={organisation.is_active} />
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-ink-3">
                  {organisation.organisation_id}
                </div>
              </div>
              {toast && (
                <div className="rounded-lg border border-brand-line bg-brand-tint px-3 py-1.5 text-[11.5px] text-brand">
                  {toast}
                </div>
              )}
            </div>
            <div className="mt-4 flex gap-1 border-b border-line">
              {INSPECT_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`px-3 py-2 text-[12.5px] font-medium transition-colors ${
                    tab === t.key
                      ? "border-b-2 border-brand text-brand"
                      : "text-ink-2 hover:text-ink"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "overview" && (
              <div className="pt-4">
                {editing ? (
                  <OrganisationForm
                    organisation={organisation}
                    onCancel={() => setEditing(false)}
                    onSaved={async () => {
                      setEditing(false);
                      setToast("Organisation updated.");
                      await load();
                    }}
                  />
                ) : (
                  <>
                    <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <DetailItem label="Type" value={organisation.organisation_type} />
                      <DetailItem label="Group ID" value={organisation.group_id} />
                      <DetailItem label="Created" value={formatDateTime(organisation.created_at)} />
                      <DetailItem label="Updated" value={formatDateTime(organisation.updated_at)} />
                    </dl>
                    {canWrite && (
                      <div className="mt-4 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditing(true)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[12px] font-medium text-ink-2 hover:bg-surface-2"
                        >
                          <Edit3 size={13} />
                          Edit
                        </button>
                        {organisation.is_active && (
                          <button
                            type="button"
                            onClick={() => void handleDeactivate()}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[12px] font-medium text-alert"
                          >
                            <Trash2 size={13} />
                            Deactivate
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {tab === "facilities" && (
            <OrganisationFacilitiesPanel
              organisation={organisation}
              onClose={onChangeOrganisation}
            />
          )}
          {(tab === "audit" || tab === "login" || tab === "roles" || tab === "cross") && (
            <OrganisationAuditPanel
              organisation={organisation}
              onClose={onChangeOrganisation}
              fixedTab={tab}
            />
          )}
          {tab === "analytics" && (
            <OrganisationIntelligencePanel
              organisation={organisation}
              onClose={onChangeOrganisation}
            />
          )}
        </>
      ) : null}
    </div>
  );
}

function ImpersonationWorkspace({
  organisationId,
  onChangeOrganisation,
  onPickOrganisation,
  onStarted,
}: {
  organisationId: string | null;
  onChangeOrganisation: () => void;
  onPickOrganisation: (organisation: PlatformOrganisation) => void;
  onStarted: (session: ImpersonationStartResponse) => void | Promise<void>;
}) {
  const [organisation, setOrganisation] = useState<PlatformOrganisation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (!organisationId) {
      queueMicrotask(() => setOrganisation(null));
      return;
    }
    let cancelled = false;
    queueMicrotask(() => setAcknowledged(false));
    queueMicrotask(async () => {
      setLoading(true);
      setError(null);
      try {
        const detail = await getPlatformOrganisation(organisationId);
        if (!cancelled) setOrganisation(detail);
      } catch (err) {
        if (!cancelled) {
          setError(isApiError(err) ? err.message : "Couldn't load this organisation.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [organisationId]);

  if (!organisationId) {
    return (
      <GroupOrganisationPicker
        title="Start impersonation"
        description="Pick the Organisation whose tenant user you need to impersonate. This is a heavily-audited, Super-Admin-only action."
        onPick={onPickOrganisation}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onChangeOrganisation}
        className="inline-flex items-center gap-1.5 self-start text-[12.5px] font-medium text-ink-2 hover:text-ink"
      >
        <RefreshCw size={12} />
        Choose a different organisation
      </button>

      {loading ? (
        <Loading label="Loading organisation..." />
      ) : error ? (
        <ErrorState message={error} onRetry={onChangeOrganisation} />
      ) : organisation ? (
        !acknowledged ? (
          <div className="rounded-2xl border border-alert-line bg-alert-tint p-6">
            <h2 className="text-[15px] font-semibold text-alert">
              You&apos;re about to impersonate a tenant user in{" "}
              {organisation.organisation_name}
            </h2>
            <p className="mt-2 text-[12.5px] text-alert">
              This creates a real tenant session using that user&apos;s own
              permissions, and writes both platform and tenant audit records
              naming you as the actor. Only do this for a specific,
              legitimate support reason you can state — you&apos;ll be asked
              for one next.
            </p>
            <label className="mt-4 flex items-start gap-2 text-[12.5px] text-alert">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5"
              />
              I understand this is audited and I have a legitimate reason.
            </label>
            <button
              type="button"
              disabled={!acknowledged}
              onClick={() => setAcknowledged(true)}
              className="mt-4 rounded-lg bg-alert px-4 py-2 text-[13px] font-medium text-white disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-line bg-surface p-5">
            <ImpersonationStartForm
              organisation={organisation}
              onCancel={onChangeOrganisation}
              onStarted={onStarted}
            />
          </div>
        )
      ) : null}
    </div>
  );
}

function PlatformUsersWorkspace({ canWrite }: { canWrite: boolean }) {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<PlatformUser | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    setError(null);
    try {
      const next = await listPlatformUsers();
      setUsers(next);
      setSelectedUserId((current) => {
        if (current && next.some((user) => user.platform_user_id === current)) {
          return current;
        }
        return next[0]?.platform_user_id ?? null;
      });
    } catch (err) {
      setUsers([]);
      setSelectedUserId(null);
      setSelectedUser(null);
      setError(isApiError(err) ? err.message : "Couldn't load platform users.");
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const loadUser = useCallback(async (userId: string) => {
    setLoadingDetail(true);
    setDetailError(null);
    try {
      const user = await getPlatformUser(userId);
      setSelectedUser(user);
    } catch (err) {
      setSelectedUser(null);
      setDetailError(
        isApiError(err) ? err.message : "Couldn't load this platform user.",
      );
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(loadUsers);
  }, [loadUsers]);

  useEffect(() => {
    if (!selectedUserId) {
      queueMicrotask(() => setSelectedUser(null));
      return;
    }
    queueMicrotask(() => loadUser(selectedUserId));
  }, [loadUser, selectedUserId]);

  async function handleCreated(user: PlatformUser) {
    setShowCreate(false);
    setToast("Platform user created.");
    await loadUsers();
    setSelectedUserId(user.platform_user_id);
  }

  async function handleUpdated(user: PlatformUser) {
    setEditing(false);
    setToast("Platform user updated.");
    await loadUsers();
    setSelectedUserId(user.platform_user_id);
    await loadUser(user.platform_user_id);
  }

  async function handleResetMfa(user: PlatformUser) {
    if (!window.confirm(`Reset MFA for ${user.full_name}?`)) return;
    setDetailError(null);
    setToast(null);
    try {
      await resetPlatformUserMfa(user.platform_user_id);
      setToast("Platform user MFA reset.");
      await loadUser(user.platform_user_id);
    } catch (err) {
      setDetailError(isApiError(err) ? err.message : "Couldn't reset MFA.");
    }
  }

  async function handleDeactivate(user: PlatformUser) {
    if (!window.confirm(`Deactivate ${user.full_name}?`)) return;
    setDetailError(null);
    setToast(null);
    try {
      await deactivatePlatformUser(user.platform_user_id);
      setToast("Platform user deactivated.");
      await loadUsers();
    } catch (err) {
      setDetailError(
        isApiError(err) ? err.message : "Couldn't deactivate this platform user.",
      );
    }
  }

  return (
    <section className="mt-5 rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div>
          <h2 className="text-[14px] font-semibold text-ink">Platform users</h2>
          <p className="text-[11.5px] text-ink-3">
            Active operator accounts in the platform realm
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadUsers()}
            disabled={loadingUsers}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[12px] font-medium text-ink-2 disabled:opacity-50"
          >
            {loadingUsers ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            Refresh
          </button>
          {canWrite && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[12px] font-medium text-white"
            >
              <Plus size={13} />
              New user
            </button>
          )}
        </div>
      </div>

      {toast && (
        <div className="mx-5 mt-4 flex items-center gap-2 rounded-xl border border-brand-line bg-brand-tint px-3.5 py-2 text-[12.5px] text-brand">
          <Check size={14} />
          {toast}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-[340px_1fr]">
        <div className="rounded-xl border border-line-2">
          {loadingUsers ? (
            <Loading label="Loading platform users..." />
          ) : error ? (
            <ErrorState message={error} onRetry={loadUsers} />
          ) : users.length === 0 ? (
            <div className="px-5 py-10 text-center text-[12.5px] text-ink-2">
              No active platform users found.
            </div>
          ) : (
            <div className="max-h-[420px] divide-y divide-line overflow-auto">
              {users.map((user) => (
                <button
                  key={user.platform_user_id}
                  type="button"
                  onClick={() => {
                    setSelectedUserId(user.platform_user_id);
                    setEditing(false);
                    setToast(null);
                  }}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 ${
                    selectedUserId === user.platform_user_id ? "bg-brand-tint" : ""
                  }`}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
                    <UserCog size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink">
                      {user.full_name}
                    </span>
                    <span className="block truncate text-[11.5px] text-ink-3">
                      {user.email}
                    </span>
                  </span>
                  <RolePill role={user.platform_role} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-h-[340px] rounded-xl border border-line-2 p-4">
          {loadingDetail ? (
            <Loading label="Loading user detail..." />
          ) : detailError ? (
            <ErrorState message={detailError} />
          ) : selectedUser ? (
            editing ? (
              <PlatformUserForm
                mode="edit"
                user={selectedUser}
                onCancel={() => setEditing(false)}
                onSaved={handleUpdated}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[18px] font-semibold text-ink">
                      {selectedUser.full_name}
                    </div>
                    <div className="mt-1 text-[12.5px] text-ink-2">
                      {selectedUser.email}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-ink-3">
                      {selectedUser.platform_user_id}
                    </div>
                  </div>
                  {canWrite && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[12px] font-medium text-ink-2 hover:bg-surface-2"
                      >
                        <Edit3 size={13} />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleResetMfa(selectedUser)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[12px] font-medium text-ink-2 hover:bg-surface-2"
                      >
                        <KeyRound size={13} />
                        Reset MFA
                      </button>
                      {selectedUser.is_active && (
                        <button
                          type="button"
                          onClick={() => void handleDeactivate(selectedUser)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[12px] font-medium text-alert"
                        >
                          <Trash2 size={13} />
                          Deactivate
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <dl className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <DetailItem label="Role" value={selectedUser.platform_role} />
                  <DetailItem
                    label="MFA"
                    value={selectedUser.mfa_enabled ? "Enabled" : "Not enabled"}
                  />
                  <DetailItem
                    label="Last login"
                    value={
                      selectedUser.last_login_at
                        ? formatDateTime(selectedUser.last_login_at)
                        : null
                    }
                  />
                  <DetailItem label="Updated" value={formatDateTime(selectedUser.updated_at)} />
                </dl>

                <div className="mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[11.5px] text-ink-2">
                  Role and MFA changes are enforced by the backend. Last-super-admin,
                  self-deactivation, and admin-to-super-admin restrictions are returned as
                  real errors from the API.
                </div>
              </>
            )
          ) : (
            <div className="flex min-h-[260px] items-center justify-center text-[12.5px] text-ink-2">
              Select a platform user.
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 px-4">
          <div className="w-full max-w-xl rounded-2xl border border-line bg-surface p-5 shadow-xl">
            <PlatformUserForm
              mode="create"
              onCancel={() => setShowCreate(false)}
              onSaved={handleCreated}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function PlatformUserForm({
  mode,
  user,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  user?: PlatformUser;
  onCancel: () => void;
  onSaved: (user: PlatformUser) => void | Promise<void>;
}) {
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<PlatformUser["platform_role"]>(
    user?.platform_role ?? "admin",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }
    if (mode === "create" && !email.trim()) {
      setError("Email is required.");
      return;
    }
    if (mode === "create" && (password.length < 8 || password.length > 72)) {
      setError("Password must be 8 to 72 characters.");
      return;
    }
    setBusy(true);
    try {
      const saved =
        mode === "create"
          ? await createPlatformUser({
              full_name: fullName.trim(),
              email: email.trim(),
              platform_role: role,
              password,
            } satisfies PlatformUserCreate)
          : await updatePlatformUser(user!.platform_user_id, {
              full_name: fullName.trim(),
              platform_role: role,
            } satisfies PlatformUserUpdate);
      await onSaved(saved);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Couldn't save this platform user.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">
            {mode === "create" ? "New platform user" : "Edit platform user"}
          </h3>
          <p className="text-[11.5px] text-ink-3">
            Platform accounts use the separate platform authentication realm.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2"
          aria-label="Close platform user form"
        >
          <X size={16} />
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[12px] text-alert">
          {error}
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <TextInput label="Full name" value={fullName} onChange={setFullName} required />
        <SelectInput
          label="Platform role"
          value={role}
          onChange={(value) => setRole(value as PlatformUser["platform_role"])}
          options={["admin", "auditor", "super_admin"]}
        />
        {mode === "create" && (
          <>
            <TextInput label="Email" type="email" value={email} onChange={setEmail} required />
            <TextInput
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              required
            />
          </>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-line px-3.5 py-2 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save user
        </button>
      </div>
    </form>
  );
}

function RolePill({ role }: { role: PlatformUser["platform_role"] }) {
  return (
    <span className="mt-1 inline-block shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-medium text-ink-3">
      {role}
    </span>
  );
}

function PlatformConfigWorkspace({ canWrite }: { canWrite: boolean }) {
  const [configs, setConfigs] = useState<PlatformConfig[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedConfig, setSelectedConfig] = useState<PlatformConfig | null>(null);
  const [loadingConfigs, setLoadingConfigs] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadConfigs = useCallback(async () => {
    setLoadingConfigs(true);
    setError(null);
    try {
      const next = await listPlatformConfigs();
      setConfigs(next);
      setSelectedKey((current) => {
        if (current && next.some((config) => config.config_key === current)) {
          return current;
        }
        return next[0]?.config_key ?? null;
      });
    } catch (err) {
      setConfigs([]);
      setSelectedKey(null);
      setSelectedConfig(null);
      setError(isApiError(err) ? err.message : "Couldn't load platform configs.");
    } finally {
      setLoadingConfigs(false);
    }
  }, []);

  const loadConfig = useCallback(async (configKey: string) => {
    setLoadingDetail(true);
    setDetailError(null);
    try {
      const config = await getPlatformConfig(configKey);
      setSelectedConfig(config);
      setRevealed(false);
    } catch (err) {
      setSelectedConfig(null);
      setDetailError(isApiError(err) ? err.message : "Couldn't load this config.");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(loadConfigs);
  }, [loadConfigs]);

  useEffect(() => {
    if (!selectedKey) {
      queueMicrotask(() => setSelectedConfig(null));
      return;
    }
    queueMicrotask(() => loadConfig(selectedKey));
  }, [loadConfig, selectedKey]);

  async function handleCreated(config: PlatformConfig) {
    setShowCreate(false);
    setToast("Platform config created.");
    await loadConfigs();
    setSelectedKey(config.config_key);
  }

  async function handleUpdated(config: PlatformConfig) {
    setEditing(false);
    setToast("Platform config updated.");
    await loadConfigs();
    setSelectedKey(config.config_key);
    await loadConfig(config.config_key);
  }

  async function handleDelete(config: PlatformConfig) {
    if (!window.confirm(`Delete config ${config.config_key}?`)) return;
    setDetailError(null);
    setToast(null);
    try {
      await deletePlatformConfig(config.config_key);
      setToast("Platform config deleted.");
      await loadConfigs();
    } catch (err) {
      setDetailError(
        isApiError(err) ? err.message : "Couldn't delete this platform config.",
      );
    }
  }

  return (
    <section className="mt-5 rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div>
          <h2 className="text-[14px] font-semibold text-ink">Platform configuration</h2>
          <p className="text-[11.5px] text-ink-3">
            Global key/value settings for platform services
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadConfigs()}
            disabled={loadingConfigs}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[12px] font-medium text-ink-2 disabled:opacity-50"
          >
            {loadingConfigs ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            Refresh
          </button>
          {canWrite && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[12px] font-medium text-white"
            >
              <Plus size={13} />
              New config
            </button>
          )}
        </div>
      </div>

      {toast && (
        <div className="mx-5 mt-4 flex items-center gap-2 rounded-xl border border-brand-line bg-brand-tint px-3.5 py-2 text-[12.5px] text-brand">
          <Check size={14} />
          {toast}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-[340px_1fr]">
        <div className="rounded-xl border border-line-2">
          {loadingConfigs ? (
            <Loading label="Loading platform configs..." />
          ) : error ? (
            <ErrorState message={error} onRetry={loadConfigs} />
          ) : configs.length === 0 ? (
            <div className="px-5 py-10 text-center text-[12.5px] text-ink-2">
              No platform configs found.
            </div>
          ) : (
            <div className="max-h-[420px] divide-y divide-line overflow-auto">
              {configs.map((config) => (
                <button
                  key={config.config_id}
                  type="button"
                  onClick={() => {
                    setSelectedKey(config.config_key);
                    setEditing(false);
                    setRevealed(false);
                    setToast(null);
                  }}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 ${
                    selectedKey === config.config_key ? "bg-brand-tint" : ""
                  }`}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
                    <Settings2 size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink">
                      {config.config_key}
                    </span>
                    <span className="block truncate text-[11.5px] text-ink-3">
                      {config.description || "No description"}
                    </span>
                  </span>
                  {isSensitiveConfig(config) && (
                    <span className="shrink-0 rounded-full bg-alert-tint px-2 py-0.5 text-[10.5px] font-medium text-alert">
                      masked
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-h-[340px] rounded-xl border border-line-2 p-4">
          {loadingDetail ? (
            <Loading label="Loading config detail..." />
          ) : detailError ? (
            <ErrorState message={detailError} />
          ) : selectedConfig ? (
            editing ? (
              <PlatformConfigForm
                mode="edit"
                config={selectedConfig}
                onCancel={() => setEditing(false)}
                onSaved={handleUpdated}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[18px] font-semibold text-ink">
                      {selectedConfig.config_key}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-ink-3">
                      {selectedConfig.config_id}
                    </div>
                  </div>
                  {canWrite && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[12px] font-medium text-ink-2 hover:bg-surface-2"
                      >
                        <Edit3 size={13} />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(selectedConfig)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[12px] font-medium text-alert"
                      >
                        <Trash2 size={13} />
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-5 rounded-xl border border-line-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">
                      Value
                    </div>
                    {isSensitiveConfig(selectedConfig) && (
                      <button
                        type="button"
                        onClick={() => setRevealed((current) => !current)}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-medium text-ink-2 hover:bg-surface-2"
                      >
                        {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
                        {revealed ? "Hide" : "Reveal"}
                      </button>
                    )}
                  </div>
                  <div className="mt-2 max-h-36 overflow-auto break-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-[12px] text-ink">
                    {isSensitiveConfig(selectedConfig) && !revealed
                      ? maskValue(selectedConfig.config_value)
                      : selectedConfig.config_value}
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <DetailItem label="Description" value={selectedConfig.description} />
                  <DetailItem label="Updated by" value={selectedConfig.updated_by} />
                  <DetailItem label="Updated" value={formatDateTime(selectedConfig.updated_at)} />
                  <DetailItem
                    label="Sensitivity"
                    value={isSensitiveConfig(selectedConfig) ? "Masked by UI" : "Plain"}
                  />
                </dl>
              </>
            )
          ) : (
            <div className="flex min-h-[260px] items-center justify-center text-[12.5px] text-ink-2">
              Select a platform config.
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 px-4">
          <div className="w-full max-w-xl rounded-2xl border border-line bg-surface p-5 shadow-xl">
            <PlatformConfigForm
              mode="create"
              onCancel={() => setShowCreate(false)}
              onSaved={handleCreated}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function PlatformConfigForm({
  mode,
  config,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  config?: PlatformConfig;
  onCancel: () => void;
  onSaved: (config: PlatformConfig) => void | Promise<void>;
}) {
  const [configKey, setConfigKey] = useState(config?.config_key ?? "");
  const [configValue, setConfigValue] = useState(config?.config_value ?? "");
  const [description, setDescription] = useState(config?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (mode === "create" && !configKey.trim()) {
      setError("Config key is required.");
      return;
    }
    if (!configValue) {
      setError("Config value is required.");
      return;
    }
    setBusy(true);
    try {
      const saved =
        mode === "create"
          ? await createPlatformConfig({
              config_key: configKey.trim(),
              config_value: configValue,
              description: description.trim() || null,
            } satisfies PlatformConfigCreate)
          : await updatePlatformConfig(config!.config_key, {
              config_value: configValue,
              description: description.trim() || null,
            } satisfies PlatformConfigUpdate);
      await onSaved(saved);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Couldn't save this platform config.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">
            {mode === "create" ? "New platform config" : "Edit platform config"}
          </h3>
          <p className="text-[11.5px] text-ink-3">
            Config values are global and audited by key.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2"
          aria-label="Close platform config form"
        >
          <X size={16} />
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[12px] text-alert">
          {error}
        </div>
      )}

      <div className="mt-4 grid gap-3">
        <TextInput
          label="Config key"
          value={configKey}
          onChange={setConfigKey}
          required
          disabled={mode === "edit"}
        />
        <TextAreaInput
          label="Config value"
          value={configValue}
          onChange={setConfigValue}
          required
        />
        <TextAreaInput
          label="Description"
          value={description}
          onChange={setDescription}
        />
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-line px-3.5 py-2 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save config
        </button>
      </div>
    </form>
  );
}

function PlatformAuditWorkspace() {
  const [logs, setLogs] = useState<PlatformAuditLog[]>([]);
  const [actionType, setActionType] = useState("");
  const [targetType, setTargetType] = useState("");
  const [targetId, setTargetId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [limit, setLimit] = useState("50");
  const [offset, setOffset] = useState(0);
  const initialLoadedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const numericLimit = useMemo(() => {
    const parsed = Number(limit);
    if (!Number.isInteger(parsed) || parsed < 1) return 50;
    return Math.min(parsed, 200);
  }, [limit]);

  const loadLogs = useCallback(
    async (
      nextOffset = offset,
      overrides: {
        actionType?: string;
        targetType?: string;
        targetId?: string;
        dateFrom?: string;
        dateTo?: string;
        limit?: number;
      } = {},
    ) => {
      const effectiveLimit = overrides.limit ?? numericLimit;
      setLoading(true);
      setError(null);
      try {
        const next = await listPlatformAuditLogs({
          action_type: (overrides.actionType ?? actionType).trim() || null,
          target_type: (overrides.targetType ?? targetType).trim() || null,
          target_id: (overrides.targetId ?? targetId).trim() || null,
          date_from: (overrides.dateFrom ?? dateFrom) || null,
          date_to: (overrides.dateTo ?? dateTo) || null,
          limit: effectiveLimit,
          offset: nextOffset,
        });
        setLogs(next);
        setOffset(nextOffset);
      } catch (err) {
        setLogs([]);
        setError(isApiError(err) ? err.message : "Couldn't load platform audit logs.");
      } finally {
        setLoading(false);
      }
    },
    [actionType, dateFrom, dateTo, numericLimit, offset, targetId, targetType],
  );

  useEffect(() => {
    if (initialLoadedRef.current) return;
    initialLoadedRef.current = true;
    queueMicrotask(() => loadLogs(0));
  }, [loadLogs]);

  function handleApply(event: FormEvent) {
    event.preventDefault();
    void loadLogs(0);
  }

  function handleReset() {
    setActionType("");
    setTargetType("");
    setTargetId("");
    setDateFrom("");
    setDateTo("");
    setLimit("50");
    void loadLogs(0, {
      actionType: "",
      targetType: "",
      targetId: "",
      dateFrom: "",
      dateTo: "",
      limit: 50,
    });
  }

  return (
    <section className="mt-5 rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div>
          <h2 className="text-[14px] font-semibold text-ink">Platform audit</h2>
          <p className="text-[11.5px] text-ink-3">
            Read-only platform audit log, newest first
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadLogs(offset)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[12px] font-medium text-ink-2 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <RefreshCw size={13} />
          )}
          Refresh
        </button>
      </div>

      <form
        onSubmit={handleApply}
        className="grid gap-3 border-b border-line px-5 py-4 md:grid-cols-3 xl:grid-cols-6"
      >
        <TextInput label="Action type" value={actionType} onChange={setActionType} />
        <TextInput label="Target type" value={targetType} onChange={setTargetType} />
        <TextInput label="Target ID" value={targetId} onChange={setTargetId} />
        <TextInput label="Date from" type="date" value={dateFrom} onChange={setDateFrom} />
        <TextInput label="Date to" type="date" value={dateTo} onChange={setDateTo} />
        <TextInput
          label="Limit"
          type="number"
          min="1"
          value={limit}
          onChange={setLimit}
        />
        <div className="flex items-end gap-2 md:col-span-3 xl:col-span-6">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white disabled:opacity-60"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={loading}
            className="rounded-lg border border-line px-3.5 py-2 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-50"
          >
            Reset
          </button>
        </div>
      </form>

      <div className="p-5">
        {loading ? (
          <Loading label="Loading platform audit..." />
        ) : error ? (
          <ErrorState message={error} onRetry={() => loadLogs(offset)} />
        ) : logs.length === 0 ? (
          <div className="rounded-xl border border-line-2 px-5 py-10 text-center text-[12.5px] text-ink-2">
            No platform audit logs match these filters.
          </div>
        ) : (
          <div className="overflow-auto rounded-xl border border-line-2">
            <table className="min-w-[980px] w-full border-collapse text-left text-[12px]">
              <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-ink-3">
                <tr>
                  <th className="px-3 py-2 font-semibold">Created</th>
                  <th className="px-3 py-2 font-semibold">Action</th>
                  <th className="px-3 py-2 font-semibold">Target</th>
                  <th className="px-3 py-2 font-semibold">User</th>
                  <th className="px-3 py-2 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {logs.map((log) => (
                  <tr key={log.log_id} className="align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-ink-2">
                      {formatDateTime(log.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-ink">{log.action_type}</div>
                      <div className="mt-0.5 font-mono text-[10.5px] text-ink-3">
                        {log.log_id.slice(0, 8)}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-ink-2">
                      <div>{log.target_type}</div>
                      <div className="mt-0.5 font-mono text-[10.5px] text-ink-3">
                        {log.target_id ?? "none"}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-[10.5px] text-ink-3">
                      {log.platform_user_id ?? "system"}
                    </td>
                    <td className="max-w-[360px] px-3 py-2">
                      <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-2 px-2 py-1.5 font-mono text-[10.5px] text-ink-2">
                        {formatAuditDetails(log.details)}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11.5px] text-ink-3">
            Offset {offset}; showing {logs.length} records. No total count is returned.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadLogs(Math.max(0, offset - numericLimit))}
              disabled={loading || offset === 0}
              className="rounded-lg border border-line px-3 py-2 text-[12px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => void loadLogs(offset + numericLimit)}
              disabled={loading || logs.length < numericLimit}
              className="rounded-lg border border-line px-3 py-2 text-[12px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${
        active ? "bg-approved-tint text-approved" : "bg-surface-2 text-ink-3"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function DetailItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-xl border border-line-2 px-3 py-2.5">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">
        {label}
      </div>
      <div className="mt-1 truncate text-[12.5px] text-ink">
        {value || "Not set"}
      </div>
    </div>
  );
}

function GroupForm({
  mode,
  group,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  group?: PlatformGroup;
  onCancel: () => void;
  onSaved: (group: PlatformGroup) => void | Promise<void>;
}) {
  const [groupName, setGroupName] = useState(group?.group_name ?? "");
  const [groupType, setGroupType] = useState(group?.group_type ?? "healthcare_network");
  const [contactName, setContactName] = useState(group?.contact_person_name ?? "");
  const [contactEmail, setContactEmail] = useState(group?.contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(group?.contact_phone ?? "");
  const [billingAddress, setBillingAddress] = useState(group?.billing_address ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!groupName.trim()) {
      setError("Group name is required.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        group_name: groupName.trim(),
        group_type: groupType.trim() || "healthcare_network",
        contact_person_name: contactName.trim() || null,
        contact_email: contactEmail.trim() || null,
        contact_phone: contactPhone.trim() || null,
        billing_address: billingAddress.trim() || null,
      } satisfies PlatformGroupCreate | PlatformGroupUpdate;
      const saved =
        mode === "create"
          ? await createPlatformGroup(payload as PlatformGroupCreate)
          : await updatePlatformGroup(group!.group_id, payload as PlatformGroupUpdate);
      await onSaved(saved);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Couldn't save this group.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">
            {mode === "create" ? "New group" : "Edit group"}
          </h3>
          <p className="text-[11.5px] text-ink-3">
            Groups are platform-level customer containers.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[12px] text-alert">
          {error}
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <TextInput label="Group name" value={groupName} onChange={setGroupName} required />
        <TextInput label="Group type" value={groupType} onChange={setGroupType} />
        <TextInput label="Contact person" value={contactName} onChange={setContactName} />
        <TextInput label="Contact email" value={contactEmail} onChange={setContactEmail} />
        <TextInput label="Contact phone" value={contactPhone} onChange={setContactPhone} />
        <TextInput label="Billing address" value={billingAddress} onChange={setBillingAddress} />
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-line px-3.5 py-2 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save
        </button>
      </div>
    </form>
  );
}

function SubscriptionForm({
  mode,
  groupId,
  capacity,
  onCancel,
  onSaved,
}: {
  mode: "create" | "update";
  groupId: string;
  capacity: PlatformGroupCapacity | null;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const today = localToday();
  const [planName, setPlanName] = useState("");
  const [planTier, setPlanTier] = useState("mvp");
  const [maxOrganisations, setMaxOrganisations] = useState(
    String(capacity?.max_organisations ?? 1),
  );
  const [maxFacilities, setMaxFacilities] = useState(
    String(capacity?.max_facilities ?? 5),
  );
  const [maxUsers, setMaxUsers] = useState(String(capacity?.max_users ?? 50));
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("PKR");
  const [contractStart, setContractStart] = useState(today);
  const [contractEnd, setContractEnd] = useState("");
  const [status, setStatus] = useState(capacity?.status ?? "active");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function positiveInteger(value: string, label: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error(`${label} must be at least 1.`);
    }
    return parsed;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    let maxOrgs: number;
    let maxFacs: number;
    let maxUserCount: number;
    try {
      maxOrgs = positiveInteger(maxOrganisations, "Organisation limit");
      maxFacs = positiveInteger(maxFacilities, "Facility limit");
      maxUserCount = positiveInteger(maxUsers, "User limit");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Capacity limits are invalid.");
      return;
    }
    if (mode === "create" && !planName.trim()) {
      setError("Plan name is required.");
      return;
    }
    if (mode === "create" && !contractStart) {
      setError("Contract start is required.");
      return;
    }
    if (mode === "create" && currency.trim().length !== 3) {
      setError("Currency must be a three-letter code.");
      return;
    }
    const parsedAmount = amount.trim() ? Number(amount) : null;
    if (parsedAmount !== null && (!Number.isFinite(parsedAmount) || parsedAmount < 0)) {
      setError("Amount must be a valid non-negative number.");
      return;
    }
    if (mode === "update" && !capacity?.subscription_id) {
      setError("No active subscription ID is available for update.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "create") {
        await createPlatformGroupSubscription(groupId, {
          plan_name: planName.trim(),
          plan_tier: planTier.trim() || null,
          max_organisations: maxOrgs,
          max_facilities: maxFacs,
          max_users: maxUserCount,
          billing_cycle: billingCycle || null,
          amount: parsedAmount,
          currency: currency.trim().toUpperCase(),
          contract_start: contractStart,
          contract_end: contractEnd || null,
        });
      } else {
        await updatePlatformGroupSubscription(groupId, capacity!.subscription_id!, {
          max_organisations: maxOrgs,
          max_facilities: maxFacs,
          max_users: maxUserCount,
          status,
          contract_end: contractEnd || null,
        });
      }
      await onSaved();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Couldn't save this subscription.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold text-ink">
            {mode === "create" ? "Create subscription" : "Update subscription"}
          </h3>
          <p className="text-[11.5px] text-ink-3">
            Capacity limits are enforced by the backend before provisioning.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2"
          aria-label="Close subscription form"
        >
          <X size={16} />
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[12px] text-alert">
          {error}
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {mode === "create" && (
          <>
            <TextInput label="Plan name" value={planName} onChange={setPlanName} required />
            <TextInput label="Plan tier" value={planTier} onChange={setPlanTier} />
            <SelectInput
              label="Billing cycle"
              value={billingCycle}
              onChange={setBillingCycle}
              options={["monthly", "quarterly", "annual"]}
            />
          </>
        )}
        <TextInput
          label="Max organisations"
          type="number"
          min="1"
          value={maxOrganisations}
          onChange={setMaxOrganisations}
          required
        />
        <TextInput
          label="Max facilities"
          type="number"
          min="1"
          value={maxFacilities}
          onChange={setMaxFacilities}
          required
        />
        <TextInput
          label="Max users"
          type="number"
          min="1"
          value={maxUsers}
          onChange={setMaxUsers}
          required
        />
        {mode === "create" && (
          <>
            <TextInput
              label="Amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={setAmount}
            />
            <TextInput label="Currency" value={currency} onChange={setCurrency} required />
            <TextInput
              label="Contract start"
              type="date"
              value={contractStart}
              onChange={setContractStart}
              required
            />
          </>
        )}
        {mode === "update" && (
          <SelectInput
            label="Status"
            value={status}
            onChange={setStatus}
            options={["active", "suspended", "cancelled", "expired"]}
          />
        )}
        <TextInput
          label="Contract end"
          type="date"
          value={contractEnd}
          onChange={setContractEnd}
        />
      </div>

      {mode === "update" && (
        <div className="mt-3 rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[11.5px] text-alert">
          Suspending, cancelling, or expiring a subscription ends active tenant sessions
          for Organisations in this Group.
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-line px-3.5 py-2 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save subscription
        </button>
      </div>
    </form>
  );
}

function ProvisionOrganisationForm({
  groupId,
  onCancel,
  onSaved,
}: {
  groupId: string;
  onCancel: () => void;
  onSaved: (result: ProvisionOrganisationResponse) => void | Promise<void>;
}) {
  const [organisationName, setOrganisationName] = useState("");
  const [organisationType, setOrganisationType] = useState("hospital");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [taxId, setTaxId] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [facilityName, setFacilityName] = useState("");
  const [facilityType, setFacilityType] = useState("clinic");
  const [facilityTimezone, setFacilityTimezone] = useState("Asia/Karachi");
  const [facilityAddress, setFacilityAddress] = useState("");
  const [facilityCity, setFacilityCity] = useState("");
  const [facilityPhone, setFacilityPhone] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!organisationName.trim() || !facilityName.trim() || !ownerName.trim()) {
      setError("Organisation, Facility, and Owner names are required.");
      return;
    }
    if (!ownerEmail.trim()) {
      setError("Owner email is required.");
      return;
    }
    setBusy(true);
    try {
      const result = await provisionPlatformOrganisation(groupId, {
        organisation_name: organisationName.trim(),
        organisation_type: organisationType.trim() || null,
        tax_id: taxId.trim() || null,
        contact_email: contactEmail.trim() || null,
        contact_phone: contactPhone.trim() || null,
        billing_address: billingAddress.trim() || null,
        facility_name: facilityName.trim(),
        facility_type: facilityType.trim() || "clinic",
        facility_timezone: facilityTimezone.trim() || "Asia/Karachi",
        facility_address: facilityAddress.trim() || null,
        facility_city: facilityCity.trim() || null,
        facility_phone_number: facilityPhone.trim() || null,
        owner_full_name: ownerName.trim(),
        owner_email: ownerEmail.trim(),
      });
      await onSaved(result);
    } catch (err) {
      if (isApiError(err) && err.httpStatus === 503) {
        setError(
          "Provisioning failed and was rolled back because account setup email delivery failed.",
        );
      } else {
        setError(isApiError(err) ? err.message : "Couldn't provision this Organisation.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold text-ink">Provision Organisation</h3>
          <p className="text-[11.5px] text-ink-3">
            Creates Organisation, initial Facility, Owner user, roles, and setup email.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2"
          aria-label="Close provisioning form"
        >
          <X size={16} />
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[12px] text-alert">
          {error}
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <TextInput label="Organisation name" value={organisationName} onChange={setOrganisationName} required />
        <TextInput label="Organisation type" value={organisationType} onChange={setOrganisationType} />
        <TextInput label="Tax ID" value={taxId} onChange={setTaxId} />
        <TextInput label="Contact email" type="email" value={contactEmail} onChange={setContactEmail} />
        <TextInput label="Contact phone" value={contactPhone} onChange={setContactPhone} />
        <TextInput label="Billing address" value={billingAddress} onChange={setBillingAddress} />
        <TextInput label="Facility name" value={facilityName} onChange={setFacilityName} required />
        <TextInput label="Facility type" value={facilityType} onChange={setFacilityType} />
        <TextInput label="Facility timezone" value={facilityTimezone} onChange={setFacilityTimezone} required />
        <TextInput label="Facility address" value={facilityAddress} onChange={setFacilityAddress} />
        <TextInput label="Facility city" value={facilityCity} onChange={setFacilityCity} />
        <TextInput label="Facility phone" value={facilityPhone} onChange={setFacilityPhone} />
        <TextInput label="Owner full name" value={ownerName} onChange={setOwnerName} required />
        <TextInput label="Owner email" type="email" value={ownerEmail} onChange={setOwnerEmail} required />
      </div>

      <div className="mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[11.5px] text-ink-2">
        Owner login is unavailable until the account setup link from the backend email is
        completed. If the backend returns 503, the whole provisioning transaction is failed.
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-line px-3.5 py-2 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Provision
        </button>
      </div>
    </form>
  );
}

function OrganisationForm({
  organisation,
  onCancel,
  onSaved,
}: {
  organisation: PlatformOrganisation;
  onCancel: () => void;
  onSaved: (organisation: PlatformOrganisation) => void | Promise<void>;
}) {
  const [organisationName, setOrganisationName] = useState(
    organisation.organisation_name,
  );
  const [organisationType, setOrganisationType] = useState(
    organisation.organisation_type ?? "",
  );
  const [isActive, setIsActive] = useState(organisation.is_active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!organisationName.trim()) {
      setError("Organisation name is required.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        organisation_name: organisationName.trim(),
        organisation_type: organisationType.trim() || null,
        is_active: isActive,
      } satisfies PlatformOrganisationUpdate;
      const saved = await updatePlatformOrganisation(
        organisation.organisation_id,
        payload,
      );
      await onSaved(saved);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Couldn't save this Organisation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold text-ink">Edit Organisation</h3>
          <p className="text-[11.5px] text-ink-3">
            Profile updates do not revoke sessions; deactivate does.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2"
          aria-label="Close organisation form"
        >
          <X size={16} />
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[12px] text-alert">
          {error}
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <TextInput label="Organisation name" value={organisationName} onChange={setOrganisationName} required />
        <TextInput label="Organisation type" value={organisationType} onChange={setOrganisationType} />
      </div>

      <label className="mt-3 flex items-center gap-2 text-[12.5px] text-ink-2">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
          className="size-4 rounded border-line-2"
        />
        Active
      </label>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-line px-3.5 py-2 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save Organisation
        </button>
      </div>
    </form>
  );
}

function ImpersonationStartForm({
  organisation,
  onCancel,
  onStarted,
}: {
  organisation: PlatformOrganisation;
  onCancel: () => void;
  onStarted: (session: ImpersonationStartResponse) => void | Promise<void>;
}) {
  const [targetUserId, setTargetUserId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!targetUserId.trim()) {
      setError("Target tenant user ID is required.");
      return;
    }
    if (reason.trim().length < 10) {
      setError("Reason must be at least 10 characters.");
      return;
    }
    setBusy(true);
    try {
      const session = await startPlatformImpersonation({
        organisation_id: organisation.organisation_id,
        target_user_id: targetUserId.trim(),
        reason: reason.trim(),
      });
      await onStarted(session);
    } catch (err) {
      setError(
        isApiError(err) ? err.message : "Couldn't start impersonation.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold text-ink">
            Start impersonation
          </h3>
          <p className="text-[11.5px] text-ink-3">
            {organisation.organisation_name}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2"
          aria-label="Close impersonation form"
        >
          <X size={16} />
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[12px] text-alert">
          {error}
        </div>
      )}

      <div className="mt-4 grid gap-3">
        <TextInput
          label="Organisation ID"
          value={organisation.organisation_id}
          onChange={() => undefined}
          disabled
        />
        <TextInput
          label="Target tenant user ID"
          value={targetUserId}
          onChange={setTargetUserId}
          required
        />
        <TextAreaInput
          label="Reason"
          value={reason}
          onChange={setReason}
          required
        />
      </div>

      <div className="mt-3 rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[11.5px] text-alert">
        Impersonation creates a real tenant session using the target user&apos;s
        own permissions and writes platform and tenant audit records.
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-line px-3.5 py-2 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
          Start
        </button>
      </div>
    </form>
  );
}

// Self-service password change for the currently signed-in platform user
// (POST /foundation/platform/password/change). The backend derives the
// actor from the auth token — there is no target-user id here, and no
// "who am I" identity display: the platform API has no self-profile
// endpoint (GET /users/{id} requires platform:user:read, which not every
// platform role holds, so it can't reliably serve as a self-lookup). That
// gap is real but out of scope for this fix — password change itself needs
// no identity data, only the existing auth header.
function PlatformAccountPanel({
  onClose,
  onPasswordChanged,
}: {
  onClose: () => void;
  onPasswordChanged: () => Promise<void>;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (newPassword.length < 8 || newPassword.length > 72) {
      setError("New password must be 8–72 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await changePlatformPassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      // The backend has already ended every session for this platform user,
      // including this one — clear local state and redirect immediately
      // rather than leaving the UI on a session the server already killed.
      await onPasswordChanged();
    } catch (err) {
      if (isApiError(err) && err.httpStatus === 401) {
        setError(err.message || "Current password is incorrect.");
      } else if (isApiError(err) && err.httpStatus === 422) {
        setError(
          err.message || "Your new password must be different from your current one.",
        );
      } else {
        setError(isApiError(err) ? err.message : "Something went wrong. Please try again.");
      }
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-line bg-surface p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[14.5px] font-semibold text-ink">Account</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-2">
            Change your platform password. You&apos;ll be signed out of every
            session and asked to sign in again.
          </p>
        </div>
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
        <div className="mb-3 rounded-lg border border-alert-line bg-alert-tint px-3.5 py-2.5 text-[12.5px] text-alert">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex max-w-sm flex-col gap-3">
        <TextInput
          label="Current password"
          type="password"
          value={currentPassword}
          onChange={setCurrentPassword}
          required
        />
        <TextInput
          label="New password (8–72 characters)"
          type="password"
          value={newPassword}
          onChange={setNewPassword}
          required
        />
        <TextInput
          label="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          required
        />
        <div className="mt-1 flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Change password
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-2"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function TextInput({
  label,
  type = "text",
  min,
  step,
  value,
  onChange,
  required = false,
  disabled = false,
}: {
  label: string;
  type?: string;
  min?: string;
  step?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        {label}
      </span>
      <input
        type={type}
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        disabled={disabled}
        className="h-10 w-full rounded-lg border border-line-2 bg-surface px-3 text-[13px] text-ink outline-none focus:border-brand disabled:bg-surface-2 disabled:text-ink-3"
      />
    </label>
  );
}

function TextAreaInput({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        rows={4}
        className="w-full resize-y rounded-lg border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
      />
    </label>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-line-2 bg-surface px-3 text-[13px] text-ink outline-none focus:border-brand"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ProvisionResultPanel({
  result,
}: {
  result: ProvisionOrganisationResponse;
}) {
  return (
    <div className="mt-4 rounded-xl border border-brand-line bg-brand-tint p-3.5">
      <div className="text-[12.5px] font-semibold text-brand">
        Provisioning completed
      </div>
      <div className="mt-2 grid gap-2 text-[11.5px] text-brand md:grid-cols-2">
        <ResultItem label="Organisation ID" value={result.organisation_id} />
        <ResultItem label="Facility ID" value={result.facility_id} />
        <ResultItem label="Owner user ID" value={result.owner_user_id} />
        <ResultItem label="Owner email" value={result.owner_email} />
      </div>
      <div className="mt-2 text-[11.5px] text-brand">
        Account setup email was accepted by the backend transaction; the Owner must
        complete that setup link before login.
      </div>
    </div>
  );
}

function ResultItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="font-medium">{label}: </span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function CapacityPanel({
  capacity,
  onCreateSubscription,
  onUpdateSubscription,
  canWrite,
}: {
  capacity: PlatformGroupCapacity | null;
  onCreateSubscription: () => void;
  onUpdateSubscription: () => void;
  canWrite: boolean;
}) {
  return (
    <section className="rounded-xl border border-line-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13.5px] font-semibold text-ink">Capacity</h3>
        {canWrite &&
          (capacity?.subscription_id ? (
            <button
              type="button"
              onClick={onUpdateSubscription}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] font-medium text-ink-2 hover:bg-surface-2"
            >
              <CreditCard size={12} />
              Update
            </button>
          ) : (
            <button
              type="button"
              onClick={onCreateSubscription}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-2.5 py-1.5 text-[11.5px] font-medium text-white"
            >
              <Plus size={12} />
              Subscription
            </button>
          ))}
      </div>
      {!capacity ? (
        <div className="mt-3 text-[12.5px] text-ink-2">Capacity is unavailable.</div>
      ) : (
        <div className="mt-3 space-y-3">
          <CapacityBar
            label="Organisations"
            used={capacity.organisation_count}
            max={capacity.max_organisations}
          />
          <CapacityBar
            label="Facilities"
            used={capacity.facility_count}
            max={capacity.max_facilities}
          />
          <CapacityBar label="Users" used={capacity.user_count} max={capacity.max_users} />
          <div className="text-[11.5px] text-ink-3">
            Subscription: {capacity.subscription_id ?? "none"} · Status:{" "}
            {capacity.status ?? "unknown"}
          </div>
        </div>
      )}
    </section>
  );
}

function CapacityBar({
  label,
  used,
  max,
}: {
  label: string;
  used: number;
  max?: number | null;
}) {
  const percentage = max && max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[12px]">
        <span className="font-medium text-ink-2">{label}</span>
        <span className="text-ink-3">
          {used} / {max ?? "unlimited"}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-brand" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

// Compact used/limit bar for one metric on a Group *list row* — answers
// "can I provision one more Organisation here" without clicking into the
// group first. Organisations, not Facilities/Users, because that's the
// specific capacity question that actually blocks provisioning.
function MiniCapacityBar({ capacity }: { capacity: PlatformGroupCapacity | undefined }) {
  if (!capacity) {
    return <span className="mt-1 block text-[10.5px] text-ink-3">Capacity: …</span>;
  }
  const { organisation_count: used, max_organisations: max } = capacity;
  const percentage = max && max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const atLimit = Boolean(max) && used >= (max ?? 0);
  return (
    <span className="mt-1 flex items-center gap-1.5">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
        <span
          className={`block h-full rounded-full ${atLimit ? "bg-alert" : "bg-brand"}`}
          style={{ width: `${percentage}%` }}
        />
      </span>
      <span className={`text-[10.5px] ${atLimit ? "text-alert" : "text-ink-3"}`}>
        {used}/{max ?? "∞"} orgs
      </span>
    </span>
  );
}

function OrganisationPanel({
  organisations,
  canWrite,
  onProvision,
  onEdit,
  onInspect,
  onDeactivate,
}: {
  organisations: PlatformOrganisation[];
  canWrite: boolean;
  onProvision: () => void;
  onEdit: (organisation: PlatformOrganisation) => void;
  onInspect: (organisation: PlatformOrganisation, tab?: InspectTab) => void;
  onDeactivate: (organisation: PlatformOrganisation) => void;
}) {
  return (
    <section className="rounded-xl border border-line-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13.5px] font-semibold text-ink">Organisations</h3>
        {canWrite && (
          <button
            type="button"
            onClick={onProvision}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-2.5 py-1.5 text-[11.5px] font-medium text-white"
          >
            <Plus size={12} />
            Provision
          </button>
        )}
      </div>
      {organisations.length === 0 ? (
        <div className="mt-3 text-[12.5px] text-ink-2">
          No organisations under this group.
        </div>
      ) : (
        <div className="mt-3 max-h-56 divide-y divide-line overflow-auto">
          {organisations.map((organisation) => (
            <div key={organisation.organisation_id} className="py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-medium text-ink">
                    {organisation.organisation_name}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-3">
                    <span className="font-mono">
                      {organisation.organisation_id.slice(0, 8)}
                    </span>
                    <StatusPill active={organisation.is_active} />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => onEdit(organisation)}
                      className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2"
                      aria-label={`Edit ${organisation.organisation_name}`}
                    >
                      <Edit3 size={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onInspect(organisation, "facilities")}
                    className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2"
                    aria-label={`Manage facilities for ${organisation.organisation_name}`}
                  >
                    <MapPinned size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onInspect(organisation, "audit")}
                    className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2"
                    aria-label={`View audit trail for ${organisation.organisation_name}`}
                  >
                    <FileSearch size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onInspect(organisation, "analytics")}
                    className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2"
                    aria-label={`View intelligence dashboard for ${organisation.organisation_name}`}
                  >
                    <BarChart3 size={13} />
                  </button>
                  {canWrite && organisation.is_active && (
                    <button
                      type="button"
                      onClick={() => onDeactivate(organisation)}
                      className="rounded-md p-1.5 text-alert hover:bg-alert-tint"
                      aria-label={`Deactivate ${organisation.organisation_name}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Per-Organisation audit visibility (spec: PLATFORM_CONSOLE_BACKEND_UPDATE.md
// item #3) — mirrors /compliance's four-tab browser, but scoped by
// Organisation ID instead of the caller's own token-derived org, and using
// limit/offset "load more" paging (these endpoints return bare arrays with
// no total_count) instead of page/page_size + a page counter.
type AuditTab = "audit" | "login" | "roles" | "cross";

function OrganisationAuditPanel({
  organisation,
  onClose,
  fixedTab,
}: {
  organisation: PlatformOrganisation;
  onClose: () => void;
  // When set, this renders as a single fixed view with no header/switcher
  // of its own — the caller (InspectOrganisationWorkspace) owns the tab
  // bar instead, so Login Attempts/Role Changes/Cross-Facility are real
  // top-level tabs, not nested one level under "Audit".
  fixedTab?: AuditTab;
}) {
  const [tab, setTab] = useState<AuditTab>(fixedTab ?? "audit");

  useEffect(() => {
    if (fixedTab) queueMicrotask(() => setTab(fixedTab));
  }, [fixedTab]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actionType, setActionType] = useState("");
  const [targetEntityType, setTargetEntityType] = useState("");
  const [targetEntityId, setTargetEntityId] = useState("");
  const [emailEntered, setEmailEntered] = useState("");
  const [loginSuccess, setLoginSuccess] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [roleAction, setRoleAction] = useState("");
  const [patientId, setPatientId] = useState("");
  const [accessedByUser, setAccessedByUser] = useState("");
  const [accessedFromFacility, setAccessedFromFacility] = useState("");
  const [recordFacility, setRecordFacility] = useState("");
  const [recordType, setRecordType] = useState("");
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [logins, setLogins] = useState<LoginAttempt[]>([]);
  const [roles, setRoles] = useState<RoleChange[]>([]);
  const [cross, setCross] = useState<CrossFacilityAccess[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastBatchSize, setLastBatchSize] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const shared = {
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        limit: LIMIT,
        offset,
      };
      if (tab === "audit") {
        const result = await listPlatformOrgAuditEvents(
          organisation.organisation_id,
          {
            ...shared,
            action_type: actionType.trim() || undefined,
            target_entity_type: targetEntityType.trim() || undefined,
            target_entity_id: targetEntityId.trim() || undefined,
          },
        );
        setAudit(result);
        setLastBatchSize(result.length);
      } else if (tab === "login") {
        const result = await listPlatformOrgLoginAttempts(
          organisation.organisation_id,
          {
            ...shared,
            email_entered: emailEntered.trim() || undefined,
            is_success:
              loginSuccess === "true" ? true : loginSuccess === "false" ? false : undefined,
          },
        );
        setLogins(result);
        setLastBatchSize(result.length);
      } else if (tab === "roles") {
        const result = await listPlatformOrgRoleChanges(
          organisation.organisation_id,
          {
            ...shared,
            target_user_id: targetUserId.trim() || undefined,
            role_id: roleId.trim() || undefined,
            action_performed: roleAction.trim() || undefined,
          },
        );
        setRoles(result);
        setLastBatchSize(result.length);
      } else {
        const result = await listPlatformOrgCrossFacilityAccess(
          organisation.organisation_id,
          {
            ...shared,
            patient_id: patientId.trim() || undefined,
            accessed_by_user: accessedByUser.trim() || undefined,
            accessed_from_facility: accessedFromFacility.trim() || undefined,
            record_facility: recordFacility.trim() || undefined,
            record_type: recordType.trim() || undefined,
          },
        );
        setCross(result);
        setLastBatchSize(result.length);
      }
    } catch (err) {
      setError(isApiError(err) ? err.message : "Couldn't load audit records.");
    } finally {
      setLoading(false);
    }
  }, [
    tab,
    dateFrom,
    dateTo,
    offset,
    actionType,
    targetEntityType,
    targetEntityId,
    emailEntered,
    loginSuccess,
    targetUserId,
    roleId,
    roleAction,
    patientId,
    accessedByUser,
    accessedFromFacility,
    recordFacility,
    recordType,
    organisation.organisation_id,
  ]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  function switchTab(next: AuditTab) {
    setTab(next);
    setOffset(0);
  }

  const rows =
    tab === "audit" ? audit : tab === "login" ? logins : tab === "roles" ? roles : cross;

  return (
    <div>
      {!fixedTab && (
        <>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[13.5px] font-semibold text-ink">
                Audit trail — {organisation.organisation_name}
              </h3>
              <p className="mt-0.5 text-[11.5px] text-ink-3">
                Read-only. No impersonation needed to inspect this customer.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2"
              aria-label="Close audit trail"
            >
              <X size={15} />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5 rounded-lg border border-line-2 p-1">
            {(
              [
                ["audit", "Audit events"],
                ["login", "Login attempts"],
                ["roles", "Role changes"],
                ["cross", "Cross-facility"],
              ] as [AuditTab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => switchTab(key)}
                className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium ${
                  tab === key ? "bg-brand text-white" : "text-ink-3 hover:bg-surface-2"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <AuditDateInput label="From" value={dateFrom} onChange={setDateFrom} />
        <AuditDateInput label="To" value={dateTo} onChange={setDateTo} />
      </div>

      <AuditFilterInputs
        tab={tab}
        actionType={actionType}
        setActionType={setActionType}
        targetEntityType={targetEntityType}
        setTargetEntityType={setTargetEntityType}
        targetEntityId={targetEntityId}
        setTargetEntityId={setTargetEntityId}
        emailEntered={emailEntered}
        setEmailEntered={setEmailEntered}
        loginSuccess={loginSuccess}
        setLoginSuccess={setLoginSuccess}
        targetUserId={targetUserId}
        setTargetUserId={setTargetUserId}
        roleId={roleId}
        setRoleId={setRoleId}
        roleAction={roleAction}
        setRoleAction={setRoleAction}
        patientId={patientId}
        setPatientId={setPatientId}
        accessedByUser={accessedByUser}
        setAccessedByUser={setAccessedByUser}
        accessedFromFacility={accessedFromFacility}
        setAccessedFromFacility={setAccessedFromFacility}
        recordFacility={recordFacility}
        setRecordFacility={setRecordFacility}
        recordType={recordType}
        setRecordType={setRecordType}
        resetOffset={() => setOffset(0)}
      />

      {error && <div className="mt-2 text-[12px] text-alert">{error}</div>}

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[11.5px] text-ink-3">
          Showing {rows.length} record{rows.length === 1 ? "" : "s"} from offset {offset}
        </span>
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - LIMIT))}
            className="rounded-lg border border-line-2 px-2.5 py-1 text-[11.5px] text-ink-2 disabled:opacity-50"
          >
            Prev
          </button>
          <button
            type="button"
            disabled={lastBatchSize < LIMIT}
            onClick={() => setOffset(offset + LIMIT)}
            className="rounded-lg border border-line-2 px-2.5 py-1 text-[11.5px] text-ink-2 disabled:opacity-50"
          >
            Load more
          </button>
        </div>
      </div>

      <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-line-2 p-2">
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-4 text-[12px] text-ink-2">
            <Loader2 size={13} className="animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="px-2 py-4 text-[12px] text-ink-2">No records found.</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {tab === "audit" &&
              audit.map((event) => (
                <AuditRecordRow
                  key={event.event_id}
                  title={event.action_type}
                  subtitle={`${event.target_entity_type} · ${event.target_entity_id ?? "-"}`}
                  time={event.created_at}
                  meta={[event.facility_id, event.user_id, event.role_at_time]}
                />
              ))}
            {tab === "login" &&
              logins.map((attempt) => (
                <AuditRecordRow
                  key={attempt.attempt_id}
                  title={attempt.email_entered}
                  subtitle={attempt.failure_reason ?? "successful login"}
                  time={attempt.attempted_at}
                  meta={[attempt.ip_address, attempt.user_agent]}
                  tone={attempt.is_success ? "approved" : "warning"}
                  badge={attempt.is_success ? "success" : "failed"}
                />
              ))}
            {tab === "roles" &&
              roles.map((change) => (
                <AuditRecordRow
                  key={change.id}
                  title={change.action_performed}
                  subtitle={`Target ${change.target_user_id} · Role ${change.role_id}`}
                  time={change.changed_at}
                  meta={[change.facility_id, change.changed_by]}
                />
              ))}
            {tab === "cross" &&
              cross.map((access) => (
                <AuditRecordRow
                  key={access.id}
                  title={access.reason ?? "Cross-facility access"}
                  subtitle={`Patient ${access.patient_id} · ${access.record_type}`}
                  time={access.accessed_at}
                  meta={[
                    `from ${access.accessed_from_facility}`,
                    `record facility ${access.record_facility}`,
                    access.accessed_by_user,
                  ]}
                  tone="warning"
                  badge="access"
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AuditRecordRow({
  title,
  subtitle,
  time,
  meta,
  tone = "neutral",
  badge,
}: {
  title: string;
  subtitle: string;
  time: string;
  meta: (string | null | undefined)[];
  tone?: "neutral" | "approved" | "warning";
  badge?: string;
}) {
  const toneClass =
    tone === "approved"
      ? "text-approved"
      : tone === "warning"
        ? "text-alert"
        : "text-ink-3";
  return (
    <div className="rounded-lg border border-line-2 bg-surface-2 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-medium text-ink">{title}</div>
          <div className="mt-0.5 truncate text-[11.5px] text-ink-3">{subtitle}</div>
        </div>
        {badge && (
          <span className={`shrink-0 text-[10.5px] font-medium uppercase ${toneClass}`}>
            {badge}
          </span>
        )}
      </div>
      <div className="mt-1 truncate text-[11px] text-ink-3">
        {formatDateTime(time)} · {meta.filter(Boolean).join(" · ") || "-"}
      </div>
    </div>
  );
}

function AuditDateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label>
      <span className="mb-1 block text-[11px] font-medium text-ink-2">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-line-2 bg-surface px-2.5 text-[12.5px] text-ink outline-none focus:border-brand"
      />
    </label>
  );
}

function AuditFilterInputs(props: {
  tab: AuditTab;
  actionType: string;
  setActionType: (value: string) => void;
  targetEntityType: string;
  setTargetEntityType: (value: string) => void;
  targetEntityId: string;
  setTargetEntityId: (value: string) => void;
  emailEntered: string;
  setEmailEntered: (value: string) => void;
  loginSuccess: string;
  setLoginSuccess: (value: string) => void;
  targetUserId: string;
  setTargetUserId: (value: string) => void;
  roleId: string;
  setRoleId: (value: string) => void;
  roleAction: string;
  setRoleAction: (value: string) => void;
  patientId: string;
  setPatientId: (value: string) => void;
  accessedByUser: string;
  setAccessedByUser: (value: string) => void;
  accessedFromFacility: string;
  setAccessedFromFacility: (value: string) => void;
  recordFacility: string;
  setRecordFacility: (value: string) => void;
  recordType: string;
  setRecordType: (value: string) => void;
  resetOffset: () => void;
}) {
  const input = (label: string, value: string, onChange: (value: string) => void) => (
    <label>
      <span className="mb-1 block text-[11px] font-medium text-ink-2">{label}</span>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          props.resetOffset();
        }}
        className="h-9 w-full rounded-lg border border-line-2 bg-surface px-2.5 text-[12.5px] text-ink outline-none focus:border-brand"
      />
    </label>
  );

  return (
    <div className="mt-2 grid gap-2 md:grid-cols-3">
      {props.tab === "audit" && (
        <>
          {input("Action type", props.actionType, props.setActionType)}
          {input("Target entity type", props.targetEntityType, props.setTargetEntityType)}
          {input("Target entity ID", props.targetEntityId, props.setTargetEntityId)}
        </>
      )}
      {props.tab === "login" && (
        <>
          {input("Email entered", props.emailEntered, props.setEmailEntered)}
          <label>
            <span className="mb-1 block text-[11px] font-medium text-ink-2">Success</span>
            <select
              value={props.loginSuccess}
              onChange={(e) => {
                props.setLoginSuccess(e.target.value);
                props.resetOffset();
              }}
              className="h-9 w-full rounded-lg border border-line-2 bg-surface px-2.5 text-[12.5px] text-ink outline-none focus:border-brand"
            >
              <option value="">All</option>
              <option value="true">Successful</option>
              <option value="false">Failed</option>
            </select>
          </label>
        </>
      )}
      {props.tab === "roles" && (
        <>
          {input("Target user ID", props.targetUserId, props.setTargetUserId)}
          {input("Role ID", props.roleId, props.setRoleId)}
          {input("Action performed", props.roleAction, props.setRoleAction)}
        </>
      )}
      {props.tab === "cross" && (
        <>
          {input("Patient ID", props.patientId, props.setPatientId)}
          {input("Accessed by user", props.accessedByUser, props.setAccessedByUser)}
          {input(
            "Accessed from facility",
            props.accessedFromFacility,
            props.setAccessedFromFacility,
          )}
          {input("Record facility", props.recordFacility, props.setRecordFacility)}
          {input("Record type", props.recordType, props.setRecordType)}
        </>
      )}
    </div>
  );
}

const FACILITY_TYPES = [
  "hospital",
  "clinic",
  "pharmacy",
  "lab",
  "diagnostic_centre",
  "other",
] as const;

// Facility management for an existing Organisation (spec:
// PLATFORM_CONSOLE_BACKEND_UPDATE.md item #2) — lets Platform Admin
// add/manage a Facility for a customer without impersonating. Mirrors
// /settings/facilities' create/edit forms exactly (same FacilityCreate/
// FacilityUpdate fields), scoped by Organisation ID instead of the
// caller's own token-derived org.
function OrganisationFacilitiesPanel({
  organisation,
  onClose,
}: {
  organisation: PlatformOrganisation;
  onClose: () => void;
}) {
  const [facilities, setFacilities] = useState<Facility[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null);
  const [blastRadius, setBlastRadius] = useState<{
    facilityName: string;
    rolesDeactivated: number;
    sessionsEnded: number;
  } | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    listPlatformOrgFacilities(organisation.organisation_id, { limit: 200 })
      .then(setFacilities)
      .catch(setLoadError)
      .finally(() => setLoading(false));
  }, [organisation.organisation_id]);

  useEffect(() => {
    queueMicrotask(reload);
  }, [reload]);

  async function handleDeactivate(facility: Facility) {
    if (!window.confirm(`Deactivate ${facility.facility_name}?`)) return;
    try {
      const result = await deactivatePlatformOrgFacility(
        organisation.organisation_id,
        facility.facility_id,
      );
      setBlastRadius({
        facilityName: facility.facility_name,
        rolesDeactivated: result.facility_roles_deactivated,
        sessionsEnded: result.sessions_ended,
      });
      reload();
    } catch (err) {
      setLoadError(err);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[13.5px] font-semibold text-ink">
            Facilities — {organisation.organisation_name}
          </h3>
          <p className="mt-0.5 text-[11.5px] text-ink-3">
            Add or manage this customer&apos;s Facilities without impersonating.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-2.5 py-1.5 text-[11.5px] font-medium text-white"
          >
            <Plus size={12} /> New Facility
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2"
            aria-label="Close Facility management"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {blastRadius && (
        <div className="mt-3 rounded-lg border border-alert-line bg-alert-tint px-3.5 py-2.5 text-[12.5px] text-alert">
          {blastRadius.facilityName} deactivated — {blastRadius.rolesDeactivated}{" "}
          Facility-role assignment{blastRadius.rolesDeactivated === 1 ? "" : "s"} deactivated,{" "}
          {blastRadius.sessionsEnded} session{blastRadius.sessionsEnded === 1 ? "" : "s"} ended.
        </div>
      )}

      {showCreate && (
        <PlatformFacilityForm
          mode="create"
          organisationId={organisation.organisation_id}
          onCancel={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            reload();
          }}
        />
      )}

      {editingFacility && (
        <PlatformFacilityForm
          mode="edit"
          organisationId={organisation.organisation_id}
          facility={editingFacility}
          onCancel={() => setEditingFacility(null)}
          onSaved={() => {
            setEditingFacility(null);
            reload();
          }}
        />
      )}

      <div className="mt-3">
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-4 text-[12px] text-ink-2">
            <Loader2 size={13} className="animate-spin" /> Loading Facilities…
          </div>
        ) : Boolean(loadError) ? (
          <ErrorState error={loadError} onRetry={reload} />
        ) : facilities && facilities.length === 0 ? (
          <div className="px-2 py-4 text-[12px] text-ink-2">No Facilities yet.</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {(facilities ?? []).map((f) => (
              <div
                key={f.facility_id}
                className="flex items-center gap-2 rounded-lg border border-line-2 bg-surface-2 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium text-ink">
                    {f.facility_name}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-ink-3">
                    {f.facility_type} {f.city ? `· ${f.city}` : ""}
                  </div>
                </div>
                {!f.is_active && (
                  <span className="shrink-0 rounded-full border border-alert-line bg-alert-tint px-2 py-0.5 text-[10.5px] font-medium text-alert">
                    Deactivated
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setEditingFacility(f)}
                  className="shrink-0 rounded-md p-1.5 text-ink-3 hover:bg-surface"
                  aria-label={`Edit ${f.facility_name}`}
                >
                  <Edit3 size={13} />
                </button>
                {f.is_active && (
                  <button
                    type="button"
                    onClick={() => handleDeactivate(f)}
                    className="shrink-0 rounded-md p-1.5 text-alert hover:bg-alert-tint"
                    aria-label={`Deactivate ${f.facility_name}`}
                  >
                    <Trash2 size={13} />
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

function PlatformFacilityForm({
  mode,
  organisationId,
  facility,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  organisationId: string;
  facility?: Facility;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [facilityName, setFacilityName] = useState(facility?.facility_name ?? "");
  const [facilityType, setFacilityType] = useState<(typeof FACILITY_TYPES)[number]>(
    (facility?.facility_type as (typeof FACILITY_TYPES)[number]) ?? "clinic",
  );
  const [city, setCity] = useState(facility?.city ?? "");
  const [address, setAddress] = useState(facility?.address ?? "");
  const [phoneNumber, setPhoneNumber] = useState(facility?.phone_number ?? "");
  const [timezone, setTimezone] = useState(
    facility?.timezone ??
      (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC"),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!facilityName.trim()) {
      setError("Facility name is required.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "create") {
        const payload: FacilityCreate = {
          facility_name: facilityName.trim(),
          facility_type: facilityType,
          timezone: timezone.trim() || "UTC",
          ...(city.trim() && { city: city.trim() }),
          ...(address.trim() && { address: address.trim() }),
          ...(phoneNumber.trim() && { phone_number: phoneNumber.trim() }),
        };
        await createPlatformOrgFacility(organisationId, payload);
      } else if (facility) {
        const payload: FacilityUpdate = {
          facility_name: facilityName.trim(),
          facility_type: facilityType,
          city: city.trim() || null,
          address: address.trim() || null,
          phone_number: phoneNumber.trim() || null,
          timezone: timezone.trim() || null,
        };
        await updatePlatformOrgFacility(organisationId, facility.facility_id, payload);
      }
      onSaved();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Couldn't save this Facility.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-line-2 bg-surface-2 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-[13px] font-semibold text-ink">
          {mode === "create" ? "New Facility" : `Edit ${facility?.facility_name}`}
        </h4>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md p-1 text-ink-3 hover:bg-surface"
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
      <form onSubmit={handleSubmit} className="mt-3 grid gap-2.5 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-medium text-ink-2">Facility name</span>
          <input
            required
            autoFocus
            minLength={2}
            maxLength={255}
            value={facilityName}
            onChange={(e) => setFacilityName(e.target.value)}
            className="h-9 rounded-md border border-line-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-medium text-ink-2">Facility type</span>
          <select
            value={facilityType}
            onChange={(e) =>
              setFacilityType(e.target.value as (typeof FACILITY_TYPES)[number])
            }
            className="h-9 rounded-md border border-line-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-brand"
          >
            {FACILITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-medium text-ink-2">City</span>
          <input
            maxLength={100}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="h-9 rounded-md border border-line-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-medium text-ink-2">Phone number</span>
          <input
            maxLength={30}
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            className="h-9 rounded-md border border-line-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-[11.5px] font-medium text-ink-2">Address</span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="h-9 rounded-md border border-line-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-[11.5px] font-medium text-ink-2">Timezone (IANA)</span>
          <input
            required
            maxLength={64}
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="e.g. Asia/Karachi"
            className="h-9 rounded-md border border-line-2 bg-surface px-2.5 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-brand"
          />
        </label>
        <div className="mt-1 flex gap-2 md:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-md bg-brand px-3.5 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-60"
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            {mode === "create" ? "Create Facility" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-line px-3.5 py-1.5 text-[12.5px] font-medium text-ink-2 hover:bg-surface"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// Per-Organisation Intelligence dashboard (spec:
// PLATFORM_CONSOLE_BACKEND_UPDATE.md item #4) — the same deterministic
// analytics snapshot a tenant Owner/Facility Manager sees via
// /intelligence/dashboard, viewed from the platform side for support
// purposes. Reuses the shared ExecutionCard renderer, not a duplicate —
// same DashboardResponse.sections shape as the tenant-side dashboard.
function OrganisationIntelligencePanel({
  organisation,
  onClose,
}: {
  organisation: PlatformOrganisation;
  onClose: () => void;
}) {
  const [dateFrom, setDateFrom] = useState(() => addDays(localToday(), -7));
  const [dateTo, setDateTo] = useState(() => localToday());
  const [dashboard, setDashboard] = useState<IntelligenceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (dateTo < dateFrom) {
      setError("Date to must be the same as or after date from.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getPlatformOrgIntelligenceDashboard(
        organisation.organisation_id,
        { date_from: dateFrom, date_to: dateTo },
      );
      setDashboard(result);
    } catch (err) {
      setDashboard(null);
      setError(isApiError(err) ? err.message : "Couldn't load the Intelligence dashboard.");
    } finally {
      setLoading(false);
    }
  }, [organisation.organisation_id, dateFrom, dateTo]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[13.5px] font-semibold text-ink">
            Intelligence — {organisation.organisation_name}
          </h3>
          <p className="mt-0.5 text-[11.5px] text-ink-3">
            Organisation-wide analytics snapshot, viewed without impersonating.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2"
          aria-label="Close Intelligence dashboard"
        >
          <X size={15} />
        </button>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-[150px_150px_auto]">
        <label>
          <span className="mb-1 block text-[11px] font-medium text-ink-2">From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 w-full rounded-lg border border-line-2 bg-surface px-2.5 text-[12.5px] text-ink outline-none focus:border-brand"
          />
        </label>
        <label>
          <span className="mb-1 block text-[11px] font-medium text-ink-2">To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 w-full rounded-lg border border-line-2 bg-surface px-2.5 text-[12.5px] text-ink outline-none focus:border-brand"
          />
        </label>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex h-9 items-end justify-center gap-2 rounded-lg bg-brand px-3.5 text-[12.5px] font-medium text-white disabled:opacity-60"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Refresh
        </button>
      </div>

      {error && <div className="mt-2 text-[12px] text-alert">{error}</div>}

      <div className="mt-3">
        {loading && !dashboard ? (
          <div className="flex items-center gap-2 px-2 py-4 text-[12px] text-ink-2">
            <Loader2 size={13} className="animate-spin" /> Loading…
          </div>
        ) : dashboard ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {Object.entries(dashboard.sections).map(([name, section]) => (
              <ExecutionCard key={name} result={section} fallbackName={name} />
            ))}
          </div>
        ) : (
          <div className="px-2 py-4 text-[12px] text-ink-2">No dashboard loaded.</div>
        )}
      </div>
    </div>
  );
}

function isSensitiveConfig(config: PlatformConfig): boolean {
  const key = config.config_key.toLowerCase();
  const value = config.config_value.toLowerCase();
  return [
    "secret",
    "token",
    "password",
    "private",
    "apikey",
    "api_key",
    "connection",
    "credential",
    "smtp",
  ].some((needle) => key.includes(needle) || value.includes(needle));
}

function maskValue(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "********";
  return `${value.slice(0, 2)}********${value.slice(-2)}`;
}

function formatAuditDetails(details: PlatformAuditLog["details"]): string {
  if (!details || Object.keys(details).length === 0) return "{}";
  return JSON.stringify(details, null, 2);
}
