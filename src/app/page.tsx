"use client";

// page.tsx — public one-page home.
// A real landing page, not a login-card redirect: hero, module showcase,
// role coverage, trust/security band, then the sign-in CTAs. Everything on
// this page is copy describing capabilities that actually exist in the
// product (spec-grounded, nothing invented) — this is marketing framing of
// real modules, not vaporware.
//
// Already-authenticated tenant users are bounced straight to /dashboard —
// this page is only ever meant to be seen once, before signing in.
//
// There is one real tenant login flow underneath both staff-facing CTAs
// (email -> resolve organisation -> password -> optional MFA); "Organisation
// Owner" vs "Staff" is copy/icon framing only, not a different destination —
// the backend has no persona-specific login path, persona is decided by
// permissions after sign-in. The Platform Console link in the footer stays
// deliberately low-emphasis: it's an internal operations tool, not something
// to advertise with equal visual weight to the tenant login CTAs.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  Activity,
  Building2,
  CalendarClock,
  FlaskConical,
  Lock,
  LineChart,
  Receipt,
  ShieldCheck,
  Stethoscope,
  TrendingUp,
  Users,
} from "lucide-react";
import { useAuth } from "@/context/auth";
import { useSession } from "@/context/session";
import { resolvePersonaLanding } from "@/lib/personaLanding";

const MODULES = [
  {
    icon: CalendarClock,
    title: "Reception & Scheduling",
    description:
      "Patient search and registration with duplicate-identity checks, doctor availability, appointment booking, walk-in queueing, and check-in — all in one flow.",
  },
  {
    icon: Activity,
    title: "AI Clinical Documentation",
    description:
      "Voice or manual transcripts become editable SOAP drafts. Nothing reaches a patient record until a clinician reviews and approves it — AI is additive, never load-bearing.",
  },
  {
    icon: FlaskConical,
    title: "Prescriptions & Laboratory",
    description:
      "Full prescription lifecycle with deterministic allergy and interaction checks, plus lab order routing, result entry, and clinician review.",
  },
  {
    icon: Receipt,
    title: "Billing & Finance",
    description:
      "Invoices, payments, refunds, and discounts with a locked ledger, receipt lookup, daily reconciliation, and payment-method reporting.",
  },
  {
    icon: LineChart,
    title: "Operations Intelligence",
    description:
      "Real-time KPIs — patient volume, revenue trends, doctor performance, outstanding invoices by age — with natural-language ask on top of deterministic data.",
  },
  {
    icon: Lock,
    title: "Role-Based Security",
    description:
      "Every action is gated by resolved permissions, not job titles. Facility-scoped data isolation and a full audit trail on every sensitive record.",
  },
];

const ROLES = [
  { icon: Building2, label: "Organisation Owner" },
  { icon: Users, label: "Facility Manager" },
  { icon: CalendarClock, label: "Receptionist" },
  { icon: Stethoscope, label: "Doctor" },
  { icon: FlaskConical, label: "Laboratory Staff" },
  { icon: Receipt, label: "Finance / Cashier" },
];

const TRUST_POINTS = [
  "Row-level tenant isolation on every record",
  "MFA-protected accounts, tenant and platform",
  "Immutable audit trail — logins, role changes, cross-Facility access",
  "Clinical audio and documents encrypted at rest",
];

// Illustrative preview tiles for the hero graphic — a stylized snapshot of
// the real dashboard's KPI cards, not a live screenshot. Deliberately spans
// the app's full accent palette (brand / approved / draft / alert) so the
// hero reads as colorful rather than monochrome teal-on-white.
const PREVIEW_TILES = [
  { icon: Users, label: "Patients today", value: "128", tone: "brand" as const },
  { icon: TrendingUp, label: "Revenue this week", value: "$18.4k", tone: "approved" as const },
  { icon: CalendarClock, label: "Avg. wait time", value: "9 min", tone: "draft" as const },
  { icon: FlaskConical, label: "Pending lab orders", value: "6", tone: "alert" as const },
];

const TONE_CLASSES: Record<string, string> = {
  brand: "bg-brand-tint text-brand",
  approved: "bg-approved-tint text-approved",
  draft: "bg-draft-tint text-draft",
  alert: "bg-alert-tint text-alert",
};

