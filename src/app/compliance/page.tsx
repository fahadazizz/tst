"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listAuditEvents,
  listCrossFacilityAccess,
  listLoginAttempts,
  listRoleChanges,
  type AuditEvent,
  type CrossFacilityAccess,
  type LoginAttempt,
  type RoleChange,
} from "@/lib/api/compliance";
import { isApiError } from "@/lib/api";
import { useSession } from "@/context/session";
import { hasPermission } from "@/lib/permissions";
import { formatDateTime, zonedDateKey, addDays } from "@/lib/format";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/design-system/States";
import { StatusBadge } from "@/components/design-system/StatusBadge";
import { FileSearch, Loader2, RefreshCw } from "lucide-react";

type Tab = "audit" | "login" | "roles" | "cross";

// Facility-local calendar day, not UTC's — see appointments/page.tsx for why.
function today() {
  return zonedDateKey(new Date().toISOString());
}

function daysAgo(days: number) {
  return addDays(today(), -days);
}

export default function CompliancePage() {
  const { scope } = useSession();
  const canRead = hasPermission(scope, "audit.read");
  const [tab, setTab] = useState<Tab>("audit");
  const [dateFrom, setDateFrom] = useState(daysAgo(7));
  const [dateTo, setDateTo] = useState(today());
  const [page, setPage] = useState(1);
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
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [logins, setLogins] = useState<LoginAttempt[]>([]);
  const [roles, setRoles] = useState<RoleChange[]>([]);
  const [cross, setCross] = useState<CrossFacilityAccess[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canRead) return;
    if (dateTo < dateFrom) {
      setError("Date to must be the same as or after date from.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (tab === "audit") {
        const result = await listAuditEvents({
          action_type: actionType.trim() || undefined,
          target_entity_type: targetEntityType.trim() || undefined,
          target_entity_id: targetEntityId.trim() || undefined,
          date_from: dateFrom,
          date_to: dateTo,
          page,
          page_size: 20,
        });
        setAudit(result.data);
      } else if (tab === "login") {
        const result = await listLoginAttempts({
          email_entered: emailEntered.trim() || undefined,
          is_success:
            loginSuccess === "true" ? true : loginSuccess === "false" ? false : null,
          date_from: dateFrom,
          date_to: dateTo,
          page,
          page_size: 20,
        });
        setLogins(result.data);
      } else if (tab === "roles") {
        const result = await listRoleChanges({
          target_user_id: targetUserId.trim() || undefined,
          role_id: roleId.trim() || undefined,
          action_performed: roleAction.trim() || undefined,
          date_from: dateFrom,
          date_to: dateTo,
          page,
          page_size: 20,
        });
        setRoles(result.data);
      } else {
        const result = await listCrossFacilityAccess({
          patient_id: patientId.trim() || undefined,
          accessed_by_user: accessedByUser.trim() || undefined,
          accessed_from_facility: accessedFromFacility.trim() || undefined,
          record_facility: recordFacility.trim() || undefined,
          record_type: recordType.trim() || undefined,
          date_from: dateFrom,
          date_to: dateTo,
          page,
          page_size: 20,
        });
        setCross(result.data);
      }
    } catch (e) {
      setError(isApiError(e) ? e.message : "Couldn't load compliance records.");
    } finally {
      setLoading(false);
    }
  }, [
    accessedByUser,
    accessedFromFacility,
    actionType,
    canRead,
    dateFrom,
    dateTo,
    emailEntered,
    loginSuccess,
    page,
    patientId,
    recordFacility,
    recordType,
    roleAction,
    roleId,
    tab,
    targetEntityId,
    targetEntityType,
    targetUserId,
  ]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-5 px-6 py-6">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight text-ink">
          Compliance
        </h1>
        <p className="mt-0.5 text-[12.5px] text-ink-2">
          Read-only audit events, login attempts, role changes, and cross-facility access
        </p>
      </div>

      {!canRead ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ErrorState
            title="Access denied"
            message="You don't have permission to view compliance records."
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-line bg-surface p-1.5">
            {[
              ["audit", "Audit events"],
              ["login", "Login attempts"],
              ["roles", "Role changes"],
              ["cross", "Cross-facility"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setTab(key as Tab);
                  setPage(1);
                }}
                className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium ${
                  tab === key
                    ? "bg-brand text-white"
                    : "text-ink-3 hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <section className="rounded-xl border border-line bg-surface p-4">
            <div className="grid gap-3 md:grid-cols-[150px_150px_1fr_auto] md:items-end">
              <DateInput label="From" value={dateFrom} onChange={setDateFrom} />
              <DateInput label="To" value={dateTo} onChange={setDateTo} />
              <div />
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand px-3.5 text-[12.5px] font-medium text-white disabled:opacity-60"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Refresh
              </button>
            </div>
            <ComplianceFilters
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
              resetPage={() => setPage(1)}
            />
            {error && <div className="mt-3 text-[12px] text-alert">{error}</div>}
          </section>

          <section className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-semibold text-ink">{tabTitle(tab)}</h2>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage(Math.max(1, page - 1))}
                  className="rounded-lg border border-line-2 px-2.5 py-1 text-[11.5px] text-ink-2 disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setPage(page + 1)}
                  className="rounded-lg border border-line-2 px-2.5 py-1 text-[11.5px] text-ink-2"
                >
                  Next
                </button>
              </div>
            </div>
            {loading ? (
              <ListSkeleton rows={4} />
            ) : (
              <ComplianceRows tab={tab} audit={audit} logins={logins} roles={roles} cross={cross} />
            )}
          </section>
        </>
      )}
    </div>
  );
}

