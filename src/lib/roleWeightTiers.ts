// lib/roleWeightTiers.ts
// Named tiers over the raw backend `weight` field on a Role (0-9999, strictly
// below the Organisation Owner's fixed 10000) — per the RBAC audit's own
// recommendation, an Owner shouldn't need to understand a raw integer to
// rank custom roles. A role can only be assigned by someone whose own
// authority weight is strictly greater than the role's weight (an exact tie
// is blocked too), so picking a tier determines who is allowed to hand this
// role out to others — it has no effect on what the role itself can *do*
// (that's the permission grant set, a separate concern).

export const ROLE_WEIGHT_TIERS = [
  { value: 50, label: "Restricted", hint: "Only Managers and above can assign this role." },
  { value: 100, label: "Standard staff", hint: "The default for most custom roles." },
  { value: 500, label: "Manager", hint: "Can assign Standard/Restricted roles to others." },
  { value: 1000, label: "Senior manager", hint: "Highest tier available below the Organisation Owner." },
] as const;

export const DEFAULT_ROLE_WEIGHT = 100;

/** Maps a role's raw backend weight to the nearest named tier — used both to
 *  pre-select the picker when editing an existing role and to render a
 *  human-readable label on the role list. Falls back to the default tier
 *  when weight is absent (a role created before this field existed, or a
 *  system role that doesn't carry one meaningfully). */
export function closestWeightTier(weight: number | null | undefined): number {
  if (weight == null) return DEFAULT_ROLE_WEIGHT;
  let closest: number = ROLE_WEIGHT_TIERS[0].value;
  let closestDiff = Math.abs(weight - closest);
  for (const tier of ROLE_WEIGHT_TIERS) {
    const diff = Math.abs(weight - tier.value);
    if (diff < closestDiff) {
      closest = tier.value;
      closestDiff = diff;
    }
  }
  return closest;
}

export function weightTierLabel(weight: number | null | undefined): string {
  const tier = ROLE_WEIGHT_TIERS.find((t) => t.value === closestWeightTier(weight));
  return tier?.label ?? "Standard staff";
}
