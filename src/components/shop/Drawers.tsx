"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useTryOn } from "@/components/tryon/TryOnProvider";
import Concierge from "@/components/Concierge";
import { useCart } from "@/lib/cart";
import { catalog } from "@/lib/catalog";
import { inr } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";

const FREE_SHIPPING = 199900;

function Drawer({ open, onClose, title, children, side = "right", label }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; side?: "right" | "left"; label: string }) {
  return (
    <div className={`fixed inset-0 z-[80] ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div onClick={onClose} className={`absolute inset-0 bg-ink/40 backdrop-blur-[2px] transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`absolute top-0 flex h-full w-full max-w-[440px] flex-col bg-paper shadow-2xl transition-transform duration-500 ease-[cubic-bezier(.2,.7,.2,1)] ${side === "right" ? "right-0" : "left-0"} ${open ? "translate-x-0" : side === "right" ? "translate-x-full" : "-translate-x-full"}`}
      >
        <header className="flex items-center justify-between border-b hairline px-6 py-5">
          {title}
          <button onClick={onClose} className="btn h-10 w-10 p-0 hover:bg-ink/5" aria-label="Close"><Icon name="close" /></button>
        </header>
        {children}
      </aside>
    </div>
  );
}

export function BagDrawer() {
  const { bagOpen, setBagOpen } = useTryOn();
  const { items, remove, add, total } = useCart();
  const toFree = Math.max(0, FREE_SHIPPING - total);
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const byId = Object.fromEntries(catalog.map((p) => [p.id, p]));

  return (
    <Drawer open={bagOpen} onClose={() => setBagOpen(false)} label="Shopping bag" title={<h2 className="display text-3xl">Your bag <span className="text-mute">({count})</span></h2>}>
      {!items.length ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-ivory"><Icon name="bag" size={26} /></span>
          <p className="display text-3xl">Nothing here yet</p>
          <p className="text-sm text-mute">Try something on in the Live Mirror, then add it here.</p>
          <Link href="/shop" onClick={() => setBagOpen(false)} className="btn btn-primary mt-2">Start shopping</Link>
        </div>
      ) : (
        <>
          <div className="border-b hairline px-6 py-4">
            <p className="text-sm">{toFree ? <>You&apos;re <b>{inr(toFree)}</b> away from free delivery</> : <b>You&apos;ve unlocked free delivery ✓</b>}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ivory">
              <div className="h-full rounded-full bg-ink transition-all duration-700" style={{ width: `${Math.min(100, (total / FREE_SHIPPING) * 100)}%` }} />
            </div>
          </div>
          <ul className="scroll-thin flex-1 divide-y divide-[var(--line)] overflow-y-auto px-6">
            {items.map((i) => {
              const p = byId[i.productId];
              return (
                <li key={`${i.productId}-${i.size}`} className="flex gap-4 py-5">
                  <Link href={`/p/${i.productId}`} onClick={() => setBagOpen(false)} className="grid h-24 w-20 shrink-0 place-items-center rounded-md p-2" style={{ background: p?.backdrop }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p && <img src={p.imageUrl} alt="" className="h-full w-full object-contain" />}
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex justify-between gap-2">
                      <p className="truncate font-medium">{i.name}</p>
                      <p className="font-semibold">{inr(i.unitPricePaise * i.quantity)}</p>
                    </div>
                    <p className="text-sm text-mute">{p?.color.name} · Size {i.size}</p>
                    <div className="mt-auto flex items-center justify-between">
                      <div className="flex items-center rounded-full border hairline">
                        <button onClick={() => (i.quantity > 1 ? add({ ...i, quantity: -1 }) : remove(i.productId, i.size))} className="grid h-8 w-8 place-items-center" aria-label="Decrease quantity"><Icon name="minus" size={14} /></button>
                        <span className="w-6 text-center text-sm tabular-nums">{i.quantity}</span>
                        <button onClick={() => add({ ...i, quantity: 1 })} className="grid h-8 w-8 place-items-center" aria-label="Increase quantity"><Icon name="plus" size={14} /></button>
                      </div>
                      <button onClick={() => remove(i.productId, i.size)} className="text-xs text-mute underline-offset-4 hover:text-bad hover:underline">Remove</button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <footer className="grid gap-3 border-t hairline px-6 py-5">
            <div className="flex justify-between text-lg font-semibold"><span>Subtotal</span><span>{inr(total)}</span></div>
            <p className="-mt-1 text-xs text-mute">Taxes included. A team member reviews every order before you pay.</p>
            <Link href="/checkout" onClick={() => setBagOpen(false)} className="btn btn-primary h-14 text-base">Checkout <Icon name="arrow" size={18} /></Link>
          </footer>
        </>
      )}
    </Drawer>
  );
}

export function StylistDrawer() {
  const { stylistOpen, setStylistOpen, tryOn, garment } = useTryOn();
  return (
    <Drawer
      open={stylistOpen}
      onClose={() => setStylistOpen(false)}
      label="AI Stylist"
      title={
        <div className="flex items-center gap-3">
          <span className="agent-gradient grid h-10 w-10 place-items-center rounded-md text-white"><Icon name="sparkle" size={18} /></span>
          <div>
            <p className="font-semibold leading-tight">AI Stylist</p>
            <p className="text-xs text-mute">Powered by AgenticOrg · advice only</p>
          </div>
        </div>
      }
    >
      <Concierge products={catalog} selectedId={garment.id} onTryOn={(p) => tryOn(p)} bare />
    </Drawer>
  );
}
