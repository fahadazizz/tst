"use client";

// /dashboard — the landing page. A calm clinical "start of day" view: a dated
// greeting, the live queue pulse, real counts, and inviting next actions. Cards
// are permission-gated (RULE 3) so each role sees only what they can reach. All
// figures come from the live API; nothing here is mock.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ListOrdered,
  UserPlus,
  Stethoscope,
  Users,
  ArrowUpRight,
  Loader2,
  Activity,
  AlertCircle,
  CreditCard,
  BellRing,
} from "lucide-react";
import { useSession } from "@/context/session";
import { hasPermission } from "@/lib/permissions";
import {
  getReceptionDashboard,
  type ReceptionDashboard,
} from "@/lib/api/operations";
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

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function longDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function DashboardPage() {
  const { user, scope, organisation, activeFacility } = useSession();

  const canReadAppointments = hasPermission(scope, "appointment.read");
  const canReadQueue = hasPermission(scope, "queue.read");
  const canConsult = hasPermission(scope, "consultation.read");
  const canRegister = hasPermission(scope, "patient.register");
  const canBook = hasPermission(scope, "appointment.write");
  const canReadBilling = hasPermission(scope, "invoice.read");
  const canReadTasks = hasPermission(scope, "task.read");
  const canReadNotifications = hasPermission(scope, "notification.read");

  const [dashboard, setDashboard] = useState<ReceptionDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(todayISO);

  const firstName = (user.full_name || "there")
    .replace(/^(Dr|Mr|Ms|Mrs)\.?\s+/i, "")
    .split(" ")[0];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      if (!canReadQueue) {
        setDashboard(null);
        setLoading(false);
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
        setLoading(false);
        return;
      }
      try {
        const data = await getReceptionDashboard(date);
        setCached(cacheKey, data);
        if (!cancelled) setDashboard(data);
      } catch (err) {
        if (!cancelled) {
          setDashboard(null);
          setError(
            err instanceof Error
              ? err.message
              : "Couldn't load the reception dashboard.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeFacility.facility_id, canReadQueue, date, organisation.organisation_id]);

  const kpis = dashboard?.kpis;
  const appointmentsByStatus = kpis?.appointments_by_status ?? {};
  const appointmentTotal = Object.values(appointmentsByStatus).reduce(
    (sum, n) => sum + n,
    0,
  );
  const waiting = kpis?.patients_waiting ?? null;
  const payments = kpis?.payments_collected_today ?? null;
  const outstanding = kpis?.outstanding_invoices_total ?? null;

  return (
    <div className="mx-auto max-w-[1080px] px-6 py-7">
      {/* Greeting */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-wide text-brand">
            {longDate()}
          </p>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-ink">
            {greeting()}, {firstName}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="h-9 rounded-xl border border-line bg-surface px-3 text-[12.5px] font-medium text-ink outline-none focus:border-brand-line"
          />
        </div>
        {waiting !== null && waiting > 0 && (
          <div className="flex items-center gap-2 rounded-full border border-brand-line bg-brand-tint px-3.5 py-1.5 text-[12.5px] font-medium text-brand">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-brand" />
            </span>
            {waiting} {waiting === 1 ? "patient" : "patients"} waiting now
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-danger-line bg-danger-tint px-4 py-3 text-[12.5px] text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        {canReadAppointments && (
          <StatCard
            icon={CalendarDays}
            value={appointmentTotal}
            loading={loading}
            label="Appointments today"
            sub={statusLine(appointmentsByStatus)}
            href="/appointments"
            tone="brand"
          />
        )}
        {(canReadQueue || canConsult) && (
          <StatCard
            icon={ListOrdered}
            value={waiting}
            loading={loading}
            label={canConsult ? "In your queue" : "Waiting in queue"}
            sub={canConsult ? "Ready to be seen" : "Checked in, awaiting doctor"}
            href={canConsult ? "/consultations" : "/queue"}
            tone="draft"
          />
        )}
        {canReadBilling && (
          <StatCard
            icon={CreditCard}
            value={formatMoney(payments, dashboardCurrency(dashboard))}
            loading={loading}
            label="Payments collected"
            sub={`${kpis?.payments_count_today ?? 0} payments today`}
            href="/billing"
            tone="approved"
          />
        )}
      </div>

      {(canReadBilling || canReadTasks || canReadNotifications) && (
        <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          {canReadBilling && (
            <SmallMetric
              label="Outstanding invoices"
              value={formatMoney(outstanding, dashboardCurrency(dashboard))}
              sub={`${kpis?.outstanding_invoices_count ?? 0} open invoices`}
            />
          )}
          {canReadTasks && (
            <SmallMetric
              label="Pending follow-ups"
              value={kpis?.follow_ups_pending ?? null}
              sub="Assigned task queue"
            />
          )}
          {canReadNotifications && (
            <SmallMetric
              label="Notification failures"
              value={kpis?.notification_failures ?? null}
              sub="Delivery issues needing review"
              icon={BellRing}
            />
          )}
        </div>
      )}

      {dashboard && (
        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          <section className="rounded-2xl border border-line bg-surface p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[14px] font-semibold text-ink">
                  Doctor queue availability
                </h2>
                <p className="text-[11.5px] text-ink-3">
                  Live queue length, wait estimate, and next slot
                </p>
              </div>
              <Link
                href="/queue"
                className="text-[12px] font-medium text-brand hover:underline"
              >
                Queue board
              </Link>
            </div>
            {dashboard.doctor_queues.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line bg-surface-2 px-4 py-6 text-center text-[12.5px] text-ink-3">
                No doctors with active schedules for this date.
              </div>
            ) : (
              <div className="divide-y divide-line">
                {dashboard.doctor_queues.slice(0, 8).map((doctor) => (
                  <div
                    key={`${doctor.doctor_id}-${doctor.department_id ?? "facility"}`}
                    className="grid grid-cols-[1fr_auto] gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-ink">
                        Dr {doctor.doctor_id.slice(0, 8)}…
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-ink-3">
                        {doctor.waiting_count} waiting ·{" "}
                        {doctor.estimated_wait_minutes} min estimate
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`text-[12px] font-medium ${
                          doctor.overbooked ? "text-danger" : "text-approved"
                        }`}
                      >
                        {doctor.overbooked ? "Overbooked" : "Available"}
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-ink-3">
                        {doctor.next_available_slot
                          ? new Date(doctor.next_available_slot).toLocaleTimeString(
                              "en-GB",
                              { hour: "2-digit", minute: "2-digit" },
                            )
                          : "No slot"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-[14px] font-semibold text-ink">Alerts</h2>
            <div className="mt-4 space-y-2">
              {dashboard.alerts.length === 0 ? (
                <div className="rounded-xl border border-line bg-surface-2 px-3 py-3 text-[12.5px] text-ink-3">
                  No backend alerts for this date.
                </div>
              ) : (
                dashboard.alerts.map((alert) => (
                  <div
                    key={alert}
                    className="flex items-start gap-2 rounded-xl border border-warning-line bg-warning-tint px-3 py-2.5 text-[12.5px] text-warning"
                  >
                    <AlertCircle size={15} className="mt-0.5 shrink-0" />
                    <span>{alert}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {/* Quick actions */}
      <div className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <Activity size={15} className="text-ink-3" />
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">
            Jump back in
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          {canConsult && (
            <ActionCard
              icon={Stethoscope}
              title="See your queue"
              desc="Start a consultation with the next patient waiting"
              href="/consultations"
              primary
            />
          )}
          {canRegister && (
            <ActionCard
              icon={UserPlus}
              title="Register a patient"
              desc="Add a new patient to the master index"
              href="/patients/new"
              primary={!canConsult}
            />
          )}
          {canBook && (
            <ActionCard
              icon={CalendarDays}
              title="Book an appointment"
              desc="Schedule a patient with a doctor"
              href="/appointments"
            />
          )}
          <ActionCard
            icon={Users}
            title="Find a patient"
            desc="Search the index by name or CNIC"
            href="/patients"
          />
        </div>
      </div>
    </div>
  );
}

const TONES: Record<string, { tint: string; line: string; text: string; iconBg: string }> = {
  brand: {
    tint: "bg-brand-tint",
    line: "hover:border-brand-line",
    text: "text-brand",
    iconBg: "bg-brand-tint text-brand",
  },
  draft: {
    tint: "bg-draft-tint",
    line: "hover:border-draft-line",
    text: "text-draft",
    iconBg: "bg-draft-tint text-draft",
  },
  approved: {
    tint: "bg-approved-tint",
    line: "hover:border-approved-line",
    text: "text-approved",
    iconBg: "bg-approved-tint text-approved",
  },
};

function statusLine(statuses: Record<string, number>): string {
  const ordered = ["scheduled", "confirmed", "checked_in"];
  const parts = ordered
    .map((status) => [status, statuses[status] ?? 0] as const)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${status.replace("_", " ")}`);
  return parts.length > 0 ? parts.join(" · ") : "No appointments found";
}

function dashboardCurrency(dashboard: ReceptionDashboard | null): string {
  return dashboard?.kpis.payments_collected_today ||
    dashboard?.kpis.outstanding_invoices_total
    ? "PKR"
    : "PKR";
}

function formatMoney(value: string | null, currency: string): string | null {
  if (value === null) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${currency} ${value}`;
  return `${currency} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function StatCard({
  icon: Icon,
  value,
  loading,
  label,
  sub,
  href,
  tone,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  value: number | string | null;
  loading: boolean;
  label: string;
  sub: string;
  href: string;
  tone: "brand" | "draft" | "approved";
}) {
  const t = TONES[tone];
  return (
    <Link
      href={href}
      className={`group relative overflow-hidden rounded-2xl border border-line bg-surface p-5 transition-all hover:shadow-sm ${t.line}`}
    >
      <div className="flex items-start justify-between">
        <span className={`grid size-10 place-items-center rounded-xl ${t.iconBg}`}>
          <Icon size={18} />
        </span>
        <ArrowUpRight
          size={16}
          className="text-ink-3 opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>
      <div className="mt-4 flex items-end gap-2">
        <span className="text-[32px] font-semibold leading-none tracking-tight text-ink">
          {loading ? (
            <Loader2 size={24} className="mb-1 animate-spin text-ink-3" />
          ) : value === null ? (
            "—"
          ) : (
            value
          )}
        </span>
      </div>
      <div className="mt-2">
        <div className="text-[13.5px] font-medium text-ink">{label}</div>
        <div className="text-[11.5px] text-ink-3">{sub}</div>
      </div>
    </Link>
  );
}

function SmallMetric({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: number | string | null;
  sub: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11.5px] font-medium uppercase tracking-wide text-ink-3">
            {label}
          </div>
          <div className="mt-2 text-[21px] font-semibold leading-none text-ink">
            {value === null ? "—" : value}
          </div>
          <div className="mt-1.5 text-[11.5px] text-ink-3">{sub}</div>
        </div>
        {Icon && (
          <span className="grid size-9 place-items-center rounded-xl bg-surface-2 text-ink-3">
            <Icon size={16} />
          </span>
        )}
      </div>
    </div>
  );
}

function ActionCard({
  icon: Icon,
  title,
  desc,
  href,
  primary,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  desc: string;
  href: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-start gap-3.5 rounded-2xl border p-5 transition-all hover:shadow-sm ${
        primary
          ? "border-brand-line bg-brand-tint"
          : "border-line bg-surface hover:border-brand-line"
      }`}
    >
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-xl transition-colors ${
          primary
            ? "bg-brand text-white"
            : "bg-surface-2 text-ink-2 group-hover:bg-brand-tint group-hover:text-brand"
        }`}
      >
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[14px] font-medium text-ink">
          {title}
          <ArrowUpRight
            size={14}
            className="text-ink-3 opacity-0 transition-opacity group-hover:opacity-100"
          />
        </div>
        <div className="mt-0.5 text-[12px] leading-relaxed text-ink-2">
          {desc}
        </div>
      </div>
    </Link>
  );
}
