"use client";

import Link from "next/link";
import { useTryOn } from "@/components/tryon/TryOnProvider";
import { Icon } from "@/components/ui/Icon";

export function HeroActions() {
  const { setView } = useTryOn();
  return (
    <div className="flex flex-wrap gap-3">
      <button onClick={() => setView("full")} className="btn h-12 bg-white px-7 text-ink hover:bg-white/85">
        <Icon name="mirror" size={17} /> Open the Live Mirror
      </button>
      <Link href="/shop" className="btn h-12 border border-white px-7 text-white hover:bg-white hover:text-ink">Shop the collection</Link>
    </div>
  );
}

export function MirrorCta() {
  const { setView } = useTryOn();
  return (
    <button onClick={() => setView("full")} className="btn btn-primary h-12 px-7">
      <Icon name="mirror" size={17} /> Try it now
    </button>
  );
}

export function StylistCta({ className = "" }: { className?: string }) {
  const { setStylistOpen } = useTryOn();
  return (
    <button onClick={() => setStylistOpen(true)} className={`btn btn-ghost h-12 px-6 ${className}`}>
      <Icon name="sparkle" size={15} /> Chat with the AI Stylist
    </button>
  );
}
