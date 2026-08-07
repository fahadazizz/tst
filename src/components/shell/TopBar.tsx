"use client";

// TopBar.tsx
// Top of the app shell: active organisation context, patient search (on
// patient/clinical screens only), a help popover, and the signed-in user
// chip. Sticky so it stays available while a screen's content scrolls
// beneath it.

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { HelpCircle, Keyboard, LifeBuoy, Info } from "lucide-react";
import { useSession } from "@/context/session";
import { SearchBar } from "./SearchBar";
import { UserChip } from "./UserChip";

// Patient search only makes sense on patient/clinical screens — showing it
// on Staff & roles, Settings, Intelligence, Notifications, or Compliance
// implies a patient context those screens don't have.
const PATIENT_CONTEXT_ROUTES = [
  "/dashboard",
  "/patients",
  "/consultations",
  "/appointments",
  "/queue",
  "/referrals",
  "/laboratory",
  "/tasks",
  "/billing",
];

function isPatientContextRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return PATIENT_CONTEXT_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function TopBar() {
  const { organisation, activeFacility } = useSession();
  const pathname = usePathname();
  const showPatientSearch = isPatientContextRoute(pathname);

  return (
    <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-line bg-surface px-6 py-2.5">
      <div className="hidden min-w-0 shrink-0 md:block">
        <div className="truncate text-[13px] font-semibold text-ink">
          {organisation.display_name}
        </div>
        <div className="truncate font-mono text-[11px] text-ink-3">
          {activeFacility.facility_code}
        </div>
      </div>

      {showPatientSearch && <SearchBar />}

      <div className="ml-auto flex min-w-0 items-center gap-2">
        <HelpButton />
        <div className="mx-0.5 h-6 w-px shrink-0 bg-line" />
        <UserChip />
      </div>
    </header>
  );
}

function HelpButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Help"
        title="Help"
        onClick={() => setOpen((v) => !v)}
        className="grid size-[34px] place-items-center rounded-lg border border-line text-ink-3 transition-colors hover:border-line-2 hover:text-ink-2"
      >
        <HelpCircle size={17} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-72 overflow-hidden rounded-xl border border-line bg-surface shadow-lg shadow-slate-900/5">
          <div className="border-b border-line px-4 py-3">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              <LifeBuoy size={15} className="text-brand" /> Help & shortcuts
            </div>
          </div>
          <div className="px-4 py-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              <Keyboard size={13} /> Keyboard
            </div>
            <div className="flex items-center justify-between py-1 text-[12.5px] text-ink-2">
              <span>Search patients</span>
              <kbd className="rounded border border-line-2 bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-3">
                ⌘K
              </kbd>
            </div>
            <div className="flex items-center justify-between py-1 text-[12.5px] text-ink-2">
              <span>Close dialogs</span>
              <kbd className="rounded border border-line-2 bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-3">
                Esc
              </kbd>
            </div>
          </div>
          <div className="border-t border-line px-4 py-3">
            <div className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-3">
              <Info size={13} className="mt-0.5 shrink-0" />
              NexAura HMS · Contact your facility administrator for account or
              access questions.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
