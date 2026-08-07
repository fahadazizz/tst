import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "@/lib/env";
import { AuthProvider } from "@/context/auth";
import { PlatformAuthProvider } from "@/context/platform-auth";
import { SessionProvider } from "@/context/session";
import { AppShell } from "@/components/shell/AppShell";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "NexAura HMS",
  description: "NexAura HMS — multi-tenant healthcare management.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
    >
      <body>
        <PlatformAuthProvider>
          <AuthProvider>
            <SessionProvider>
              <AppShell>{children}</AppShell>
            </SessionProvider>
          </AuthProvider>
        </PlatformAuthProvider>
      </body>
    </html>
  );
}
