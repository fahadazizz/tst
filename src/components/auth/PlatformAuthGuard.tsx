"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { usePlatformAuth } from "@/context/platform-auth";

const PLATFORM_PUBLIC_ROUTES = ["/platform/login"];

export function PlatformAuthGuard({ children }: { children: React.ReactNode }) {
  const { isReady, isAuthenticated } = usePlatformAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PLATFORM_PUBLIC_ROUTES.some((r) => pathname?.startsWith(r));

  useEffect(() => {
    if (!isReady) return;
    if (!isAuthenticated && !isPublic) router.replace("/platform/login");
  }, [isReady, isAuthenticated, isPublic, pathname, router]);

  if (isPublic) return <>{children}</>;
  if (isReady && isAuthenticated) return <>{children}</>;
  return null;
}
