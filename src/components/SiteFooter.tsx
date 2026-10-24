"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CATEGORIES } from "@/lib/types";
import MirrorDock from "@/components/tryon/MirrorDock";
import { BagDrawer, StylistDrawer } from "@/components/shop/Drawers";

/** Storefront-only chrome: footer, Live Mirror and drawers (hidden on the ops console). */
export default function SiteFooter({ status }: { status: { agenticorg: string; pinelabs: string; decart: string; freeTryOn: string } }) {
  const path = usePathname();
  if (path.startsWith("/console")) return null;
  return (
    <>
      <footer className="mt-24 bg-ink text-paper">
        <div className="mx-auto max-w-[1440px] px-4 pb-10 pt-16 sm:px-6 lg:px-10">
          <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <p className="display text-5xl leading-[0.95]">Wear it before<br />you buy it.</p>
              <p className="mt-5 max-w-sm text-sm leading-relaxed text-paper/60">TryOn AI is a fashion house built around a live fitting room. AI dresses you in real time, and people double-check what matters.</p>
            </div>
            <div>
              <p className="eyebrow text-paper/40">Shop</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li><Link href="/shop" className="link-underline">Shop all</Link></li>
                {CATEGORIES.map((c) => <li key={c.key}><Link href={`/shop?c=${c.key}`} className="link-underline text-paper/80">{c.label}</Link></li>)}
              </ul>
            </div>
            <div>
              <p className="eyebrow text-paper/40">Help</p>
              <ul className="mt-4 space-y-2.5 text-sm text-paper/80">
                <li>Delivery in 3–5 days</li>
                <li>15-day returns</li>
                <li>Size guide on every product</li>
                <li><Link href="/console" className="link-underline">Team console</Link></li>
              </ul>
            </div>
            <div>
              <p className="eyebrow text-paper/40">Powered by</p>
              <ul className="mt-4 space-y-2.5 text-sm text-paper/80">
                <li>AgenticOrg agents · <span className="text-paper/45">{status.agenticorg}</span></li>
                <li>Decart live try-on · <span className="text-paper/45">{status.decart}</span></li>
                <li>IDM-VTON photo try-on · <span className="text-paper/45">{status.freeTryOn}</span></li>
                <li>Pine Labs payments · <span className="text-paper/45">{status.pinelabs}</span></li>
              </ul>
            </div>
          </div>
          <div className="mt-16 flex flex-wrap items-end justify-between gap-4 border-t border-paper/10 pt-6">
            <p className="select-none text-[16vw] font-semibold leading-[0.75] tracking-[0.08em] text-paper/[0.07] lg:text-[180px]">TRYON<span className="text-[#8e7bff]/30">AI</span></p>
            <p className="text-xs text-paper/40">© {new Date().getFullYear()} TryOn AI · Sample catalog for demonstration · Agents recommend. People decide.</p>
          </div>
        </div>
      </footer>
      <MirrorDock />
      <BagDrawer />
      <StylistDrawer />
    </>
  );
}
