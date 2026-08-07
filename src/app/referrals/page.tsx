"use client";

// /referrals — cross-facility referrals (Module 4). The list is visible to
// anyone with referral.read; creating/accepting/declining is gated inside
// ReferralsBoard on referral.write (RULE 3).

import { ShieldAlert } from "lucide-react";
import { RoleGate } from "@/components/design-system/RoleGate";
import { useSession } from "@/context/session";
import { ReferralsBoard } from "@/components/operations/ReferralsBoard";

export default function ReferralsPage() {
  const { scope } = useSession();

  return (
    <div className="mx-auto max-w-[1320px] px-6 py-5">
      <RoleGate
        scope={scope}
        permission="referral.read"
        fallback={
          <div className="flex items-start gap-3 rounded-xl border border-alert-line bg-alert-tint px-4 py-4">
            <ShieldAlert size={18} className="mt-0.5 shrink-0 text-alert" />
            <div>
              <div className="text-[13px] font-semibold text-alert">
                You don’t have permission to view referrals
              </div>
              <div className="mt-0.5 text-[12.5px] text-[#7a2135]">
                This list requires the <code>referral.read</code> permission,
                which none of your assigned roles currently grant.
              </div>
            </div>
          </div>
        }
      >
        <ReferralsBoard />
      </RoleGate>
    </div>
  );
}
