"use client";

// auth/password-reset/page.tsx
// Frontend callback route the backend's password-reset email links to
// (FRONTEND_PASSWORD_RESET_URL, default "/auth/password-reset") — spec
// §7.11. Query params organisation_id + reset_token are appended by the
// backend itself; this route never asks the user to type either.

import { Suspense } from "react";
import { PasswordResetConfirmForm } from "@/components/auth/PasswordResetConfirmForm";

export default function PasswordResetPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 py-12">
      <Suspense fallback={null}>
        <PasswordResetConfirmForm
          title="Reset your password"
          description="Choose a new password for your account."
          successMessage="Your password has been reset. Please sign in with your new password."
        />
      </Suspense>
    </main>
  );
}
