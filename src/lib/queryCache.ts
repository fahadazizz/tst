// lib/queryCache.ts
// Shared cache/query-key architecture (spec §7.15). This project has no
// TanStack Query/SWR — every screen hand-rolls useState+useEffect fetching.
// Introducing a full query library and migrating every screen is a
// separate, much larger undertaking than one task can safely verify without
// browser-testing each migrated screen; what's built here is the part that
// generalizes safely on its own: a stable key shape that structurally
// forces Organisation + Facility scoping into every cache key, a minimal
// store, and the invalidation wiring at the real trigger points spec §7.15
// names (logout, Facility change, Organisation change, session revocation).
// New/rebuilt screens should build their data-fetching on top of this
// instead of inventing their own ad hoc cache — see queryCache.get/set usage
// in any screen migrated onto it for the pattern to copy.

export interface FacilityQueryKeyParts {
  organisationId: string;
  facilityId: string;
  resource: string;
  filters?: Record<string, string | number | boolean | undefined | null>;
}

/** Builds a stable string key that always carries Organisation ID, Facility
 *  ID, a resource identifier, and filter values (spec §7.15's explicit
 *  requirement) — so two different Facilities (or two different filter
 *  sets) can never collide on the same cache entry. Filter keys are sorted
 *  so `{a:1,b:2}` and `{b:2,a:1}` produce the same key. */
export function buildFacilityQueryKey(parts: FacilityQueryKeyParts): string {
  const { organisationId, facilityId, resource, filters } = parts;
  const filterEntries = Object.entries(filters ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join("&");
  return `org:${organisationId}|facility:${facilityId}|resource:${resource}${
    filterEntries ? `|${filterEntries}` : ""
  }`;
}

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
}

const store = new Map<string, CacheEntry>();

export function getCached<T>(key: string): T | undefined {
  return store.get(key)?.data as T | undefined;
}

export function setCached<T>(key: string, data: T): void {
  store.set(key, { data, fetchedAt: Date.now() });
}

/** Invalidate every entry whose key starts with the given prefix — e.g.
 *  `invalidatePrefix("org:X|facility:Y|")` clears every resource cached for
 *  one Facility without touching other Facilities' entries. */
export function invalidatePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Clears the entire cache — wired to every trigger spec §7.15 names:
 *  logout, logout-all, session revocation/expiry (onSessionExpired),
 *  Organisation change, Facility change, and (once built) impersonation
 *  end. Never leave a stale Facility A entry reachable after any of these —
 *  a full clear is the only way to guarantee that without auditing every
 *  resource's key shape by hand. */
export function clearAllCached(): void {
  store.clear();
}
