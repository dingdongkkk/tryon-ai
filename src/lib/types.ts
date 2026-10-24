export type Product = {
  id: string;
  sku: string;
  name: string;
  description: string;
  pricePaise: number;
  imageUrl: string;
  /** Transparent PNG/SVG of the garment front, used for the live overlay */
  tryOnImageUrl: string;
  category: "top" | "outerwear" | "dress";
  sizes: string[];
  stock: number;
  /** Where the shoulders and hip line sit in tryOnImageUrl, as fractions of its width/height */
  fit?: GarmentFit;
};

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

export type OrderStatus =
  | "pending_approval"
  | "rejected"
  | "awaiting_payment"
  | "paid"
  | "payment_failed"
  | "refund_requested"
  | "refunded"
  | "refund_rejected";

export type Order = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;
  items: CartItem[];
  customer: Customer;
  totalPaise: number;
  approvalId?: string;
  shift4shopOrderId?: string;
  pinelabs?: { orderId: string; redirectUrl: string; status?: string };
  refund?: { amountPaise: number; reason: string; approvalId?: string; pinelabsRefundId?: string };
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
  /** stylist_review payload */
  stylist?: {
    productId: string;
    productName: string;
    suggestedSize: string;
    measurements: Record<string, number>;
    snapshot?: string; // data URL of the try-on frame
    customerQuestion?: string;
    stylistSize?: string;
  };
  analysis: AgentAnalysis;
  agenticorgCaseRef?: string;
};
