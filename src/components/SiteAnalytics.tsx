"use client";

import { Analytics } from "@vercel/analytics/next";

/** Vercel Web Analytics (cookie-free visitor counts). The ops console is excluded. */
export default function SiteAnalytics() {
  return <Analytics beforeSend={(e) => (e.url.includes("/console") ? null : e)} />;
}
