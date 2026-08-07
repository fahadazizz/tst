"use client";

// AppShell.tsx
// The shared shell that wraps every module (CLAUDE.md): fixed-width left rail +
// a main column with a sticky top bar and the scrolling screen content. Screens
// render into `children`; the shell owns nav, facility context, and identity.
//
// Wrapped in AuthGuard so unauthenticated users are redirected to /login. The
// login route is excluded from the chrome (no rail/top bar) since there's no
// authenticated context to show yet.

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { PlatformAuthGuard } from "@/components/auth/PlatformAuthGuard";
import { useSession } from "@/context/session";
import { useAuth } from "@/context/auth";

// A user whose bootstrap resolved zero accessible Facilities (no active
// facility-role row, and no org-level role broad enough to list the org's
// Facilities either) per spec §7.9 — a real state, not a generic error loop.
function NoFacilityAccessScreen() {
  const { logout } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold text-ink">No Facility assignment</h1>
        <p className="mt-2 text-sm text-ink-2">
          Your account isn&apos;t currently assigned to any Facility in this
          Organisation. Contact your Organisation administrator to be
          assigned a role before you can continue.
        </p>
        <button
          type="button"
          onClick={() => void logout()}
          className="mt-6 rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-2"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function AuthenticatedGate({ children }: { children: ReactNode }) {
  const { ready, noFacilityAccess } = useSession();
  if (ready && noFacilityAccess) return <NoFacilityAccessScreen />;
  return <>{children}</>;
}

function ImpersonationBanner() {
  const router = useRouter();
  const { impersonation, endImpersonation } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!impersonation.isImpersonation) return null;

  async function handleEnd() {
    setBusy(true);
    try {
      await endImpersonation();
      router.replace("/platform");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-alert-line bg-alert-tint px-6 py-2.5 text-alert">
      <div className="flex min-w-0 items-center gap-2 text-[12.5px] font-medium">
        <ShieldAlert size={15} className="shrink-0" />
        <span className="truncate">
          Impersonation active
          {impersonation.impersonatedByPlatformUserId
            ? ` by ${impersonation.impersonatedByPlatformUserId}`
            : ""}
        </span>
      </div>
      <button
        type="button"
        onClick={() => void handleEnd()}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-alert-line bg-surface px-3 py-1.5 text-[12px] font-semibold text-alert disabled:opacity-60"
      >
        {busy && <Loader2 size={13} className="animate-spin" />}
        End impersonation
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Auth routes render on their own, outside the chrome (but still inside the
  // guard, which lets /login and the password-reset/account-setup callback
  // routes through). The public home splash at "/" gets the same bare
  // treatment — it redirects itself to /dashboard for already-authenticated
  // visitors, so it never needs the sidebar chrome either.
  if (
    pathname === "/" ||
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/auth/password-reset") ||
    pathname?.startsWith("/auth/account-setup")
  ) {
    return <AuthGuard>{children}</AuthGuard>;
  }

  // Platform Console has its own auth realm, token storage, refresh path,
  // route guard, and no Facility-scoped tenant shell.
  if (pathname?.startsWith("/platform")) {
    return <PlatformAuthGuard>{children}</PlatformAuthGuard>;
  }

  return (
    <AuthGuard>
      <AuthenticatedGate>
        <div className="flex min-h-screen bg-bg">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            <ImpersonationBanner />
            <main className="min-w-0 flex-1">{children}</main>
          </div>
        </div>
      </AuthenticatedGate>
    </AuthGuard>
  );
}
