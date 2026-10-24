import { Suspense } from "react";
import type { Metadata } from "next";
import ShopGrid from "./ShopGrid";

export const metadata: Metadata = { title: "Shop" };

export default function ShopPage() {
  return (
    <Suspense fallback={<div className="shell pt-10"><div className="skeleton h-24 w-2/3 rounded-md" /></div>}>
      <ShopGrid />
    </Suspense>
  );
}
