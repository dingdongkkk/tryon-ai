import "server-only";
import { AgenticOrg } from "agenticorg-sdk";
import { config } from "./config";
import type { AgentAnalysis, Approval, Order } from "./types";

// AgenticOrg agents are called as MCP tools (POST /api/v1/mcp/call via the SDK).
// The agent proposes; a human in /console decides. Nothing here moves money or creates orders.

let client: AgenticOrg | null = null;
function getClient() {
  if (!config.agenticorg.enabled) return null;
  client ??= new AgenticOrg({ apiKey: config.agenticorg.apiKey, baseUrl: config.agenticorg.baseUrl, timeout: 30_000 });
  return client;
}

export async function listTools() {
  const c = getClient();
  if (!c) return [];
  return c.mcp.tools();
}

async function callTool(tool: string, inputs: Record<string, unknown>) {
  const c = getClient();
  if (!c) return null;
  const payload: Record<string, unknown> = { inputs };
  if (config.agenticorg.companyId) payload.company_id = config.agenticorg.companyId;
  const res = await c.mcp.call(tool, payload);
  const text = res.content?.map((x) => x.text).join("\n") ?? "";
  if (res.isError) throw new Error(`AgenticOrg tool ${tool} error: ${text.slice(0, 300)}`);
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* agent replied in prose */
  }
  return { text, parsed };
}

/** Pull confidence / recommendation / hitl_trigger out of whatever shape the agent returned. */
function interpret(tool: string, result: { text: string; parsed: Record<string, unknown> | null }, fallback: AgentAnalysis): AgentAnalysis {
  const p = result.parsed ?? {};
  const out = (p.output as Record<string, unknown>) ?? (p.result as Record<string, unknown>) ?? p;
  const confidence = Number(p.confidence ?? out.confidence ?? (p.result as Record<string, unknown>)?.confidence);
  const hitl = (p.hitl_trigger ?? out.hitl_trigger) as string | undefined;
  const rec = String(out.recommendation ?? out.decision ?? "").toLowerCase();
  const flags = [...fallback.flags];
  if (hitl) flags.push(`AgenticOrg HITL trigger: ${hitl}`);
  return {
    source: "agenticorg",
    tool,
    summary: String(out.summary ?? out.answer ?? out.message ?? result.text ?? fallback.summary).slice(0, 1200),
    recommendation: rec.includes("reject") ? "reject" : rec.includes("approve") && !hitl ? "approve" : hitl ? "review" : fallback.recommendation,
    confidence: Number.isFinite(confidence) ? confidence : fallback.confidence,
    flags,
    raw: result.parsed ?? result.text,
  };
}

async function analyze(tool: string, inputs: Record<string, unknown>, fallback: AgentAnalysis): Promise<AgentAnalysis> {
  try {
    const result = await callTool(tool, inputs);
    return result ? interpret(tool, result, fallback) : fallback;
  } catch (err) {
    return { ...fallback, flags: [...fallback.flags, `AgenticOrg unavailable: ${(err as Error).message}`] };
  }
}

const rupees = (paise: number) => `Rs ${(paise / 100).toFixed(2)}`;

export async function reviewOrder(order: Order): Promise<AgentAnalysis> {
  const flags: string[] = [];
  if (order.totalPaise >= config.policy.orderReviewThresholdPaise) flags.push(`High value: ${rupees(order.totalPaise)}`);
  if (order.items.some((i) => i.quantity > 3)) flags.push("Bulk quantity on a single item");
  if (!/^\d{10}$/.test(order.customer.mobile)) flags.push("Mobile number is not 10 digits");
  if (!/^\d{6}$/.test(order.customer.pincode)) flags.push("Pincode is not 6 digits");
  const fallback: AgentAnalysis = {
    source: "heuristic",
    summary: `${order.items.length} item(s), total ${rupees(order.totalPaise)} for ${order.customer.firstName} ${order.customer.lastName}, ${order.customer.city}.`,
    recommendation: flags.length ? "review" : "approve",
    confidence: flags.length ? 0.6 : 0.9,
    flags,
  };
  return analyze(
    config.agenticorg.orderReviewTool,
    {
      merchant_id: config.agenticorg.merchantId,
      query:
        `Review this apparel order before payment. Reply as JSON {recommendation: approve|reject|review, confidence: 0-1, summary}. ` +
        `Items: ${order.items.map((i) => `${i.quantity}x ${i.name} size ${i.size} @ ${rupees(i.unitPricePaise)}`).join("; ")}. ` +
        `Total ${rupees(order.totalPaise)}. Ship to ${order.customer.city}, ${order.customer.state} ${order.customer.pincode}. Flags: ${flags.join(", ") || "none"}.`,
      order_id: order.id,
    },
    fallback,
  );
}

export async function reviewRefund(order: Order, amountPaise: number, reason: string): Promise<AgentAnalysis> {
  const flags: string[] = [];
  if (amountPaise > order.totalPaise) flags.push("Refund exceeds order total");
  if (amountPaise >= config.policy.orderReviewThresholdPaise) flags.push(`High-value refund: ${rupees(amountPaise)}`);
  const fallback: AgentAnalysis = {
    source: "heuristic",
    summary: `Refund ${rupees(amountPaise)} of ${rupees(order.totalPaise)}. Reason: ${reason}`,
    recommendation: flags.length ? "review" : "approve",
    confidence: flags.length ? 0.5 : 0.85,
    flags,
  };
  return analyze(
    config.agenticorg.refundReviewTool,
    {
      query: `Assess this refund request. Reply as JSON {recommendation, confidence, summary}. Order ${order.id}, paid ${rupees(order.totalPaise)}, refund ${rupees(amountPaise)}, reason: ${reason}.`,
      order_id: order.id,
    },
    fallback,
  );
}

export async function recommendSize(input: {
  productName: string;
  category: string;
  sizes: string[];
  suggestedSize: string;
  measurements: Record<string, number>;
  question?: string;
}): Promise<AgentAnalysis> {
  const fallback: AgentAnalysis = {
    source: "heuristic",
    summary: `Pose-based estimate suggests ${input.suggestedSize} for ${input.productName}. Shoulder ≈ ${input.measurements.shoulderCm ?? "?"} cm, torso ≈ ${input.measurements.torsoCm ?? "?"} cm.`,
    recommendation: "review",
    confidence: input.measurements.shoulderCm ? 0.7 : 0.4,
    flags: input.measurements.shoulderCm ? [] : ["Body not fully visible; measurements incomplete"],
  };
  return analyze(
    config.agenticorg.stylistTool,
    {
      merchant_id: config.agenticorg.merchantId,
      query:
        `Act as a fit stylist. Product: ${input.productName} (${input.category}), sizes ${input.sizes.join("/")}. ` +
        `Customer measurements from camera: ${JSON.stringify(input.measurements)}. Our estimate: ${input.suggestedSize}. ` +
        `${input.question ? `Customer asks: ${input.question}. ` : ""}Reply as JSON {recommendation: "review", size, confidence, summary}.`,
    },
    fallback,
  );
}

/** Optional: mirror the approval as an AgenticOrg governed case so it shows in its audit trail. */
export async function mirrorCase(approval: Approval): Promise<string | undefined> {
  const c = getClient();
  if (!c || !config.agenticorg.mirrorCases) return undefined;
  try {
    const res = await c.cases.submit(
      { approval_id: approval.id, kind: approval.kind, order_id: approval.orderId, analysis: approval.analysis.summary },
      `wearable_${approval.kind}`,
    );
    return String(res.case_ref ?? res.id ?? "");
  } catch {
    return undefined;
  }
}
