"use client";

// session.tsx
// App-wide session context, sourced from the REAL authenticated session:
//   - user         → signed-in user from AuthContext (/users/me)
//   - permissions  → live effective set (/permissions/me), backend-resolved
//                    for the active facility (X-Facility-ID) — so the active
//                    facility must be resolved BEFORE this is fetched, not in
//                    parallel with it.
//   - organisation → best-effort from /tenant-hierarchy/organisation; this is
//     & facility     admin-gated (tenant:*:read) so non-admin roles get 403.
//                    We degrade gracefully to minimal context instead of
//                    crashing the shell.
//   - facilities   → real list from /auth/facility-roles?user_id=self (that
//                    param requires no special permission for one's own
//                    assignments — RULE 3 doesn't gate looking up your own
//                    role list), cross-referenced with /tenant-hierarchy
//                    /facilities/{id} for display names where permitted.
//
// RULE 3 — organisation is a hard boundary; facility scope is soft.
//
// The public shape of useSession() is unchanged from the mock, so every screen
// reading user / organisation / activeFacility / scope keeps working.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Facility, Organisation, User, UUID } from "@/types/schema";
import type { SessionScope } from "@/lib/permissions";
import { useAuth } from "@/context/auth";
import { apiGet, getActiveFacilityId, setActiveFacilityId } from "@/lib/api";
import { setActiveTimeZone } from "@/lib/format";
import { clearAllCached } from "@/lib/queryCache";
import { teardownAllRealtime } from "@/lib/realtime";
import type { components } from "@/types/api";

type MyPermissions = components["schemas"]["MyPermissionsResponse"];
type OrganisationResponse = components["schemas"]["OrganisationResponse"];
type FacilityResponse = components["schemas"]["FacilityResponse"];
type UserFacilityRoleResponse = components["schemas"]["UserFacilityRoleResponse"];
type UserOrganisationRoleResponse =
  components["schemas"]["UserOrganisationRoleResponse"];