function ComplianceRows({
  tab,
  audit,
  logins,
  roles,
  cross,
}: {
  tab: Tab;
  audit: AuditEvent[];
  logins: LoginAttempt[];
  roles: RoleChange[];
  cross: CrossFacilityAccess[];
}) {
  const rows =
    tab === "audit" ? audit : tab === "login" ? logins : tab === "roles" ? roles : cross;
  if (rows.length === 0) {
    return <EmptyState icon={FileSearch} title="No records found" />;
  }
  return (
    <div className="flex flex-col gap-2">
      {tab === "audit" &&
        audit.map((event) => (
          <RecordRow
            key={event.event_id}
            title={event.action_type}
            subtitle={`${event.target_entity_type} · ${event.target_entity_id ?? "-"}`}
            time={event.created_at}
            meta={[event.facility_id, event.user_id, event.role_at_time]}
          />
        ))}
      {tab === "login" &&
        logins.map((attempt) => (
          <RecordRow
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
          <RecordRow
            key={change.id}
            title={change.action_performed}
            subtitle={`Target ${change.target_user_id} · Role ${change.role_id}`}
            time={change.changed_at}
            meta={[change.facility_id, change.changed_by]}
          />
        ))}
      {tab === "cross" &&
        cross.map((access) => (
          <RecordRow
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
  );
}

function RecordRow({
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
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-medium text-ink">{title}</div>
          <div className="mt-0.5 truncate text-[11.5px] text-ink-3">{subtitle}</div>
        </div>
        {badge && <StatusBadge tone={tone}>{badge}</StatusBadge>}
      </div>
      <div className="mt-1 truncate text-[11.5px] text-ink-3">
        {formatDateTime(time)} · {meta.filter(Boolean).join(" · ") || "-"}
      </div>
    </div>
  );
}

function ComplianceFilters(props: {
  tab: Tab;
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
  resetPage: () => void;
}) {
  const input = (
    label: string,
    value: string,
    onChange: (value: string) => void,
  ) => (
    <label>
      <span className="mb-1 block text-[11px] font-medium text-ink-2">{label}</span>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          props.resetPage();
        }}
        className="h-9 w-full rounded-lg border border-line-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-brand"
      />
    </label>
  );

  return (
    <div className="mt-3 grid gap-2 md:grid-cols-3">
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
                props.resetPage();
              }}
              className="h-9 w-full rounded-lg border border-line-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-brand"
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

function tabTitle(tab: Tab) {
  if (tab === "audit") return "Audit events";
  if (tab === "login") return "Login attempts";
  if (tab === "roles") return "Role changes";
  return "Cross-facility access";
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-line-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-brand"
      />
    </label>
  );
}
