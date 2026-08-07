"use client";

// AuthGuard.tsx
// Route-level gate. Wraps the authenticated app: if there's no valid session
// once auth state has resolved, the user is redirected to /login. The /login
// route itself is exempt (guarding it would loop). While auth is still
// resolving on first load, we render nothing to avoid a flash of the app before
// a redirect, or a flash of login before we confirm an existing session.

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/context/auth";

const PUBLIC_ROUTES = ["/login", "/auth/password-reset", "/auth/account-setup"];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isReady, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // "/" is exact-match, not prefix-match — every route starts with "/", so
  // using .startsWith() here would make the entire app public.
  const isPublic = pathname === "/" || PUBLIC_ROUTES.some((r) => pathname?.startsWith(r));

  useEffect(() => {
    if (!isReady) return; // wait until we know whether a session exists
    if (!isAuthenticated && !isPublic) {
      router.replace("/login");
    }
  }, [isReady, isAuthenticated, isPublic, router]);

  // Public routes always render. Protected routes render only when authenticated.
  // Everything else renders nothing (either still resolving, or mid-redirect).
  if (isPublic) return <>{children}</>;
  if (isReady && isAuthenticated) return <>{children}</>;
  return null;
}