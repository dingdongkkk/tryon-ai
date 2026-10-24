"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import { useTryOn } from "@/components/tryon/TryOnProvider";
import { Icon } from "@/components/ui/Icon";
import { CATEGORIES } from "@/lib/types";

const PROMOS = ["Try anything on, live, before you buy", "Free delivery over ₹1,999", "Every order checked by a real person", "Easy 15-day returns"];

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-1 font-semibold tracking-[0.22em] ${className}`}>
      TRYON<span className="text-accent">AI</span>
    </span>
  );
}

export default function SiteHeader() {
  const path = usePathname();
  const router = useRouter();
  const { items } = useCart();
  const { setBagOpen, setStylistOpen, setView, live } = useTryOn();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [q, setQ] = useState("");
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const transparent = path === "/" && !menu && !search;
  if (path.startsWith("/console")) return <ConsoleHeader />;

  return (
    <header className={`${transparent ? "absolute inset-x-0" : "sticky"} top-0 z-40`}>
      <div className="bg-ink text-white">
        <div className="mx-auto flex h-8 max-w-[1440px] items-center justify-center overflow-hidden px-4 text-[11px] tracking-[0.08em]">
          <div className="marquee flex w-max gap-16">
            {[...PROMOS, ...PROMOS].map((p, i) => <span key={i} className="whitespace-nowrap">{p}</span>)}
          </div>
        </div>
      </div>

      <div className={`transition-colors ${transparent ? "text-white" : "border-b hairline bg-white/95 backdrop-blur-xl"}`}>
        <div className="mx-auto grid h-16 max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 sm:px-6 lg:px-10">
          <div className="flex items-center gap-1">
            <button className="-ml-2 grid h-10 w-10 place-items-center lg:hidden" onClick={() => setMenu((v) => !v)} aria-label="Menu" aria-expanded={menu}>
              <Icon name={menu ? "close" : "menu"} />
            </button>
            <nav className="hidden items-center gap-7 lg:flex">
              <Link href="/shop" className="nav-link link-underline">Shop all</Link>
              {CATEGORIES.slice(0, 4).map((c) => <Link key={c.key} href={`/shop?c=${c.key}`} className="nav-link link-underline">{c.label}</Link>)}
            </nav>
          </div>

          <Link href="/" aria-label="TryOn AI home"><Wordmark className="text-[19px]" /></Link>

          <div className="flex items-center justify-end gap-0.5 sm:gap-2">
            <button onClick={() => setSearch((v) => !v)} className="grid h-10 w-10 place-items-center" aria-label="Search"><Icon name="search" size={19} /></button>
            <button onClick={() => setStylistOpen(true)} className="nav-link hidden h-10 items-center gap-1.5 px-2 md:flex" aria-label="AI Stylist">
              <Icon name="sparkle" size={14} className={transparent ? "" : "text-accent"} /> AI Stylist
            </button>
            <button onClick={() => setView("dock")} className="nav-link relative flex h-10 items-center gap-1.5 px-2" aria-label="Open Live Mirror">
              <Icon name="mirror" size={19} /><span className="hidden xl:inline">Mirror</span>
              {live && <span className="absolute right-1 top-2 h-2 w-2 animate-pulse rounded-full bg-red-500" />}
            </button>
            <button onClick={() => setBagOpen(true)} className="nav-link flex h-10 items-center gap-1.5 px-2" aria-label={`Bag, ${count} items`}>
              <Icon name="bag" size={19} /><span className="tabular-nums">{count}</span>
            </button>
          </div>
        </div>

        {search && (
          <form
            className="mx-auto max-w-[1440px] px-4 pb-5 sm:px-6 lg:px-10 animate-rise"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(`/shop?q=${encodeURIComponent(q)}`);
              setSearch(false);
            }}
          >
            <div className="relative border-b border-ink">
              <Icon name="search" className="absolute left-0 top-1/2 -translate-y-1/2" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: linen shirt, kurta, dress…" className="h-14 w-full bg-transparent pl-9 text-xl outline-none placeholder:text-mute" aria-label="Search products" />
            </div>
          </form>
        )}

        {menu && (
          <nav className="grid gap-1 border-t hairline bg-white px-4 py-6 text-ink lg:hidden animate-rise" onClick={() => setMenu(false)}>
            <Link href="/shop" className="display py-2 text-3xl">Shop all</Link>
            {CATEGORIES.map((c) => <Link key={c.key} href={`/shop?c=${c.key}`} className="display py-2 text-3xl">{c.label}</Link>)}
            <button onClick={() => setStylistOpen(true)} className="btn btn-primary mt-4">Ask the AI Stylist</button>
          </nav>
        )}
      </div>
    </header>
  );
}

function ConsoleHeader() {
  return (
    <header className="sticky top-0 z-40 border-b hairline bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-10">
        <Link href="/console" className="flex items-center gap-3">
          <Wordmark className="text-[15px]" />
          <span className="eyebrow">Ops console</span>
        </Link>
        <Link href="/" className="nav-link">View store →</Link>
      </div>
    </header>
  );
}
