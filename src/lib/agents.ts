// Registry of the AgenticOrg agent units used across the site. Safe to import on the client.
export type AgentKey = "concierge" | "fit_advisor" | "order_guardian" | "returns_desk" | "reconciliation";

export type AgentUnit = {
  key: AgentKey;
  name: string;
  audience: "Shoppers" | "Ops";
  purpose: string;
  humanInLoop: string;
  toolEnv: string;
  defaultTool: string;
};

export const AGENT_UNITS: AgentUnit[] = [
  {
    key: "concierge",
    name: "AI Stylist Concierge",
    audience: "Shoppers",
    purpose: "Chats with shoppers, understands occasion, budget and style, and picks products from the live catalog to try on.",
    humanInLoop: "Advice only. It can't place orders or move money.",
    toolEnv: "AGENTICORG_CONCIERGE_TOOL",
    defaultTool: "agenticorg_chat_agent",
  },
  {
    key: "fit_advisor",
    name: "Fit Advisor",
    audience: "Shoppers",
    purpose: "Reads camera-based body measurements and the try-on snapshot, and drafts a size recommendation.",
    humanInLoop: "A human stylist confirms or changes the size before the shopper sees it.",
    toolEnv: "AGENTICORG_STYLIST_TOOL",
    defaultTool: "agenticorg_product_agent",
  },
  {
    key: "order_guardian",
    name: "Order Guardian",
    audience: "Ops",
    purpose: "Screens every order for risk, address problems and unusual quantities before payment is requested.",
    humanInLoop: "A human approves before the Pine Labs payment link is issued.",
    toolEnv: "AGENTICORG_ORDER_REVIEW_TOOL",
    defaultTool: "agenticorg_risk_sentinel",
  },
  {
    key: "returns_desk",
    name: "Returns Desk",
    audience: "Ops",
    purpose: "Assesses refund requests against the order and payment history.",
    humanInLoop: "A human approves before the refund is sent to Pine Labs.",
    toolEnv: "AGENTICORG_REFUND_REVIEW_TOOL",
    defaultTool: "agenticorg_complaint_resolution",
  },
  {
    key: "reconciliation",
    name: "Payment Reconciliation",
    audience: "Ops",
    purpose: "Matches every app order against its live Pine Labs payment status and explains each mismatch.",
    humanInLoop: "Mismatches are listed for ops to resolve. Nothing is changed automatically.",
    toolEnv: "AGENTICORG_RECON_TOOL",
    defaultTool: "agenticorg_recon_agent",
  },
];

export const agentUnit = (key: AgentKey) => AGENT_UNITS.find((a) => a.key === key)!;

export type AgentRun = {
  id: string;
  agent: AgentKey;
  tool: string;
  at: string;
  ms: number;
  source: "agenticorg" | "heuristic" | "disabled";
  ok: boolean;
  confidence?: number;
  recommendation?: string;
  hitl?: boolean;
  input: string;
  output: string;
  error?: string;
};
