"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { CartItem } from "./types";

// Cart lives in localStorage (a per-browser convenience). Prices are re-checked server-side at checkout.
const KEY = "wearable.cart.v1";
const listeners = new Set<() => void>();
let cache: CartItem[] | null = null;
const EMPTY: CartItem[] = [];

function load(): CartItem[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    cache = [];
  }
  return cache!;
}

function save(items: CartItem[]) {
  cache = items;
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage blocked: keep in memory */
  }
  listeners.forEach((l) => l());
}

export function useCart() {
  const items = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    load,
    () => EMPTY,
  );

  const add = useCallback((item: CartItem) => {
    const cur = load();
    const i = cur.findIndex((c) => c.productId === item.productId && c.size === item.size);
    save(i >= 0 ? cur.map((c, j) => (j === i ? { ...c, quantity: Math.min(10, c.quantity + item.quantity) } : c)) : [...cur, item]);
  }, []);
  const remove = useCallback((productId: string, size: string) => save(load().filter((c) => !(c.productId === productId && c.size === size))), []);
  const clear = useCallback(() => save([]), []);
  const total = items.reduce((s, i) => s + i.unitPricePaise * i.quantity, 0);
  return { items, add, remove, clear, total };
}

export { inr } from "./format";
