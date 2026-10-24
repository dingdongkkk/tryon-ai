import type { Category, Product } from "./types";

// Local product catalog. Photography: Unsplash (free licence), downloaded to /public/products.
// These are SAMPLE products for the demo store, not real stock.
//
// For the best Decart try-on, `tryOnImageUrl` should be a garment-only shot on a plain background.
// Where we only have an on-model photo, that photo is used as the reference.

const img = (slug: string) => `/products/${slug}.jpg`;

type Seed = Omit<Product, "imageUrl" | "tryOnImageUrl" | "modelImageUrl" | "sample" | "stock" | "backdrop" | "photo"> & {
  product?: string; // garment-only photo
  model?: string; // on-model photo
  stock?: number;
};

const seeds: Seed[] = [
  // ── Tees ────────────────────────────────────────────────
  {
    id: "1001", sku: "TEE-WHT", name: "Essential White Tee", category: "tops", badge: "Bestseller",
    model: "tee-white-model", product: "tee-white-model2",
    color: { name: "Optic White", hex: "#f5f5f3" }, pricePaise: 79900,
    description: "The everyday crew-neck in soft 180 gsm combed cotton. A clean, true-to-size fit.",
    details: ["100% combed cotton, 180 gsm", "Regular fit, true to size", "Ribbed crew neck", "Pre-shrunk"],
    tryOnPrompt: "Substitute the current top with a plain optic white short-sleeve cotton crew-neck t-shirt, regular fit",
    tags: ["white", "basic", "everyday", "casual", "tee", "summer", "minimal"], sizes: ["XS", "S", "M", "L", "XL", "XXL"],
  },
  {
    id: "1002", sku: "TEE-BLK", name: "Black Emblem Tee", category: "tops", badge: "New",
    product: "tee-black-logo",
    color: { name: "Jet Black", hex: "#141414" }, pricePaise: 99900,
    description: "Heavyweight black tee with a small embroidered emblem on the chest.",
    details: ["Heavyweight 220 gsm cotton", "Embroidered chest emblem", "Relaxed fit"],
    tryOnPrompt: "Substitute the current top with a black heavyweight short-sleeve crew-neck t-shirt with a small round white emblem on the left chest",
    tags: ["black", "streetwear", "casual", "tee", "logo"], sizes: ["S", "M", "L", "XL"],
  },
  {
    id: "1003", sku: "TEE-SKY", name: "Sky Washed Tee", category: "tops",
    product: "tee-sky",
    color: { name: "Sky", hex: "#a9c1d9" }, pricePaise: 84900,
    description: "Garment-washed for a soft, lived-in hand and a faded sky-blue tone.",
    details: ["100% cotton jersey", "Garment washed", "Regular fit"],
    tryOnPrompt: "Substitute the current top with a faded sky blue garment-washed short-sleeve cotton t-shirt",
    tags: ["blue", "summer", "casual", "tee", "pastel", "everyday"], sizes: ["XS", "S", "M", "L", "XL"],
  },
  {
    id: "1004", sku: "TEE-ORIG", name: "Original Graphic Tee", category: "tops", badge: "Limited", stock: 9,
    product: "tee-graphic",
    color: { name: "Stone", hex: "#e8e4dc" }, pricePaise: 129900,
    description: "Stone-coloured tee with a bold cobalt screen-printed graphic.",
    details: ["Screen-printed artwork", "Heavyweight cotton", "Boxy fit"],
    tryOnPrompt: "Substitute the current top with a stone beige short-sleeve t-shirt with a large bold cobalt blue square graphic print on the chest",
    tags: ["graphic", "streetwear", "print", "casual", "tee", "statement"], sizes: ["S", "M", "L", "XL"],
  },
  {
    id: "1005", sku: "TEE-PEACE", name: "Peace Hand Graphic Tee", category: "tops",
    model: "tee-skeleton-model", product: "tee-black-hanger",
    color: { name: "Black", hex: "#1a1a1a" }, pricePaise: 109900,
    description: "Black street tee with a bold white graphic print.",
    details: ["Soft-hand white print", "100% cotton", "Regular fit"],
    tryOnPrompt: "Substitute the current top with a black short-sleeve t-shirt with a large white skeleton peace-sign hand graphic on the chest",
    tags: ["graphic", "black", "streetwear", "tee", "concert"], sizes: ["S", "M", "L", "XL"],
  },
  // ── Shirts ──────────────────────────────────────────────
  {
    id: "1101", sku: "SHT-CHAM", name: "Chambray Denim Shirt", category: "shirts", badge: "New",
    product: "shirt-chambray",
    color: { name: "Chambray", hex: "#6f8fae" }, pricePaise: 199900,
    description: "Soft washed chambray with a subtle printed pattern and a classic collar.",
    details: ["100% cotton chambray", "Classic collar", "Regular fit"],
    tryOnPrompt: "Substitute the current top with a light blue washed chambray denim long-sleeve button-up shirt with a classic collar",
    tags: ["denim", "blue", "smart casual", "shirt", "weekend"], sizes: ["S", "M", "L", "XL", "XXL"],
  },
  {
    id: "1102", sku: "SHT-POP", name: "White Poplin Shirt", category: "shirts", badge: "Bestseller",
    model: "shirt-poplin-model",
    color: { name: "White", hex: "#f7f7f5" }, pricePaise: 219900,
    description: "Crisp cotton poplin with a cutaway collar, made for the office and beyond.",
    details: ["100% cotton poplin", "Cutaway collar", "Slim fit", "Easy iron"],
    tryOnPrompt: "Substitute the current top with a crisp white long-sleeve cotton poplin dress shirt with a collar",
    tags: ["white", "office", "formal", "shirt", "wedding", "interview"], sizes: ["S", "M", "L", "XL"],
  },
  {
    id: "1103", sku: "SHT-PLAID", name: "Plaid Flannel Overshirt", category: "shirts",
    model: "shirt-plaid-model",
    color: { name: "Olive Check", hex: "#5f6a3a" }, pricePaise: 249900,
    description: "Brushed flannel overshirt in an olive-and-ochre check, worn open or buttoned.",
    details: ["Brushed cotton flannel", "Two chest pockets", "Relaxed fit for layering"],
    tryOnPrompt: "Substitute the current top with an olive green and yellow plaid flannel overshirt worn open over a mustard t-shirt",
    tags: ["plaid", "flannel", "layering", "winter", "casual", "travel", "shirt"], sizes: ["S", "M", "L", "XL"],
  },
  // ── Knitwear ────────────────────────────────────────────
  {
    id: "1201", sku: "KNT-TAN", name: "Tangerine Crew Sweater", category: "knitwear", badge: "New",
    model: "knit-tangerine-model",
    color: { name: "Tangerine", hex: "#e8823a" }, pricePaise: 229900,
    description: "A cheerful tangerine crew in a soft cotton-blend knit.",
    details: ["Cotton-acrylic blend", "Ribbed cuffs and hem", "Relaxed fit"],
    tryOnPrompt: "Substitute the current top with a bright tangerine orange long-sleeve crew-neck knit sweater",
    tags: ["orange", "knit", "winter", "colour", "sweater", "casual"], sizes: ["XS", "S", "M", "L", "XL"],
  },
  {
    id: "1202", sku: "KNT-CRO", name: "Cream Crochet Poncho", category: "knitwear", badge: "Limited", stock: 6,
    product: "knit-crochet",
    color: { name: "Cream", hex: "#efe6d4" }, pricePaise: 279900,
    description: "Hand-crocheted open-knit poncho with a fringed hem.",
    details: ["Hand-crocheted cotton", "Fringed hem", "One relaxed shape"],
    tryOnPrompt: "Substitute the current top with a cream open-knit crochet poncho with a V neckline and fringed hem",
    tags: ["crochet", "boho", "beach", "vacation", "cream", "layering", "summer"], sizes: ["S", "M", "L"],
  },
  {
    id: "1203", sku: "SWT-CLD", name: "Cloud Crew Sweatshirt", category: "knitwear",
    product: "sweat-cloud",
    color: { name: "Cloud White", hex: "#f2f2f0" }, pricePaise: 179900,
    description: "Loopback cotton sweatshirt in a clean cloud white.",
    details: ["French terry cotton, 330 gsm", "Ribbed trims", "Regular fit"],
    tryOnPrompt: "Substitute the current top with a plain white long-sleeve crew-neck cotton sweatshirt",
    tags: ["white", "sweatshirt", "winter", "casual", "minimal", "travel"], sizes: ["S", "M", "L", "XL", "XXL"],
  },
  // ── Outerwear ───────────────────────────────────────────
  {
    id: "1301", sku: "JKT-TAN", name: "Tan Suede Bomber", category: "outerwear", badge: "Bestseller",
    product: "jacket-tan", model: "jacket-tan-model",
    color: { name: "Tan", hex: "#b77a4f" }, pricePaise: 549900,
    description: "Soft suede-feel bomber with a ribbed collar, cuffs and hem.",
    details: ["Microsuede shell", "Ribbed trims", "Two side pockets", "Fully lined"],
    tryOnPrompt: "Substitute the current top with a tan brown suede bomber jacket with a zip front and ribbed collar, worn open",
    tags: ["jacket", "tan", "brown", "outerwear", "date", "smart casual", "layering"], sizes: ["S", "M", "L", "XL"],
  },
  {
    id: "1302", sku: "HOOD-GRY", name: "Grey Fleece Hoodie", category: "outerwear",
    model: "hoodie-grey-model",
    color: { name: "Heather Grey", hex: "#9a9b9d" }, pricePaise: 249900,
    description: "Brushed-back fleece hoodie with a lined hood.",
    details: ["Brushed cotton fleece, 320 gsm", "Lined hood", "Kangaroo pocket"],
    tryOnPrompt: "Substitute the current top with a heather grey fleece pullover hoodie with the hood",
    tags: ["hoodie", "grey", "winter", "casual", "travel", "streetwear"], sizes: ["S", "M", "L", "XL", "XXL"],
  },
  {
    id: "1303", sku: "BLZ-NVY", name: "Navy Tailored Blazer", category: "outerwear",
    model: "blazer-navy-model",
    color: { name: "Navy", hex: "#23314f" }, pricePaise: 699900,
    description: "Sharp single-breasted blazer in a fine navy suiting wool blend.",
    details: ["Wool-blend suiting", "Notch lapel, two buttons", "Half lined", "Tailored fit"],
    tryOnPrompt: "Substitute the current top with a navy blue tailored single-breasted suit blazer over a white shirt",
    tags: ["blazer", "navy", "formal", "office", "wedding", "suit", "interview"], sizes: ["S", "M", "L", "XL"],
  },
  // ── Dresses ─────────────────────────────────────────────
  {
    id: "1401", sku: "DRS-WHT", name: "White Off-Shoulder Mini", category: "dresses", badge: "New",
    model: "dress-white-model",
    color: { name: "White", hex: "#f6f5f1" }, pricePaise: 299900,
    description: "Flirty off-shoulder mini with a ruffled neckline.",
    details: ["Cotton poplin", "Elasticated off-shoulder neckline", "Mini length"],
    tryOnPrompt: "Substitute the current outfit with a white off-shoulder ruffled mini dress",
    tags: ["white", "dress", "summer", "party", "brunch", "vacation"], sizes: ["XS", "S", "M", "L"],
  },
  {
    id: "1402", sku: "DRS-FLR", name: "Red Floral Midi Dress", category: "dresses", badge: "Bestseller",
    model: "dress-floral-model",
    color: { name: "Red Floral", hex: "#c8322b" }, pricePaise: 329900,
    description: "Fit-and-flare midi in a red floral print with a belted waist.",
    details: ["Crepe viscose", "Belted waist", "Midi length", "Short sleeves"],
    tryOnPrompt: "Substitute the current outfit with a red floral print short-sleeve fit-and-flare midi dress with a belt",
    tags: ["floral", "red", "dress", "festive", "party", "wedding", "diwali"], sizes: ["XS", "S", "M", "L", "XL"],
  },
  {
    id: "1403", sku: "DRS-SCR", name: "Scarlet Maxi Dress", category: "dresses",
    model: "dress-scarlet-model",
    color: { name: "Scarlet", hex: "#d4202a" }, pricePaise: 399900,
    description: "Flowing halter maxi in scarlet chiffon that moves beautifully.",
    details: ["Chiffon with lining", "Halter neck", "Full maxi skirt"],
    tryOnPrompt: "Substitute the current outfit with a scarlet red flowing halter-neck chiffon maxi dress",
    tags: ["red", "maxi", "dress", "evening", "wedding", "party", "festive"], sizes: ["XS", "S", "M", "L"],
  },
  {
    id: "1404", sku: "DRS-SKY", name: "Sky Wrap Maxi Dress", category: "dresses",
    model: "dress-sky-model",
    color: { name: "Powder Blue", hex: "#a9c3dc" }, pricePaise: 349900,
    description: "Breezy wrap maxi with a thigh-high slit, made for the coast.",
    details: ["Lightweight viscose", "True wrap with tie", "Front slit"],
    tryOnPrompt: "Substitute the current outfit with a powder blue sleeveless wrap maxi dress with a front slit",
    tags: ["blue", "maxi", "beach", "vacation", "summer", "dress", "wedding"], sizes: ["XS", "S", "M", "L", "XL"],
  },
  {
    id: "1405", sku: "DRS-PLM", name: "Plum Off-Shoulder Gown", category: "dresses", badge: "Limited", stock: 5,
    model: "dress-plum-model",
    color: { name: "Plum", hex: "#5c1e3d" }, pricePaise: 599900,
    description: "Velvet off-shoulder gown in deep plum for evenings that matter.",
    details: ["Stretch velvet", "Off-shoulder neckline", "Floor length"],
    tryOnPrompt: "Substitute the current outfit with a deep plum purple velvet off-shoulder evening gown",
    tags: ["gown", "evening", "wedding", "reception", "velvet", "purple", "party", "dress"], sizes: ["XS", "S", "M", "L"],
  },
];

export const catalog: Product[] = seeds.map(({ product, model, stock, ...p }) => {
  const primary = img((model ?? product)!);
  return {
    ...p,
    backdrop: "#f4f4f2",
    // card shows the on-model photo when we have one; the product shot is the hover/secondary
    modelImageUrl: model ? img(model) : undefined,
    imageUrl: product ? img(product) : primary,
    tryOnImageUrl: product ? img(product) : primary,
    photo: true,
    credit: { by: "Unsplash", url: "https://unsplash.com" },
    stock: stock ?? 30,
    sample: true,
  };
});

export const heroPhotos = {
  hero: img("hero-shopping"),
  store: img("banner-store"),
  rack: img("banner-rack"),
  yellow: img("banner-yellow"),
  shirts: img("banner-shirts"),
  tees: img("banner-tees"),
  stripes: img("editorial-stripes"),
};

export async function listProducts(category?: Category) {
  return category ? catalog.filter((p) => p.category === category) : catalog;
}

export async function getProduct(id: string) {
  return catalog.find((p) => p.id === id);
}
