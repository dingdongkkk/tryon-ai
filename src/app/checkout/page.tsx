"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { inr, useCart } from "@/lib/cart";
import type { Customer } from "@/lib/types";

const FIELDS: { key: keyof Customer; label: string; type?: string; pattern?: string; half?: boolean }[] = [
  { key: "firstName", label: "First name", half: true },
  { key: "lastName", label: "Last name", half: true },
  { key: "email", label: "Email", type: "email" },
  { key: "mobile", label: "Mobile (10 digits)", type: "tel", pattern: "[0-9]{10}" },
  { key: "address1", label: "Address" },
  { key: "city", label: "City", half: true },
  { key: "state", label: "State", half: true },
  { key: "pincode", label: "Pincode", pattern: "[0-9]{6}", half: true },
];

export default function CheckoutPage() {
  const { items, remove, clear, total } = useCart();
  const [customer, setCustomer] = useState<Customer>({
    firstName: "", lastName: "", email: "", mobile: "", address1: "", city: "", state: "", pincode: "",
  });
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
      <div className="mx-auto max-w-md rounded-2xl bg-white p-8 text-center">
        <p className="mb-4">Your bag is empty.</p>
        <Link href="/" className="font-semibold text-indigo-600 hover:underline">Try something on →</Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <form onSubmit={submit} className="rounded-2xl bg-white p-6">
        <h1 className="mb-1 text-xl font-semibold">Delivery details</h1>
        <p className="mb-5 text-sm text-neutral-500">
          A team member reviews every order before we send your Pine Labs payment link. You&apos;ll see it on the next page.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <label key={f.key} className={f.half ? "col-span-1" : "col-span-2"}>
              <span className="mb-1 block text-xs font-medium text-neutral-600">{f.label}</span>
              <input
                required
                type={f.type ?? "text"}
                pattern={f.pattern}
                value={customer[f.key]}
                onChange={(e) => setCustomer({ ...customer, [f.key]: e.target.value })}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2"
              />
            </label>
          ))}
        </div>
        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button disabled={busy} className="mt-6 w-full rounded-xl bg-neutral-900 py-3 font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
          {busy ? "Placing order…" : `Place order · ${inr(total)}`}
        </button>
      </form>

      <aside className="h-fit rounded-2xl bg-white p-6">
        <h2 className="mb-4 font-semibold">Your bag</h2>
        <ul className="divide-y divide-neutral-100">
          {items.map((i) => (
            <li key={`${i.productId}-${i.size}`} className="flex items-center justify-between py-3 text-sm">
              <div>
                <p className="font-medium">{i.name}</p>
                <p className="text-neutral-500">Size {i.size} · Qty {i.quantity}</p>
              </div>
              <div className="text-right">
                <p>{inr(i.unitPricePaise * i.quantity)}</p>
                <button type="button" onClick={() => remove(i.productId, i.size)} className="text-xs text-neutral-500 hover:text-red-600">
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between border-t border-neutral-200 pt-4 font-semibold">
          <span>Total</span>
          <span>{inr(total)}</span>
        </div>
      </aside>
    </div>
  );
}
