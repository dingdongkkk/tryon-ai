"use client";

import Link from "next/link";
import { useState } from "react";
import { useTryOn } from "@/components/tryon/TryOnProvider";
import ProductImage from "./ProductImage";
import { useCart } from "@/lib/cart";
import { inr } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import type { Product } from "@/lib/types";

export default function ProductCard({ product: p, priority = false }: { product: Product; priority?: boolean }) {
  const { tryOn, garment, live, setBagOpen } = useTryOn();
  const { add } = useCart();
  const [picking, setPicking] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const wearing = live && garment.id === p.id;
  const hasAlt = Boolean(p.modelImageUrl && p.modelImageUrl !== p.imageUrl);

  return (
    <article className="group relative flex flex-col">
      <div className="relative aspect-[3/4] overflow-hidden bg-cloud">
        <Link href={`/p/${p.id}`} className="absolute inset-0" aria-label={p.name}>
          {/* primary: on-model when available, else product */}
          <ProductImage product={p} variant={hasAlt ? "model" : "product"} eager={priority} className="transition duration-700 ease-out group-hover:scale-[1.03]" />
          {hasAlt && (
            <span className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
              <ProductImage product={p} variant="product" className="bg-cloud" />
            </span>
          )}
        </Link>

        <div className="pointer-events-none absolute left-2.5 top-2.5 flex gap-1.5">
          {p.badge && <span className="bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">{p.badge}</span>}
          {wearing && <span className="flex items-center gap-1 bg-ink px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> On you</span>}
        </div>

        {/* Try on: always reachable on touch, revealed on hover for mouse */}
        <button
          onClick={() => tryOn(p)}
          className="absolute right-2.5 top-2.5 flex h-9 items-center gap-1.5 bg-white/95 px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink shadow-sm backdrop-blur transition hover:bg-ink hover:text-white md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
          aria-label={`Try on ${p.name}`}
        >
          <Icon name="mirror" size={15} /> {wearing ? "Wearing" : "Try on"}
        </button>

        {/* Quick add */}
        <div className="absolute inset-x-0 bottom-0 translate-y-full transition duration-300 group-hover:translate-y-0 group-focus-within:translate-y-0 max-md:hidden">
          <div className="m-2.5 bg-white/95 p-2.5 backdrop-blur">
            {added ? (
              <p className="flex h-9 items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em]"><Icon name="check" size={15} /> Added · {added}</p>
            ) : (
              <>
                <p className="mb-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-mute">Quick add</p>
                <div className="flex flex-wrap justify-center gap-1">
                  {p.sizes.map((s) => (
                    <button key={s} onClick={() => {
                      add({ productId: p.id, sku: p.sku, name: p.name, size: s, quantity: 1, unitPricePaise: p.pricePaise });
                      setAdded(s);
                      setTimeout(() => setAdded(null), 1600);
                    }} className="h-8 min-w-9 border border-transparent px-1.5 text-xs font-medium hover:border-ink">{s}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-start justify-between gap-3">
        <Link href={`/p/${p.id}`} className="min-w-0">
          <h3 className="truncate text-[13px] font-medium">{p.name}</h3>
          <p className="mt-0.5 text-[13px] text-mute">{p.color.name}</p>
        </Link>
        <div className="flex shrink-0 flex-col items-end">
          <p className="text-[13px] font-medium">{inr(p.pricePaise)}</p>
          <button onClick={() => (picking ? setPicking(false) : setPicking(true))} className="mt-0.5 text-[11px] text-mute underline-offset-2 hover:underline md:hidden" aria-expanded={picking}>Add</button>
        </div>
      </div>
      {picking && (
        <div className="mt-2 flex flex-wrap gap-1 md:hidden">
          {p.sizes.map((s) => (
            <button key={s} onClick={() => {
              add({ productId: p.id, sku: p.sku, name: p.name, size: s, quantity: 1, unitPricePaise: p.pricePaise });
              setPicking(false);
              setBagOpen(true);
            }} className="size-btn h-8 min-w-9 text-xs">{s}</button>
          ))}
        </div>
      )}
    </article>
  );
}
