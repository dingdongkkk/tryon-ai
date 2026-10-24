export type Product = {
  id: string;
  sku: string;
  name: string;
  description: string;
  pricePaise: number;
  imageUrl: string;
  /** Garment-only reference image: sent to Decart and used for the local preview overlay */
  tryOnImageUrl: string;
  /** Decart "substitute" prompt describing the garment */
  tryOnPrompt: string;
  category: Category;
  tags: string[];
  color: { name: string; hex: string };
  /** studio backdrop tint for product tiles */
  backdrop: string;
  badge?: "New" | "Bestseller" | "Limited";
  /** longer copy for the product page */
  details: string[];
  sizes: string[];
  stock: number;
  /** Transparent garment cut-out for the on-device preview overlay (optional) */
  overlayUrl?: string;
  /** On-model photo (cards, hero); falls back to imageUrl */
  modelImageUrl?: string;
  /** true when imageUrl is a real photo rather than the bundled illustration */
  photo?: boolean;
  credit?: { by: string; url: string };
  /** Sample products: demo catalog, not real stock */
  sample?: boolean;
  /** Where the shoulders and hip line sit in tryOnImageUrl, as fractions of its width/height */
  fit?: GarmentFit;
};

export type Category = "tops" | "shirts" | "knitwear" | "outerwear" | "dresses";

export const CATEGORIES: { key: Category; label: string; blurb: string }[] = [
  { key: "tops", label: "T-Shirts", blurb: "Everyday essentials" },
  { key: "shirts", label: "Shirts", blurb: "Oxford, linen, crisp" },
  { key: "knitwear", label: "Knitwear", blurb: "Soft, warm layers" },
  { key: "outerwear", label: "Outerwear", blurb: "Jackets, hoodies, blazers" },
  { key: "dresses", label: "Dresses", blurb: "Day to evening" },
];

export type GarmentFit = { shoulderLX: number; shoulderRX: number; shoulderY: number; hipY: number };

export const DEFAULT_FIT: GarmentFit = { shoulderLX: 0.275, shoulderRX: 0.725, shoulderY: 0.167, hipY: 0.83 };

export type CartItem = {
  productId: string;
  sku: string;
  name: string;
  size: string;
  quantity: number;
  unitPricePaise: number;
};

export type Customer = {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  address1: string;
  city: string;
  state: string;
  pincode: string;
};

/**
 * Payment lifecycle of an order.
 * pending_approval → approved → awaiting_payment → (payment_pending) → paid → partially_refunded | refunded
 *                  ↘ rejected                     ↘ payment_failed (retryable: new checkout attempt)
 */
export type OrderStatus =
  | "pending_approval"
  | "rejected"
  | "approved" // human approved; payment link not issued yet (retryable)
  | "awaiting_payment" // checkout link issued
  | "payment_pending" // shopper attempted; Pine Labs reports PENDING / ATTEMPTED / AUTHORIZED (not captured)
  | "paid" // Pine Labs PROCESSED, amount + currency + reference verified
  | "payment_failed"
  | "payment_mismatch" // Pine Labs data didn't match the order: needs ops
  | "partially_refunded"
  | "refunded";

export type RefundStatus =
  | "review" // waiting for a human
  | "rejected"
  | "approved" // approved, not yet submitted
  | "submit_failed" // submission errored: retryable
  | "pending" // accepted by Pine Labs, not complete yet
  | "processed" // confirmed by Pine Labs
  | "failed"; // Pine Labs reported failure

export type PaymentAttempt = {
  reference: string; // merchant_order_reference sent to Pine Labs (unique per attempt)
  pinelabsOrderId: string;
  redirectUrl: string;
  createdAt: string;
  status?: string; // last Pine Labs status
};

export type Order = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;
  /** Demo order: mock payments only, no money moves */
  demo: boolean;
  items: CartItem[];
  customer: Customer;
  totalPaise: number;
  currency: "INR";
  /** sha256 of the shopper's access token (cookie) */
  accessHash: string;
  approvalId?: string;
  attempts: PaymentAttempt[];
  lastError?: string;
  /** set while a checkout is being created (concurrency guard) */
  issuingAt?: string;
  refund?: {
    amountPaise: number;
    reason: string;
    status: RefundStatus;
    approvalId?: string;
    reference: string; // idempotency key for Pine Labs
    pinelabsRefundOrderId?: string;
    pinelabsStatus?: string;
    lastError?: string;
    submittingAt?: string;
  };
  history: { at: string; event: string }[];
};

export type ApprovalKind = "stylist_review" | "order_review" | "refund_review";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export type AgentAnalysis = {
  source: "agenticorg" | "heuristic";
  tool?: string;
  summary: string;
  recommendation: "approve" | "reject" | "review";
  confidence: number;
  flags: string[];
  raw?: unknown;
};

export type Approval = {
  id: string;
  kind: ApprovalKind;
  status: ApprovalStatus;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  note?: string;
  orderId?: string;
  /** sha256 of the shopper's token, for stylist reviews (shopper polls for the answer) */
  accessHash?: string;
  stylist?: {
    productId: string;
    productName: string;
    selectedSize: string;
    /** rough camera estimate, only a hint for the stylist */
    cameraHint?: Record<string, number>;
    snapshot?: string; // data URL, only with explicit shopper consent
    customerQuestion?: string;
    stylistSize?: string;
  };
  analysis: AgentAnalysis;
  agenticorgCaseRef?: string;
};
