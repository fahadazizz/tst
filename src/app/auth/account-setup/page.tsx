"use client";

// auth/account-setup/page.tsx
// Frontend callback route the backend's first-owner setup email links to
// (FRONTEND_ACCOUNT_SETUP_URL, default "/auth/account-setup") — spec §7.11.
// Mechanically identical to /auth/password-reset (same
// POST /auth/password/reset/confirm, same organisation_id + reset_token
// query contract issued by AuthService.issue_owner_setup_token) — only the
// copy differs, since this is a brand-new tenant owner's first password,
// not an existing user resetting one.

import { Suspense } from "react";
import { PasswordResetConfirmForm } from "@/components/auth/PasswordResetConfirmForm";

export default function AccountSetupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 py-12">
      <Suspense fallback={null}>
        <PasswordResetConfirmForm
          title="Set up your account"
          description="Choose a password to activate your Organisation Owner account."
          successMessage="Your account is set up. Please sign in with your new password."
        />
      </Suspense>
    </main>
  );
}
