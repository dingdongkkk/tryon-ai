"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ProductCard from "@/components/shop/ProductCard";
import { Icon } from "@/components/ui/Icon";
import { useTryOn } from "@/components/tryon/TryOnProvider";
import { catalog } from "@/lib/catalog";
import { CATEGORIES, type Category } from "@/lib/types";

const SORTS = [
  { key: "featured", label: "Featured" },
  { key: "new", label: "New in" },
  { key: "price-asc", label: "Price: low to high" },
  { key: "price-desc", label: "Price: high to low" },
] as const;

const PRICES = [
  { key: "", label: "Any price" },
  { key: "1500", label: "Under ₹1,500" },
  { key: "2500", label: "Under ₹2,500" },
  { key: "4000", label: "Under ₹4,000" },
];

export default function ShopGrid() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const { setStylistOpen } = useTryOn();
  const cat = (sp.get("c") ?? "") as Category | "";
  const q = sp.get("q") ?? "";
  const sort = sp.get("sort") ?? "featured";
  const max = sp.get("max") ?? "";

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    router.replace(`${path}?${next.toString()}`, { scroll: false });
  };

  const products = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = catalog.filter((p) => (!cat || p.category === cat) && (!max || p.pricePaise <= Number(max) * 100));
    if (needle) list = list.filter((p) => `${p.name} ${p.description} ${p.color.name} ${p.tags.join(" ")} ${p.category}`.toLowerCase().includes(needle));
    if (sort === "price-asc") list = [...list].sort((a, b) => a.pricePaise - b.pricePaise);
    if (sort === "price-desc") list = [...list].sort((a, b) => b.pricePaise - a.pricePaise);
    if (sort === "new") list = [...list].sort((a, b) => Number(b.badge === "New") - Number(a.badge === "New"));
    return list;
  }, [cat, q, sort, max]);

  const heading = q ? <>Results for <em>&ldquo;{q}&rdquo;</em></> : cat ? CATEGORIES.find((c) => c.key === cat)?.label : <>Shop <em>all</em></>;

  return (
    <div className="shell pb-10 pt-10">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">{products.length} {products.length === 1 ? "piece" : "pieces"} · every one tryable live</p>
          <h1 className="display mt-2 text-[clamp(48px,7vw,104px)] leading-[0.9]">{heading}</h1>
        </div>
        <button onClick={() => setStylistOpen(true)} className="btn h-12 gap-2 rounded-full border border-[#dcd5ff] bg-accent-soft px-5 text-accent hover:border-accent">
          <Icon name="sparkle" size={16} /> Not sure? Ask the AI Stylist
        </button>
      </div>

      {/* Filters */}
      <div className="sticky top-[100px] z-30 -mx-4 mt-8 border-y hairline bg-ivory/90 px-4 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-md sm:border sm:px-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="no-scrollbar -mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1">
            <button onClick={() => set("c", "")} className={`chip h-9 shrink-0 px-4 text-[13px] ${!cat ? "border-ink bg-ink text-paper" : "hover:border-ink"}`}>All</button>
            {CATEGORIES.map((c) => (
              <button key={c.key} onClick={() => set("c", c.key)} className={`chip h-9 shrink-0 px-4 text-[13px] ${cat === c.key ? "border-ink bg-ink text-paper" : "hover:border-ink"}`}>{c.label}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <select value={max} onChange={(e) => set("max", e.target.value)} className="field h-9 w-auto rounded-full py-0 pl-3 pr-8 text-[13px]" aria-label="Price">
              {PRICES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            <select value={sort} onChange={(e) => set("sort", e.target.value === "featured" ? "" : e.target.value)} className="field h-9 w-auto rounded-full py-0 pl-3 pr-8 text-[13px]" aria-label="Sort">
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        </div>
        {q && (
          <button onClick={() => set("q", "")} className="mt-2 chip h-7 hover:border-ink">&ldquo;{q}&rdquo; <Icon name="close" size={12} /></button>
        )}
      </div>

      {products.length ? (
        <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 xl:grid-cols-4">
          {products.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 4} />)}
        </div>
      ) : (
        <div className="mt-16 grid place-items-center text-center">
          <p className="display text-4xl">Nothing matches that yet</p>
          <p className="mt-2 text-sm text-mute">Try another filter, or ask the AI Stylist to find something close.</p>
          <button onClick={() => router.replace(path)} className="btn btn-ghost mt-6">Clear filters</button>
        </div>
      )}
    </div>
  );
}
