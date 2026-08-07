// Sidebar.tsx
// Left rail of the app shell: brand mark, facility label (RULE 3), the
// role-driven nav, and the signed-in user chip pinned to the bottom.

import { FacilitySwitcher } from "./FacilitySwitcher";
import { SidebarNav } from "./SidebarNav";

export function Sidebar() {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-surface px-3 py-4">
      <div className="flex items-center gap-2.5 px-2 pb-3.5 pt-1.5">
        <span className="grid size-[26px] place-items-center rounded-[7px] bg-brand text-[13px] font-semibold text-white">
          N
        </span>
        <b className="text-[15px] font-semibold tracking-tight text-ink">
          NexAura HMS
        </b>
      </div>

      <FacilitySwitcher />
      <SidebarNav />
    </aside>
  );
}