export default function Home() {
  const { isReady, isAuthenticated } = useAuth();
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    // Waits for session.ready, not just isReady/isAuthenticated —
    // scope.permissions is resolved by a separate async bootstrap
    // (SessionProvider) that only starts once authenticated, so redirecting
    // before it settles would always fall through to the /dashboard
    // fallback instead of the real persona destination.
    if (isReady && isAuthenticated && session.ready) {
      router.replace(resolvePersonaLanding(session.scope.permissions));
    }
  }, [isReady, isAuthenticated, session.ready, session.scope.permissions, router]);

  if (isReady && isAuthenticated) return null;

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      {/* NAV */}
      <header className="border-b border-line bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-brand text-white">
              <Activity size={17} />
            </span>
            <span className="text-[15px] font-semibold text-ink">NexAura HMS</span>
          </div>
          <Link
            href="/login"
            className="rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-line bg-surface">
        {/* Colorful decorative wash — three soft blurred blobs spanning the
            accent palette, purely visual, sit behind everything else. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-24 -top-32 size-[420px] rounded-full bg-brand/25 blur-3xl" />
          <div className="absolute -right-16 top-10 size-[360px] rounded-full bg-approved/20 blur-3xl" />
          <div className="absolute bottom-[-160px] left-1/3 size-[320px] rounded-full bg-draft/20 blur-3xl" />
        </div>

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
          {/* Left — copy + CTAs */}
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-line bg-brand-tint px-3 py-1 text-[12px] font-medium text-brand">
              <ShieldCheck size={13} />
              Built for hospitals and clinics
            </span>
            <h1 className="mt-5 text-3xl font-semibold leading-tight text-ink sm:text-4xl lg:text-[2.6rem]">
              One workspace for the entire patient journey
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-2">
              From the front desk to the consultation room to the billing
              counter — NexAura HMS runs scheduling, AI-assisted clinical
              documentation, laboratory workflows, and finance in one
              permission-driven system.
            </p>

            <div className="mt-9 grid max-w-xl gap-4 sm:grid-cols-2">
              <Link
                href="/login"
                className="group flex flex-col items-start gap-3 rounded-xl border border-line bg-surface p-5 text-left shadow-sm transition-all hover:border-brand-line hover:bg-brand-tint"
              >
                <span className="grid size-10 place-items-center rounded-lg bg-brand-tint text-brand">
                  <Building2 size={20} />
                </span>
                <span>
                  <span className="block text-[14.5px] font-semibold text-ink">
                    Organisation Owner / Admin
                  </span>
                  <span className="mt-1 block text-[12.5px] text-ink-2">
                    Set up and manage your hospital or clinic — Facilities,
                    staff, roles, schedules, and billing.
                  </span>
                </span>
              </Link>

              <Link
                href="/login"
                className="group flex flex-col items-start gap-3 rounded-xl border border-line bg-surface p-5 text-left shadow-sm transition-all hover:border-brand-line hover:bg-brand-tint"
              >
                <span className="grid size-10 place-items-center rounded-lg bg-brand-tint text-brand">
                  <Stethoscope size={20} />
                </span>
                <span>
                  <span className="block text-[14.5px] font-semibold text-ink">
                    Staff Login
                  </span>
                  <span className="mt-1 block text-[12.5px] text-ink-2">
                    Doctors, receptionists, lab staff, and other daily-use
                    accounts.
                  </span>
                </span>
              </Link>
            </div>
          </div>

          {/* Right — illustrative dashboard-preview graphic (stylized, not a
              live screenshot) so the hero has a real visual, not just text. */}
          <div className="relative hidden lg:block">
            <div className="absolute -inset-6 rounded-[28px] bg-gradient-to-br from-brand-tint via-approved-tint to-draft-tint opacity-70 blur-2xl" />
            <div className="relative rounded-2xl border border-line bg-surface p-5 shadow-lg">
              <div className="flex items-center gap-2 border-b border-line pb-3">
                <span className="size-2.5 rounded-full bg-alert" />
                <span className="size-2.5 rounded-full bg-draft" />
                <span className="size-2.5 rounded-full bg-approved" />
                <span className="ml-2 text-[12px] font-medium text-ink-3">
                  Facility overview
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {PREVIEW_TILES.map(({ icon: Icon, label, value, tone }) => (
                  <div
                    key={label}
                    className="rounded-xl border border-line bg-surface-2 p-4"
                  >
                    <span
                      className={`grid size-8 place-items-center rounded-lg ${TONE_CLASSES[tone]}`}
                    >
                      <Icon size={16} />
                    </span>
                    <div className="mt-3 text-lg font-semibold text-ink">
                      {value}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-ink-2">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MODULES */}
      <section className="border-b border-line bg-bg py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-xl font-semibold text-ink sm:text-2xl">
              Everything a Facility needs, in one system
            </h2>
            <p className="mt-2.5 text-[13.5px] text-ink-2">
              Six modules, one permission model — nothing bolted on
              separately.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="rounded-xl border border-line bg-surface p-5"
              >
                <span className="grid size-10 place-items-center rounded-lg bg-brand-tint text-brand">
                  <Icon size={19} />
                </span>
                <h3 className="mt-4 text-[14px] font-semibold text-ink">
                  {title}
                </h3>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ROLES */}
      <section className="border-b border-line bg-surface py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-xl font-semibold text-ink sm:text-2xl">
              Built for every role in the building
            </h2>
            <p className="mt-2.5 text-[13.5px] text-ink-2">
              Each account only sees the actions its permissions allow —
              never more.
            </p>
          </div>

          <div className="mt-9 flex flex-wrap justify-center gap-3">
            {ROLES.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-full border border-line bg-bg px-4 py-2 text-[13px] font-medium text-ink-2"
              >
                <Icon size={15} className="text-brand" />
                {label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TRUST BAND */}
      <section className="border-b border-line bg-brand py-14 text-white">
        <div className="mx-auto max-w-5xl px-6">
          <div className="grid gap-5 sm:grid-cols-2">
            {TRUST_POINTS.map((point) => (
              <div key={point} className="flex items-center gap-3">
                <ShieldCheck size={18} className="shrink-0 text-white/80" />
                <span className="text-[13.5px] text-white/95">{point}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="bg-bg py-16">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="text-xl font-semibold text-ink sm:text-2xl">
            Ready to sign in?
          </h2>
          <p className="mt-2.5 text-[13.5px] text-ink-2">
            Use the same login for every staff account — your role decides
            what you see next.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand px-6 py-3 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Sign in to NexAura HMS
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-line px-6 py-6 text-center">
        <p className="text-[12px] text-ink-3">
          &copy; {new Date().getFullYear()} NexAura HMS
        </p>
        <Link
          href="/platform/login"
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[11.5px] font-medium text-ink-3 transition-colors hover:border-line-2 hover:bg-surface-2 hover:text-ink-2"
        >
          <Lock size={11} />
          Platform login
        </Link>
      </footer>
    </div>
  );
}
