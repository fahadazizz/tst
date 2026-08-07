"use client";

// /facility-ops — Facility Manager's landing view: today's operational
// numbers for their active Facility, plus the Facility's Department list.
// Deliberately does NOT include a "capacity" widget or a facility-wide
// staff roster — neither is backed by a real endpoint the Facility Manager
// role template can actually call (see docs/engineering/frontend/
// PERSONA_LANDING_PLAN.md and the P3 implementation notes): a facility-
// filtered staff/role listing requires users:roles:read, which this
// template intentionally does not grant, and there is no facility-level
// capacity concept anywhere in the backend (only a Platform/Group
// subscription concept exists). Every figure below comes from an endpoint
// this role's real permissions can call — nothing here is a stub.

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Bell,
  Building2,
  CalendarDays,
  CreditCard,
  ListOrdered,
  Loader2,
} from "lucide-react";
import { useSession } from "@/context/session";
import { hasPermission } from "@/lib/permissions";
import {
  getReceptionDashboard,
  type ReceptionDashboard,
} from "@/lib/api/operations";
import { listDepartments, type Department } from "@/lib/api/tenant";
import { getActiveTimeZone } from "@/lib/format";
import { buildFacilityQueryKey, getCached, setCached } from "@/lib/queryCache";

function todayISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: getActiveTimeZone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatMoney(value: string | null | undefined, currency = "PKR"): string {
  if (value === null || value === undefined) return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${currency} ${value}`;
  return `${currency} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function statusLine(statuses: Record<string, number>): string {
  const ordered = ["scheduled", "confirmed", "checked_in"];
  const parts = ordered
    .map((status) => [status, statuses[status] ?? 0] as const)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${status.replace("_", " ")}`);
  return parts.length > 0 ? parts.join(" · ") : "No appointments found";
}

export default function FacilityOpsPage() {
  const { scope, organisation, activeFacility } = useSession();

  const canReadAppointments = hasPermission(scope, "appointment.read");
  const canReadQueue = hasPermission(scope, "queue.read");
  const canReadBilling = hasPermission(scope, "invoice.read");
  const canReadNotifications = hasPermission(scope, "notification.read");
  const canReadDepartments = hasPermission(scope, "department.read");

  const [date, setDate] = useState(todayISO);
  const [dashboard, setDashboard] = useState<ReceptionDashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptLoading, setDeptLoading] = useState(true);
  const [deptError, setDeptError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDashboardLoading(true);
      setDashboardError(null);
      if (!canReadQueue && !canReadAppointments && !canReadBilling) {
        setDashboard(null);
        setDashboardLoading(false);
        return;
      }
      const cacheKey = buildFacilityQueryKey({
        organisationId: organisation.organisation_id,
        facilityId: activeFacility.facility_id,
        resource: "reception-dashboard",
        filters: { date },
      });
      const cached = getCached<ReceptionDashboard>(cacheKey);
      if (cached) {
        setDashboard(cached);
        setDashboardLoading(false);
        return;
      }
      try {
        const data = await getReceptionDashboard(date);
        setCached(cacheKey, data);
        if (!cancelled) setDashboard(data);
      } catch (err) {
        if (!cancelled) {
          setDashboard(null);
          setDashboardError(
            err instanceof Error
              ? err.message
              : "Couldn't load today's numbers for this Facility.",
          );
        }
      } finally {
        if (!cancelled) setDashboardLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    activeFacility.facility_id,
    canReadAppointments,
    canReadBilling,
    canReadQueue,
    date,
    organisation.organisation_id,
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDeptLoading(true);
      setDeptError(null);
      if (!canReadDepartments) {
        setDepartments([]);
        setDeptLoading(false);
        return;
      }
      try {
        const data = await listDepartments(activeFacility.facility_id);
        if (!cancelled) setDepartments(data);
      } catch (err) {
        if (!cancelled) {
          setDepartments([]);
          setDeptError(
            err instanceof Error
              ? err.message
              : "Couldn't load Departments for this Facility.",
          );
        }
      } finally {
        if (!cancelled) setDeptLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeFacility.facility_id, canReadDepartments]);

  const kpis = dashboard?.kpis;
  const appointmentsByStatus = kpis?.appointments_by_status ?? {};
  const appointmentTotal = Object.values(appointmentsByStatus).reduce(
    (sum, n) => sum + n,
    0,
  );

  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-6 px-6 py-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-brand">
            <Building2 size={13} />
            Facility operations
          </p>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-ink">
            {activeFacility.facility_name}
          </h1>
        </div>
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="h-9 rounded-xl border border-line bg-surface px-3 text-[12.5px] font-medium text-ink outline-none focus:border-brand-line"
        />
      </div>

      {dashboardError && (
        <div className="flex items-start gap-2 rounded-2xl border border-danger-line bg-danger-tint px-4 py-3 text-[12.5px] text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{dashboardError}</span>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-ink-3">
          Today&apos;s numbers
        </h2>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {canReadAppointments && (
            <StatCard
              icon={CalendarDays}
              value={dashboardLoading ? null : appointmentTotal}
              loading={dashboardLoading}
              label="Appointments today"
              sub={statusLine(appointmentsByStatus)}
            />
          )}
          {canReadQueue && (
            <StatCard
              icon={ListOrdered}
              value={dashboardLoading ? null : kpis?.patients_waiting ?? 0}
              loading={dashboardLoading}
              label="Waiting in queue"
              sub="Checked in, awaiting doctor"
            />
          )}
          {canReadBilling && (
            <StatCard
              icon={CreditCard}
              value={dashboardLoading ? null : formatMoney(kpis?.payments_collected_today)}
              loading={dashboardLoading}
              label="Payments collected"
              sub={`${kpis?.payments_count_today ?? 0} payments today`}
            />
          )}
          {canReadNotifications && (
            <StatCard
              icon={Bell}
              value={dashboardLoading ? null : kpis?.notification_failures ?? 0}
              loading={dashboardLoading}
              label="Notification failures"
              sub="Delivery issues needing review"
            />
          )}
        </div>
        {canReadBilling && (
          <div className="mt-3.5 rounded-2xl border border-line bg-surface p-4">
            <div className="text-[11.5px] font-medium uppercase tracking-wide text-ink-3">
              Outstanding invoices
            </div>
            <div className="mt-1.5 text-[19px] font-semibold text-ink">
              {dashboardLoading ? "—" : formatMoney(kpis?.outstanding_invoices_total)}
            </div>
            <div className="mt-0.5 text-[11.5px] text-ink-3">
              {kpis?.outstanding_invoices_count ?? 0} open invoices
            </div>
          </div>
        )}
      </section>

      {canReadDepartments && (
        <section>
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-ink-3">
            Departments
          </h2>
          {deptError && (
            <div className="mb-3 flex items-start gap-2 rounded-2xl border border-danger-line bg-danger-tint px-4 py-3 text-[12.5px] text-danger">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{deptError}</span>
            </div>
          )}
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            {deptLoading ? (
              <div className="flex items-center justify-center px-4 py-8">
                <Loader2 size={20} className="animate-spin text-ink-3" />
              </div>
            ) : departments.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12.5px] text-ink-3">
                No Departments set up for this Facility yet.
              </div>
            ) : (
              <div className="divide-y divide-line">
                {departments.map((dept) => (
                  <div
                    key={dept.department_id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div>
                      <div className="text-[13px] font-medium text-ink">
                        {dept.department_name}
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-ink-3">
                        {dept.department_code}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        dept.is_active
                          ? "bg-approved-tint text-approved"
                          : "bg-surface-2 text-ink-3"
                      }`}
                    >
                      {dept.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  value,
  loading,
  label,
  sub,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  value: number | string | null;
  loading: boolean;
  label: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <span className="grid size-10 place-items-center rounded-xl bg-brand-tint text-brand">
        <Icon size={18} />
      </span>
      <div className="mt-4 flex items-end gap-2">
        <span className="text-[28px] font-semibold leading-none tracking-tight text-ink">
          {loading ? (
            <Loader2 size={22} className="mb-1 animate-spin text-ink-3" />
          ) : value === null ? (
            "—"
          ) : (
            value
          )}
        </span>
      </div>
      <div className="mt-2">
        <div className="text-[13px] font-medium text-ink">{label}</div>
        <div className="text-[11.5px] text-ink-3">{sub}</div>
      </div>
    </div>
  );
}
