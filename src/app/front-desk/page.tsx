"use client";

// /front-desk — Receptionist's landing view. Reuses the same
// /operations/reception/dashboard endpoint /dashboard already calls (its
// name literally says "reception" — it was built for this persona), but
// orders quick actions around what a receptionist actually does first
// (register a walk-in, book an appointment, work the queue) rather than
// the generic multi-persona ordering on /dashboard.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  CalendarDays,
  CreditCard,
  ListOrdered,
  Loader2,
  UserPlus,
  Users,
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

export default function FrontDeskPage() {
  const { scope, organisation, activeFacility } = useSession();

  const canReadAppointments = hasPermission(scope, "appointment.read");
  const canReadQueue = hasPermission(scope, "queue.read");
  const canReadBilling = hasPermission(scope, "invoice.read");
  const canRegister = hasPermission(scope, "patient.register");
  const canBook = hasPermission(scope, "appointment.write");

  const [date, setDate] = useState(todayISO);
  const [dashboard, setDashboard] = useState<ReceptionDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      if (!canReadQueue && !canReadAppointments && !canReadBilling) {
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
              : "Couldn't load today's front desk numbers.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
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

  const kpis = dashboard?.kpis;
  const appointmentsByStatus = kpis?.appointments_by_status ?? {};
  const appointmentTotal = Object.values(appointmentsByStatus).reduce(
    (sum, n) => sum + n,
    0,
  );
  const waiting = kpis?.patients_waiting ?? null;

  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-6 px-6 py-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-wide text-brand">
            Front desk
          </p>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-ink">
            {activeFacility.facility_name}
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
        <div className="flex items-start gap-2 rounded-2xl border border-danger-line bg-danger-tint px-4 py-3 text-[12.5px] text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Quick actions — receptionist priority order: register, book, queue. */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {canRegister && (
          <ActionCard
            icon={UserPlus}
            title="Register patient"
            desc="Add a new patient to the master index"
            href="/patients/new"
            primary
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
        {canReadQueue && (
          <ActionCard
            icon={ListOrdered}
            title="Queue board"
            desc="Check patients in, see who's waiting"
            href="/queue"
          />
        )}
        <ActionCard
          icon={Users}
          title="Find a patient"
          desc="Search the index by name or CNIC"
          href="/patients"
        />
      </div>

      <section>
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-ink-3">
          Today&apos;s numbers
        </h2>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          {canReadAppointments && (
            <StatCard
              icon={CalendarDays}
              value={loading ? null : appointmentTotal}
              loading={loading}
              label="Appointments today"
              sub={statusLine(appointmentsByStatus)}
            />
          )}
          {canReadQueue && (
            <StatCard
              icon={ListOrdered}
              value={loading ? null : waiting ?? 0}
              loading={loading}
              label="Waiting in queue"
              sub="Checked in, awaiting doctor"
            />
          )}
          {canReadBilling && (
            <StatCard
              icon={CreditCard}
              value={loading ? null : formatMoney(kpis?.payments_collected_today)}
              loading={loading}
              label="Payments collected"
              sub={`${kpis?.payments_count_today ?? 0} payments today`}
            />
          )}
        </div>
      </section>

      {dashboard && dashboard.doctor_queues.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[14px] font-semibold text-ink">
                Doctor availability
              </h2>
              <p className="text-[11.5px] text-ink-3">
                Who&apos;s free right now — useful when booking a walk-in
              </p>
            </div>
            <Link
              href="/queue"
              className="text-[12px] font-medium text-brand hover:underline"
            >
              Queue board
            </Link>
          </div>
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