interface SessionValue {
  ready: boolean;
  user: User;
  organisation: Organisation;
  activeFacility: Facility;
  availableFacilities: Facility[];
  scope: SessionScope;
  /** True once bootstrap has run and the user has zero accessible
   *  Facilities — no active facility-role row, and no active
   *  organisation-role broad enough to list the org's Facilities either.
   *  Consumers must show a real "No Facility assignment" state, not treat
   *  `activeFacility` as usable. */
  noFacilityAccess: boolean;
  switchFacility: (facilityId: UUID) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

function placeholderOrg(orgId: UUID): Organisation {
  const label = orgId ? `Organisation ${orgId.slice(0, 8)}` : "Organisation";
  return {
    organisation_id: orgId,
    group_id: null,
    legal_name: label,
    display_name: label,
    tax_identifier: null,
    country_code: "PK",
    default_currency: "PKR",
    default_locale: "en",
    timezone: "Asia/Karachi",
    status: "active",
  };
}

// MVP: the org/facility read endpoints are admin-gated, so non-admin roles
// (receptionist, doctor) get a 403 and this fallback is what renders. We use the
// active facility id plus a conservative label so the shell does not fabricate
// a full Facility record. Replace with live data once a per-user facility read
// is available to all roles.
function placeholderFacility(facilityId: UUID, orgId: UUID): Facility {
  return {
    facility_id: facilityId,
    organisation_id: orgId,
    facility_name: `Facility ${facilityId.slice(0, 8)}`,
    facility_code: "UNRESOLVED",
    facility_type: "clinic",
    city: "Lahore",
    province: "Punjab",
    country_code: "PK",
    timezone: null,
    is_active: true,
  };
}

// Used when building the multi-facility list: unlike the single-active-
// facility placeholder above, reusing the same fallback name for every entry in
// a real multi-facility list would be misleading — so this is an honest,
// per-id fallback instead of a fabricated identity.
function unresolvedFacility(facilityId: UUID, orgId: UUID): Facility {
  return {
    facility_id: facilityId,
    organisation_id: orgId,
    facility_name: `Facility ${facilityId.slice(0, 8)}`,
    facility_code: "—",
    facility_type: "clinic",
    city: "",
    province: "",
    country_code: "PK",
    timezone: null,
    is_active: true,
  };
}

async function fetchFacility(facilityId: string, orgId: string): Promise<Facility> {
  try {
    const fac = await apiGet<FacilityResponse>(
      `/foundation/tenant-hierarchy/facilities/${facilityId}`,
    );
    return {
      facility_id: fac.facility_id,
      organisation_id: fac.organisation_id,
      facility_name: fac.facility_name ?? "Facility",
      facility_code: "—",
      facility_type: (fac.facility_type as Facility["facility_type"]) ?? "clinic",
      city: fac.city ?? "",
      province: "",
      country_code: "PK",
      // Real, always-present field on FacilityResponse — was previously
      // hardcoded to null here, silently breaking every timezone-aware
      // date/time display and appointment-time calculation for this facility.
      timezone: fac.timezone,
      is_active: fac.is_active ?? true,
    };
  } catch {
    return unresolvedFacility(facilityId, orgId);
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { currentUser, isAuthenticated } = useAuth();

  const [permissions, setPermissions] = useState<string[]>([]);
  const [organisation, setOrganisation] = useState<Organisation | null>(null);
  const [activeFacility, setActiveFacility] = useState<Facility | null>(null);
  const [availableFacilities, setAvailableFacilities] = useState<Facility[]>([]);
  const [activeFacilityId, setActiveFacilityIdState] = useState<string>(
    () => getActiveFacilityId() ?? "",
  );
  const [ready, setReady] = useState(false);
  const [noFacilityAccess, setNoFacilityAccess] = useState(false);

  const orgId = currentUser?.organisation_id ?? "";

  // Permissions are resolved server-side for whatever X-Facility-ID is on
  // the request, so the active facility must be settled BEFORE fetching
  // permissions, not in parallel with it — that's why this is one
  // sequential pass rather than a Promise.all.
  useEffect(() => {
    if (!isAuthenticated || !currentUser) return;
    let cancelled = false;

    (async () => {
      // 1. Resolve the real set of facilities this user has an active role
      // at (requires no special permission for one's own user_id), and in
      // parallel whether they hold any active Organisation-level role at
      // all — an org-wide role can grant Facility access with zero
      // facility-role rows, so a Facility-role-only check would wrongly
      // treat that user as having no accessible Facility.
      const [facilityRolesResult, orgRolesResult] = await Promise.allSettled([
        apiGet<UserFacilityRoleResponse[]>("/foundation/auth/facility-roles", {
          params: { user_id: currentUser.user_id },
        }),
        apiGet<UserOrganisationRoleResponse[]>(
          "/foundation/auth/organisation-roles",
          { params: { user_id: currentUser.user_id } },
        ),
      ]);

      let roleFacilityIds: string[] = [];
      if (facilityRolesResult.status === "fulfilled") {
        roleFacilityIds = [
          ...new Set(
            facilityRolesResult.value
              .filter((r) => r.is_active)
              .map((r) => r.facility_id),
          ),
        ];
      }
      // Leave empty on failure — falls through to whatever's already
      // stored, if anything, so an unrelated transient failure here
      // doesn't strand the user with zero facility context.

      const hasActiveOrgRole =
        orgRolesResult.status === "fulfilled" &&
        orgRolesResult.value.some((r) => r.is_active);

      const stored = getActiveFacilityId();
      const resolvedId =
        stored && roleFacilityIds.includes(stored)
          ? stored
          : (roleFacilityIds[0] ?? stored ?? "");
      if (resolvedId && resolvedId !== stored) {
        setActiveFacilityId(resolvedId);
      }
      if (cancelled) return;
      setActiveFacilityIdState(resolvedId);

      // 2. Permissions — now that X-Facility-ID is correctly set for this call.
      try {
        const perms = await apiGet<MyPermissions>("/foundation/auth/permissions/me");
        if (!cancelled) setPermissions(perms.permissions ?? []);
      } catch {
        if (!cancelled) setPermissions([]);
      }

      // 3. Organisation (admin-gated; degrade to placeholder on 403).
      try {
        const org = await apiGet<OrganisationResponse>(
          "/foundation/tenant-hierarchy/organisation",
        );
        if (!cancelled) {
          setOrganisation({
            organisation_id: org.organisation_id,
            group_id: org.group_id ?? null,
            legal_name: org.organisation_name ?? "Organisation",
            display_name: org.organisation_name ?? "Organisation",
            tax_identifier: null,
            country_code: "PK",
            default_currency: "PKR",
            default_locale: "en",
            timezone: "Asia/Karachi",
            status: "active",
          });
        }
      } catch {
        if (!cancelled) setOrganisation(placeholderOrg(currentUser.organisation_id));
      }

      // 4. The real facility list (name/city per id, honest fallback on 403)
      // and the active facility from within that same list.
      if (roleFacilityIds.length > 0) {
        const facilities = await Promise.all(
          roleFacilityIds.map((id) => fetchFacility(id, currentUser.organisation_id)),
        );
        if (!cancelled) {
          setAvailableFacilities(facilities);
          setActiveFacility(
            facilities.find((f) => f.facility_id === resolvedId) ?? facilities[0],
          );
          setNoFacilityAccess(false);
        }
      } else if (resolvedId) {
        // No role list available (fetch failed) but a facility id is
        // already stored from a prior session — still resolve it directly.
        const fac = await fetchFacility(resolvedId, currentUser.organisation_id);
        if (!cancelled) {
          setAvailableFacilities([fac]);
          setActiveFacility(fac);
          setNoFacilityAccess(false);
        }
      } else if (hasActiveOrgRole) {
        // Zero facility-role rows, but an active org-level role — that role
        // may grant org-wide Facility access (e.g. a tenant admin). Try the
        // admin-gated org Facility list before concluding there's truly no
        // accessible Facility; a 403 here means the org role doesn't carry
        // that grant, and we fall through to the real "no access" state.
        try {
          const orgFacilities = await apiGet<FacilityResponse[]>(
            "/foundation/tenant-hierarchy/facilities",
          );
          const mapped = orgFacilities.map((f) => ({
            facility_id: f.facility_id,
            organisation_id: f.organisation_id,
            facility_name: f.facility_name ?? "Facility",
            facility_code: "—",
            facility_type: (f.facility_type as Facility["facility_type"]) ?? "clinic",
            city: f.city ?? "",
            province: "",
            country_code: "PK",
            timezone: f.timezone,
            is_active: f.is_active ?? true,
          }));
          if (!cancelled) {
            if (mapped.length > 0) {
              const selected =
                mapped.find((f) => f.facility_id === resolvedId) ?? mapped[0];
              setActiveFacilityId(selected.facility_id);
              setActiveFacilityIdState(selected.facility_id);
              setAvailableFacilities(mapped);
              setActiveFacility(selected);
              setNoFacilityAccess(false);
            } else {
              setAvailableFacilities([]);
              setActiveFacility(null);
              setNoFacilityAccess(true);
            }
          }
        } catch {
          if (!cancelled) {
            setAvailableFacilities([]);
            setActiveFacility(null);
            setNoFacilityAccess(true);
          }
        }
      } else if (!cancelled) {
        // No facility-role rows and no active org-level role either — a
        // real, honest "no accessible Facility" state per spec §7.9, not a
        // fabricated placeholder Facility.
        setAvailableFacilities([]);
        setActiveFacility(null);
        setNoFacilityAccess(true);
      }

      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
    // Deliberately NOT depending on activeFacilityId — this effect only
    // runs the full bootstrap once per login. switchFacility (below) does
    // its own smaller, targeted refetch instead of re-running all of this.
  }, [isAuthenticated, currentUser]);

  const switchFacility = useCallback(
    async (facilityId: UUID) => {
      if (!availableFacilities.some((f) => f.facility_id === facilityId)) return;
      setActiveFacilityId(facilityId);
      setActiveFacilityIdState(facilityId);
      // Facility change (spec §7.15/§7.16) — never let a Facility A cache
      // entry or a Facility-bound real-time connection stay alive once the
      // active Facility switches to B.
      clearAllCached();
      teardownAllRealtime();
      try {
        const perms = await apiGet<MyPermissions>("/foundation/auth/permissions/me");
        setPermissions(perms.permissions ?? []);
      } catch {
        setPermissions([]);
      }
      const existing = availableFacilities.find((f) => f.facility_id === facilityId);
      setActiveFacility(
        existing ?? (await fetchFacility(facilityId, orgId)),
      );
    },
    [availableFacilities, orgId],
  );

  const user = useMemo<User>(() => {
    if (!currentUser) {
      return {
        user_id: "",
        organisation_id: "",
        primary_facility_id: "",
        email: "",
        full_name: "",
        designation: null,
        preferred_locale: "en",
        is_active: true,
        user_type: "other",
      };
    }
    return {
      user_id: currentUser.user_id,
      organisation_id: currentUser.organisation_id,
      primary_facility_id: activeFacilityId,
      email: currentUser.email,
      full_name: currentUser.full_name,
      designation: null,
      preferred_locale: "en",
      is_active: currentUser.is_active,
      user_type: "other",
    };
  }, [currentUser, activeFacilityId]);

  const org = organisation ?? placeholderOrg(orgId);
  const fac = activeFacility ?? placeholderFacility(activeFacilityId, orgId);

  // Keep format.ts's module-level timezone in sync with whichever Facility
  // is actually active, so every date/time display and appointment-time
  // calculation follows the real Facility instead of a hardcoded zone.
  useEffect(() => {
    setActiveTimeZone(fac.timezone);
  }, [fac.timezone]);

  const scope = useMemo<SessionScope>(
    () => ({
      user_id: user.user_id,
      organisation_id: user.organisation_id,
      active_facility_id: fac.facility_id,
      roles: [],
      permissions,
    }),
    [user, fac, permissions],
  );

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      user,
      organisation: org,
      activeFacility: fac,
      availableFacilities: availableFacilities.length > 0 ? availableFacilities : [fac],
      scope,
      noFacilityAccess,
      switchFacility,
    }),
    [ready, user, org, fac, availableFacilities, scope, noFacilityAccess, switchFacility],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return ctx;
}
