"use client";

// SidebarNav.tsx
// Role-driven navigation. Each permissioned item is wrapped in the shared
// <RoleGate> primitive (RULE 3) — the SAME check that guards actions on the
// screens — so a hidden item and a blocked action can never drift apart.
//
// Two gate modes (see NavItem.gate):
//  - "hide"    → RoleGate renders its null fallback; the item leaves the DOM.
//  - "disable" → RoleGate's fallback is a locked item; it stays visible but
//                inert. Foundation uses this so the gate closing is self-evident
//                when you switch from doctor to receptionist.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { useSession } from "@/context/session";
import { hasPermission } from "@/lib/permissions";
import { RoleGate } from "@/components/design-system/RoleGate";
import { NAV_GROUPS, type NavItem } from "./nav-config";

export function SidebarNav() {
  const { scope } = useSession();
  const pathname = usePathname();

  // Whether an item occupies space at all (used to decide if a section heading
  // has anything to head). A "disable"-gated item always renders — locked when
  // the role lacks its permission — so it counts even when denied.
  const willRender = (item: NavItem) =>
    item.stub ||
    item.permission === null ||
    item.gate === "disable" ||
    hasPermission(scope, item.permission);

  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_GROUPS.map((group) => {
        if (!group.items.some(willRender)) return null;

        return (
          <div key={group.heading ?? "top"} className="flex flex-col gap-0.5">
            {group.heading && (
              <div className="px-2.5 pb-1 pt-3.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">
                {group.heading}
              </div>
            )}
            {group.items.map((item) => {
              // Always-on and out-of-scope stub items render ungated.
              if (item.stub || item.permission === null) {
                return (
                  <NavLink key={item.label} item={item} pathname={pathname} />
                );
              }

              // Permissioned items go through the real RBAC gate. When denied,
              // "disable" shows a locked item; "hide" (default) removes it.
              return (
                <RoleGate
                  key={item.label}
                  scope={scope}
                  permission={item.permission}
                  fallback={
                    item.gate === "disable" ? (
                      <NavLink item={item} pathname={pathname} locked />
                    ) : null
                  }
                >
                  <NavLink item={item} pathname={pathname} />
                </RoleGate>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

function NavLink({
  item,
  pathname,
  locked = false,
}: {
  item: NavItem;
  pathname: string;
  locked?: boolean;
}) {
  const Icon = item.icon;

  // Locked by RoleGate (role lacks permission) — visible but inert.
  if (locked) {
    return (
      <span
        aria-disabled="true"
        title={`Requires the “${item.permission}” permission`}
        className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-ink-3"
      >
        <Icon size={17} className="shrink-0 opacity-50" />
        <span>{item.label}</span>
        <Lock size={12} className="ml-auto shrink-0 opacity-70" />
      </span>
    );
  }

  // Out-of-scope stub (Billing).
  if (item.stub) {
    return (
      <span
        title="Billing is out of MVP scope"
        className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-ink-3"
      >
        <Icon size={17} className="shrink-0 opacity-70" />
        <span>{item.label}</span>
        {item.note && (
          <span className="ml-auto text-[10.5px] font-normal text-ink-3">
            {item.note}
          </span>
        )}
      </span>
    );
  }

  const active =
    pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
        active ? "bg-brand-tint text-brand" : "text-ink-2 hover:bg-surface-2"
      }`}
    >
      <Icon size={17} className="shrink-0 opacity-90" />
      <span>{item.label}</span>
    </Link>
  );
}
