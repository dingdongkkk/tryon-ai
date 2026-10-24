import type { Product } from "./types";

const KURTA_FIT = { shoulderLX: 0.275, shoulderRX: 0.725, shoulderY: 0.167, hipY: 0.66 };

// Used when Shift4Shop credentials aren't configured. Garment art lives in /public/garments.
export const mockCatalog: Product[] = [
  {
    id: "1001",
    sku: "TEE-CORAL",
    name: "Coral Crew Tee",
    description: "Soft cotton crew-neck tee with a relaxed fit.",
    pricePaise: 89900,
    imageUrl: "/garments/tee-coral.svg",
    tryOnImageUrl: "/garments/tee-coral.svg",
    category: "top",
    sizes: ["XS", "S", "M", "L", "XL"],
    stock: 40,
  },
  {
    id: "1002",
    sku: "TEE-INDIGO",
    name: "Indigo Pocket Tee",
    description: "Heavyweight tee in deep indigo with a chest pocket.",
    pricePaise: 109900,
    imageUrl: "/garments/tee-indigo.svg",
    tryOnImageUrl: "/garments/tee-indigo.svg",
    category: "top",
    sizes: ["S", "M", "L", "XL"],
    stock: 25,
  },
  {
    id: "1003",
    sku: "JKT-OLIVE",
    name: "Olive Field Jacket",
    description: "Lightweight utility jacket with a front zip.",
    pricePaise: 449900,
    imageUrl: "/garments/jacket-olive.svg",
    tryOnImageUrl: "/garments/jacket-olive.svg",
    category: "outerwear",
    sizes: ["S", "M", "L", "XL"],
    stock: 12,
  },
  {
    id: "1004",
    sku: "KRT-SAFFRON",
    name: "Saffron Kurta",
    description: "Hip-length cotton kurta in a warm saffron.",
    pricePaise: 189900,
    imageUrl: "/garments/kurta-saffron.svg",
    tryOnImageUrl: "/garments/kurta-saffron.svg",
    category: "dress",
    sizes: ["S", "M", "L", "XL", "XXL"],
    stock: 30,
    fit: KURTA_FIT,
  },
];
