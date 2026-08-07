// RoleGate.tsx
// RULE 3 — gate actions on the actual permission, resolved for the user's
// ACTIVE facility. Hiding a menu item is not security; this wraps the real
// control. When `denied` fires, optionally log an access.denied event.

import type { ReactNode } from "react";
import { hasPermission, type SessionScope } from "@/lib/permissions";
import type { PermissionCode } from "@/types/schema";
import { logAccess } from "@/lib/access-log";

export function RoleGate({
  scope,
  permission,
  children,
  fallback = null,
  logDenied = false,
}: {
  scope: SessionScope;
  permission: PermissionCode;
  children: ReactNode;
  fallback?: ReactNode;
  logDenied?: boolean;
}) {
  const allowed = hasPermission(scope, permission);

  if (!allowed) {
    if (logDenied) {
      logAccess("access.denied", {
        user_id: scope.user_id,
        organisation_id: scope.organisation_id,
        facility_id: scope.active_facility_id,
        permission,
      });
    }
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
