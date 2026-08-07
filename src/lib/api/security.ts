// lib/api/security.ts
// Typed calls for the authenticated tenant security-settings surface (spec
// §7.12): MFA setup/enable/recovery/reset and password change. Thin wrappers
// over the shared client (auth + envelope) — no realm-specific logic here.

import { apiPost } from "@/lib/api";
import type { components } from "@/types/api";

export type MFASetupResponse = components["schemas"]["MFASetupResponse"];
export type MFAEnableResponse = components["schemas"]["MFAEnableResponse"];
export type MFARecoveryCodesResponse =
  components["schemas"]["MFARecoveryCodesResponse"];
export type MFAResetResponse = components["schemas"]["MFAResetResponse"];
export type LogoutAllResponse = components["schemas"]["LogoutAllResponse"];

/** POST /auth/mfa/setup — starts MFA enrollment; 409 if already enabled. */
export function setupMfa(): Promise<MFASetupResponse> {
  return apiPost<MFASetupResponse>("/foundation/auth/mfa/setup");
}

/** POST /auth/mfa/enable — confirms enrollment with a TOTP code; returns
 *  recovery codes exactly once (spec: never re-fetchable after this). */
export function enableMfa(totpCode: string): Promise<MFAEnableResponse> {
  return apiPost<MFAEnableResponse>("/foundation/auth/mfa/enable", {
    totp_code: totpCode,
  });
}

/** POST /auth/mfa/recovery-codes/regenerate — requires current_password plus
 *  one live MFA factor (TOTP or a recovery code); does NOT end sessions. */
export function regenerateRecoveryCodes(payload: {
  current_password: string;
  totp_code?: string;
  recovery_code?: string;
}): Promise<MFARecoveryCodesResponse> {
  return apiPost<MFARecoveryCodesResponse>(
    "/foundation/auth/mfa/recovery-codes/regenerate",
    payload,
  );
}

/** POST /auth/mfa/reset — disables MFA entirely; requires current_password
 *  plus one live MFA factor. Always ends every session for this user
 *  (session_end_reason "mfa_reset") — the caller must clear local session
 *  state immediately on success rather than waiting for a future 401. */
export function resetMfa(payload: {
  current_password: string;
  totp_code?: string;
  recovery_code?: string;
}): Promise<MFAResetResponse> {
  return apiPost<MFAResetResponse>("/foundation/auth/mfa/reset", payload);
}

/** POST /auth/password/change — always ends every session for this user
 *  (session_end_reason "password_changed"); same immediate-clear rule. */
export function changePassword(payload: {
  current_password: string;
  new_password: string;
}): Promise<LogoutAllResponse> {
  return apiPost<LogoutAllResponse>("/foundation/auth/password/change", payload);
}
