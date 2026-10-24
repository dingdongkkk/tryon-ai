import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Analytics } from "@vercel/analytics/next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import TryOnProvider from "@/components/tryon/TryOnProvider";
import { config, integrationStatus } from "@/lib/config";
import "./globals.css";

// Self-hosted (no runtime font download)

export const metadata: Metadata = {
  title: { default: "TryOn AI: wear it before you buy it", template: "%s · TryOn AI" },
  description: "Shop clothes and try them on live with AI. Styled by agents, approved by people, paid securely with Pine Labs.",
};

export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <TryOnProvider decartAvailable={config.decart.enabled} freeAvailable={config.freeTryOn.enabled}>
          <SiteHeader />
          <main className="w-full flex-1">{children}</main>
          <SiteFooter status={integrationStatus()} />
        </TryOnProvider>
        {/* Vercel Web Analytics: privacy-friendly visitor counts (no cookies); skips the ops console */}
        <Analytics beforeSend={(e) => (e.url.includes("/console") ? null : e)} />
      </body>
    </html>
  );
}
