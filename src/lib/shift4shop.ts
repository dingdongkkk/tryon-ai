import "server-only";
import { config } from "./config";
import { mockCatalog } from "./catalog";
import type { Order, Product } from "./types";

// 3dcart / Shift4Shop REST API v1.
// Auth headers: SecureURL (store URL), PrivateKey (your app's key), Token (issued when the merchant installs your app).

async function call<T>(path: string, init: { method?: string; body?: unknown; query?: Record<string, string> } = {}): Promise<T> {
  const c = config.shift4shop;
  const url = new URL(`${c.baseUrl}/${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      SecureURL: c.secureUrl,
      PrivateKey: c.privateKey,
      Token: c.token,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    next: init.method && init.method !== "GET" ? undefined : { revalidate: 60 },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Shift4Shop ${init.method ?? "GET"} ${path} failed (${res.status}): ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

type S4SProduct = {
  SKUInfo: { CatalogID: number; SKU: string; Name: string; Price: number; Stock: number };
  MainImageFile?: string;
  Description?: string;
  ShortDescription?: string;
  ExtraField1?: string; // convention: transparent try-on PNG URL
  ExtraField2?: string; // convention: category (top|outerwear|dress)
  OptionSetList?: { OptionSetName: string; OptionList?: { OptionName: string }[] }[];
};

function absolute(url: string | undefined) {
  if (!url) return "";
  if (/^https?:\/\//.test(url)) return url;
  return `https://${config.shift4shop.secureUrl.replace(/^https?:\/\//, "")}/${url.replace(/^\//, "")}`;
}

function mapProduct(p: S4SProduct): Product {
  const sizeSet = p.OptionSetList?.find((o) => /size/i.test(o.OptionSetName));
  const image = absolute(p.MainImageFile);
  const category = (p.ExtraField2 as Product["category"]) || "top";
  return {
    id: String(p.SKUInfo.CatalogID),
    sku: p.SKUInfo.SKU,
    name: p.SKUInfo.Name,
    description: (p.ShortDescription || p.Description || "").replace(/<[^>]+>/g, "").slice(0, 280),
    pricePaise: Math.round(p.SKUInfo.Price * 100),
    imageUrl: image,
    tryOnImageUrl: absolute(p.ExtraField1) || image,
    category: ["top", "outerwear", "dress"].includes(category) ? category : "top",
    sizes: sizeSet?.OptionList?.map((o) => o.OptionName) ?? ["S", "M", "L", "XL"],
    stock: p.SKUInfo.Stock,
  };
}

export async function listProducts(): Promise<Product[]> {
  if (!config.shift4shop.enabled) return mockCatalog;
  const data = await call<S4SProduct[]>("Products", { query: { limit: "100", offset: "0" } });
  return data.map(mapProduct);
}

export async function getProduct(id: string): Promise<Product | undefined> {
  if (!config.shift4shop.enabled) return mockCatalog.find((p) => p.id === id);
  const data = await call<S4SProduct[]>(`Products/${encodeURIComponent(id)}`);
  return data[0] ? mapProduct(data[0]) : undefined;
}

/** Create the order in the store once a human has approved it. Returns the Shift4Shop OrderID. */
export async function createStoreOrder(order: Order): Promise<string> {
  if (!config.shift4shop.enabled) return `mock_s4s_${order.id}`;
  const c = order.customer;
  const body = [
    {
      InvoiceNumberPrefix: "WA-",
      OrderDate: new Date().toISOString(),
      OrderStatusID: 1, // New
      BillingFirstName: c.firstName,
      BillingLastName: c.lastName,
      BillingAddress: c.address1,
      BillingCity: c.city,
      BillingState: c.state,
      BillingZipCode: c.pincode,
      BillingCountry: "IN",
      BillingEmail: c.email,
      BillingPhoneNumber: c.mobile,
      BillingPaymentMethod: "Pine Labs",
      ShipmentList: [
        {
          ShipmentFirstName: c.firstName,
          ShipmentLastName: c.lastName,
          ShipmentAddress: c.address1,
          ShipmentCity: c.city,
          ShipmentState: c.state,
          ShipmentZipCode: c.pincode,
          ShipmentCountry: "IN",
          ShipmentPhone: c.mobile,
        },
      ],
      OrderItemList: order.items.map((i) => ({
        CatalogID: Number(i.productId),
        ItemID: i.sku,
        ItemQuantity: i.quantity,
        ItemUnitPrice: i.unitPricePaise / 100,
        ItemDescription: `${i.name} - Size ${i.size}`,
        ItemOptions: `Size: ${i.size}`,
      })),
      CustomerComments: `App order ${order.id}`,
    },
  ];
  const res = await call<{ Key?: string; Value?: string; Status?: string; Message?: string }[]>("Orders", { method: "POST", body });
  const id = res[0]?.Value;
  if (!id) throw new Error(`Shift4Shop order creation returned no id: ${JSON.stringify(res)}`);
  return id;
}

/** OrderStatusID: 1 New, 2 Processing, 3 Partial, 4 Shipped, 5 Cancelled, 6 Not Completed, 7 Unpaid ... (store-configurable) */
export async function setStoreOrderStatus(shift4shopOrderId: string, orderStatusId: number) {
  if (!config.shift4shop.enabled || shift4shopOrderId.startsWith("mock_")) return;
  await call(`Orders/${encodeURIComponent(shift4shopOrderId)}`, { method: "PUT", body: [{ OrderStatusID: orderStatusId }] });
}
