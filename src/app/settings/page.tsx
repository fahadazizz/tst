"use client";

// settings/page.tsx
// Settings hub — was previously a dead link (Sidebar's "Settings" nav item
// pointed here with no page.tsx behind it at all). Links out to the real
// admin sub-screens (Organisation, Facilities) and the account-level
// Security settings screen built in P0-7.

import Link from "next/link";
import { Building2, MapPinned, ShieldCheck, Stethoscope, ChevronRight } from "lucide-react";
import { useSession } from "@/context/session";
import { hasPermission } from "@/lib/permissions";

const ITEMS = [
  {
    href: "/settings/organisation",
    icon: Building2,
    title: "Organisation",
    description: "Profile, contact details, and deactivation.",
    permission: "organisation.read" as const,
  },
  {
    href: "/settings/facilities",
    icon: MapPinned,
    title: "Facilities",
    description: "Facility list, setup, and configuration.",
    permission: "facility.read" as const,
  },
  {
    href: "/settings/specialties",
    icon: Stethoscope,
    title: "Specialties",
    description: "Clinical specialties shared across every Facility.",
    permission: "specialty.read" as const,
  },
  {
    href: "/settings/security",
    icon: ShieldCheck,
    title: "Security",
    description: "Password, two-factor authentication, and sessions.",
    permission: null,
  },
];

export default function SettingsPage() {
  const { scope } = useSession();

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-[20px] font-semibold tracking-tight text-ink">Settings</h1>
      <p className="mt-1 text-[13px] text-ink-2">
        Manage your Organisation, Facilities, and account security.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {ITEMS.filter(
          (item) => item.permission === null || hasPermission(scope, item.permission),
        ).map(({ href, icon: Icon, title, description }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-3.5 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-brand-line hover:bg-brand-tint"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand group-hover:bg-white/70">
              <Icon size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold text-ink">{title}</span>
              <span className="block text-[12.5px] text-ink-2">{description}</span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-ink-3" />
          </Link>
        ))}
      </div>
    </div>
  );
}
