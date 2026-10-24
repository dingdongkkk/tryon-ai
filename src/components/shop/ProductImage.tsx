import type { Product } from "@/lib/types";

/**
 * Product imagery. Real photos fill the frame (object-cover); the bundled illustrations
 * sit centred on a neutral well so the grid still reads as a clean catalogue.
 */
export default function ProductImage({ product: p, variant = "product", className = "", eager = false, sizes = "", fit }: { product: Product; variant?: "product" | "model"; className?: string; eager?: boolean; sizes?: string; fit?: "cover" | "contain" }) {
  const src = variant === "model" ? (p.modelImageUrl ?? p.imageUrl) : p.imageUrl;
  const isPhoto = variant === "model" ? Boolean(p.modelImageUrl) || p.photo : p.photo;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={p.name}
      loading={eager ? "eager" : "lazy"}
      sizes={sizes || undefined}
      className={`${fit === "contain" ? "h-full w-full object-contain" : isPhoto ? "h-full w-full object-cover" : "h-full w-full object-contain p-[16%]"} ${className}`}
    />
  );
}
