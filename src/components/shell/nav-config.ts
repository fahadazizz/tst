// nav-config.ts
// The role-driven side navigation, mapped to the four MVP modules (CLAUDE.md).
//
// Each item declares the permission that unlocks it. RULE 3 is explicit here:
// visibility is filtered by permission for CONVENIENCE, but this is not the
// security boundary — the destination screens must still gate their actions
// with RoleGate/hasPermission. "A hidden menu item alone is not sufficient."
//
// `permission: null` = always visible (e.g. Dashboard).

import type { PermissionCode } from "@/types/schema";
import {
  ArrowLeftRight,
  Bell,
  Brain,
  Building2,
  CalendarDays,
  CheckSquare,
  FileSearch,
  FlaskConical,
  LayoutDashboard,
  ListOrdered,
  Receipt,
  Settings,
  ShieldCheck,
  Stethoscope,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission: PermissionCode | null;
  /**
   * How RoleGate renders when the active role lacks `permission`:
   * - "hide" (default) — removed from the DOM entirely.
   * - "disable" — kept visible but locked, so the gate is self-evident.
   */
  gate?: "hide" | "disable";
  /** Out-of-scope stub (Billing) — rendered disabled, never links anywhere real. */
  stub?: boolean;
  note?: string;
}

export interface NavGroup {
  /** Section heading; null for the top, ungrouped items. */
  heading: string | null;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    heading: null,
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        permission: null,
      },
      {
        label: "Patients",
        href: "/patients",
        icon: Users,
        permission: "patient.read",
      },
      {
        label: "Front desk",
        href: "/front-desk",
        icon: UserPlus,
        // Same trigger permission used to route Receptionists here by
        // default after login (lib/personaLanding.ts) — this permission
        // alone is enough for nav visibility even though the resolver
        // itself also requires appointment.write for a unique match.
        permission: "patient.register",
      },
      {
        label: "Consultations",
        href: "/consultations",
        icon: Stethoscope,
        permission: "consultation.read",
      },
    ],
  },
  {
    heading: "Operations",
    items: [
      {
        label: "Appointments",
        href: "/appointments",
        icon: CalendarDays,
        // Read-level: doctors and receptionists both view the calendar.
        permission: "appointment.read",
      },
      {
        label: "Queue",
        href: "/queue",
        icon: ListOrdered,
        permission: "queue.read",
      },
      {
        label: "Referrals",
        href: "/referrals",
        icon: ArrowLeftRight,
        permission: "referral.read",
      },
      {
        label: "Laboratory",
        href: "/laboratory",
        icon: FlaskConical,
        permission: "lab.read",
      },
      {
        label: "Tasks",
        href: "/tasks",
        icon: CheckSquare,
        permission: "task.read",
      },
    ],
  },
  {
    // Phase 1 of the module plan — rbac_auth, staff_profiles, tenant_hierarchy.
    heading: "Foundation",
    items: [
      {
        label: "Staff & roles",
        href: "/staff",
        icon: ShieldCheck,
        // Privileged (staff_profiles + rbac_auth). Held by doctor/admin, not the
        // front-desk receptionist — so switching to receptionist locks it via
        // RoleGate. Kept visible-but-disabled so the gate is self-evident.
        permission: "staff.manage",
        gate: "disable",
      },
      {
        label: "Settings",
        href: "/settings",
        icon: Settings,
        // Privileged (tenant_hierarchy — organisation/facility configuration).
        permission: "settings.manage",
        gate: "disable",
      },
    ],
  },
  {
    heading: "Billing",
    items: [
      {
        label: "Billing",
        href: "/billing",
        icon: Receipt,
        permission: "invoice.read",
      },
    ],
  },
  {
    heading: "Management",
    items: [
      {
        label: "Facility operations",
        href: "/facility-ops",
        icon: Building2,
        // Same trigger permission used to route Facility Managers here by
        // default after login (lib/personaLanding.ts) — verified unique to
        // that role template.
        permission: "facility.update",
      },
      {
        label: "Intelligence",
        href: "/intelligence",
        icon: Brain,
        permission: "intelligence.read",
      },
      {
        label: "Notifications",
        href: "/notifications",
        icon: Bell,
        permission: "notification.read",
      },
      {
        label: "Compliance",
        href: "/compliance",
        icon: FileSearch,
        permission: "audit.read",
      },
    ],
  },
];
