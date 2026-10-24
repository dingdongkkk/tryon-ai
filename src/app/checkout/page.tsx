"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { inr, useCart } from "@/lib/cart";
import type { Customer } from "@/lib/types";

const FIELDS: { key: keyof Customer; label: string; type?: string; pattern?: string; half?: boolean; auto?: string; mode?: "numeric" | "tel" | "email" }[] = [
  { key: "firstName", label: "First name", half: true, auto: "given-name" },
  { key: "lastName", label: "Last name", half: true, auto: "family-name" },
  { key: "email", label: "Email", type: "email", auto: "email", mode: "email" },
  { key: "mobile", label: "Mobile number", type: "tel", pattern: "[0-9]{10}", auto: "tel-national", mode: "tel" },
  { key: "address1", label: "Address", auto: "street-address" },
  { key: "city", label: "City", half: true, auto: "address-level2" },
  { key: "state", label: "State", half: true, auto: "address-level1" },
  { key: "pincode", label: "Pincode", pattern: "[0-9]{6}", half: true, auto: "postal-code", mode: "numeric" },
];

const STEPS = ["Bag", "Human review", "Pay with Pine Labs"];

export default function CheckoutPage() {
  const { items, remove, clear, total } = useCart();
  const [customer, setCustomer] = useState<Customer>({ firstName: "", lastName: "", email: "", mobile: "", address1: "", city: "", state: "", pincode: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: items.map(({ productId, size, quantity }) => ({ productId, size, quantity })), customer }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      clear();
      router.push(`/orders/${j.order.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!items.length) {
    return (
      <div className="shell mt-16 max-w-md text-center">
        <p className="display text-5xl">Your bag is empty</p>
        <p className="mt-3 text-ink-2">Find something you love in the studio first.</p>
        <Link href="/" className="btn btn-primary mt-6">Back to the studio</Link>
      </div>
    );
  }

  return (
    <div className="shell max-w-6xl pt-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-5xl">Checkout</h1>
        <ol className="flex items-center gap-2 text-xs font-medium text-mute">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span className={`grid h-6 w-6 place-items-center rounded-full ${i === 0 ? "bg-ink text-paper" : "border hairline bg-paper"}`}>{i + 1}</span>
              <span className={i === 0 ? "text-ink" : ""}>{s}</span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-line-2" />}
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <form onSubmit={submit} className="card p-6 sm:p-8">
          <h2 className="text-lg font-semibold">Delivery details</h2>
          <p className="mt-1 text-sm text-mute">A member of our team reviews every order. Once it&apos;s approved, your secure Pine Labs payment link appears on the next page.</p>
          <div className="mt-6 grid grid-cols-2 gap-4">
            {FIELDS.map((f) => (
              <label key={f.key} className={f.half ? "col-span-2 sm:col-span-1" : "col-span-2"}>
                <span className="label">{f.label}</span>
                <input
                  required
                  type={f.type ?? "text"}
                  pattern={f.pattern}
                  aria-label={f.label}
                  autoComplete={f.auto}
                  inputMode={f.mode}
                  value={customer[f.key]}
                  onChange={(e) => setCustomer({ ...customer, [f.key]: e.target.value })}
                  className="field"
                />
              </label>
            ))}
          </div>
          {error && <p className="mt-5 rounded-md bg-[#fdf3f1] p-4 text-sm text-bad">{error}</p>}
          <button disabled={busy} className="btn btn-primary mt-8 h-14 w-full text-base">
            {busy ? "Placing order…" : `Place order · ${inr(total)}`}
          </button>
          <p className="mt-3 text-center text-xs text-mute">You won&apos;t be charged until you pay on Pine Labs.</p>
        </form>

        <aside className="card h-fit p-6">
          <h2 className="font-semibold">In your bag</h2>
          <ul className="mt-4 divide-y divide-[var(--line)]">
            {items.map((i) => (
              <li key={`${i.productId}-${i.size}`} className="flex items-center justify-between gap-3 py-3.5 text-sm">
                <div>
                  <p className="font-medium">{i.name}</p>
                  <p className="text-mute">Size {i.size} · Qty {i.quantity}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{inr(i.unitPricePaise * i.quantity)}</p>
                  <button type="button" onClick={() => remove(i.productId, i.size)} className="text-xs text-mute hover:text-bad">Remove</button>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between border-t hairline pt-4 text-lg font-semibold">
            <span>Total</span>
            <span>{inr(total)}</span>
          </div>
          <p className="mt-1 text-xs text-mute">Final price is confirmed by the server at checkout.</p>
        </aside>
      </div>
    </div>
  );
}
