"use client";

// UserChip.tsx
// The signed-in user in the top bar, with a lightweight menu. Sourced from real
// auth: name/email from the authenticated user. The org/facility read endpoints
// are admin-gated (non-admins get 403 → graceful placeholders), so we show what
// we have and avoid empty fragments. Sign out performs a real logout.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, LogOut, Loader2, ShieldCheck } from "lucide-react";
import { useSession } from "@/context/session";
import { useAuth } from "@/context/auth";

function initials(name: string): string {
  const cleaned = name.replace(/^(Dr|Mr|Ms|Mrs)\.?\s+/i, "").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "U";
}

export function UserChip() {
  const { user, activeFacility, organisation } = useSession();
  const { logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Secondary line under the name. Prefer a real facility name; fall back to the
  // org. Avoids showing empty text when the (admin-gated) facility read 403s.
  const facilityName =
    activeFacility.facility_name && activeFacility.facility_name !== "Facility"
      ? activeFacility.facility_name
      : null;
  const subLabel = facilityName ?? organisation.display_name ?? "";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      router.push("/login");
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex min-w-0 items-center gap-2.5 rounded-full py-1 pl-1 pr-2.5 transition-colors hover:bg-surface-2"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-tint text-[12px] font-semibold text-brand">
          {initials(user.full_name)}
        </span>
        <span className="hidden min-w-0 max-w-[9rem] text-left sm:block lg:max-w-[12rem]">
          <span className="block truncate text-[12.5px] font-semibold leading-tight text-ink">
            {user.full_name || "User"}
          </span>
          {subLabel && (
            <span className="block truncate text-[11px] leading-tight text-ink-3">
              {subLabel}
            </span>
          )}
        </span>
        <ChevronDown size={15} className="shrink-0 text-ink-3" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg shadow-slate-900/5"
        >
          <div className="border-b border-line px-3 py-2.5">
            <div className="text-[13px] font-semibold text-ink">
              {user.full_name || "User"}
            </div>
            <div className="truncate text-[11.5px] text-ink-3">{user.email}</div>
            {subLabel && (
              <div className="mt-1 text-[11px] text-ink-3">{subLabel}</div>
            )}
          </div>
          <Link
            href="/settings/security"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] font-medium text-ink-2 hover:bg-surface-2"
          >
            <ShieldCheck size={15} className="shrink-0" />
            Security settings
          </Link>
          <div className="my-1 border-t border-line" />
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] font-medium text-alert hover:bg-surface-2 disabled:opacity-60"
          >
            {signingOut ? (
              <Loader2 size={15} className="shrink-0 animate-spin" />
            ) : (
              <LogOut size={15} className="shrink-0" />
            )}
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}