import "server-only";
import { AgenticOrg } from "agenticorg-sdk";
import { config } from "./config";
import { catalog } from "./catalog";
import { fetchPlOrder } from "./pinelabs";
import { newId, store } from "./store";
import { agentUnit, type AgentKey } from "./agents";
import type { AgentAnalysis, Approval, Order, Product } from "./types";

// AgenticOrg is the decision layer of the app. Every agent is called as an MCP tool
// (SDK → POST /api/v1/mcp/call), every run is logged for the Control Room, and every
// unit has a kill switch. Agents recommend; humans decide anything that moves money.

let client: AgenticOrg | null = null;
function getClient() {
  if (!config.agenticorg.enabled) return null;
  client ??= new AgenticOrg({ apiKey: config.agenticorg.apiKey, baseUrl: config.agenticorg.baseUrl, timeout: 30_000 });
  return client;
}

const TOOL: Record<AgentKey, string> = {
  concierge: config.agenticorg.conciergeTool,
  fit_advisor: config.agenticorg.stylistTool,
  order_guardian: config.agenticorg.orderReviewTool,
  returns_desk: config.agenticorg.refundReviewTool,
  reconciliation: config.agenticorg.reconTool,
};

export const agentTools = () => ({ ...TOOL });

export async function listTools() {
  const c = getClient();
  return c ? c.mcp.tools() : [];
}

type ToolResult = { text: string; parsed: Record<string, unknown> | null };

/**
 * AgenticOrg MCP replies are a text envelope:
 *   Agent: Chat Agent / Status: hitl_triggered / Confidence: 73% / Result: {json} / HITL Triggered: reason
 * Lift those header fields into the parsed object so callers see {status, confidence, hitl_trigger, output}.
 */
export function parseEnvelope(text: string): Record<string, unknown> | null {
  const status = text.match(/^Status:\s*(\S+)/m)?.[1];
  const conf = text.match(/^Confidence:\s*([\d.]+)\s*%/m)?.[1];
  const hitl = text.match(/^HITL Triggered:\s*(.+)$/m)?.[1];
  const resultStart = text.search(/^Result:\s*/m);
  const body = resultStart >= 0 ? text.slice(resultStart).replace(/^Result:\s*/, "").split(/\n\s*\nHITL Triggered:/)[0] : text;
  const output = extractJson(body) ?? (resultStart >= 0 ? { answer: body.trim() } : null);
  if (!status && !conf && !output) return null;
  return {
    status,
    confidence: conf !== undefined ? Number(conf) / 100 : undefined,
    hitl_trigger: hitl ?? (status === "hitl_triggered" ? "hitl_triggered" : undefined),
    output: output ?? {},
  };
}

/** Find a JSON object in agent output, even if it's wrapped in prose or ```json fences. */
function extractJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {}
  }
  return null;
}

/** Unwrap the canonical AgenticOrg run shape ({output, confidence, hitl_trigger}) or legacy {result:{...}}. */
function unwrap(p: Record<string, unknown> | null) {
  const out = (p?.output ?? p?.result ?? p ?? {}) as Record<string, unknown>;
  // agents often return their answer as a JSON string inside output.answer / output.text
  for (const k of ["answer", "text", "response", "message"]) {
    if (typeof out[k] === "string") {
      const inner = extractJson(out[k] as string);
      if (inner) return { out: { ...out, ...inner }, p };
    }
  }
  return { out, p };
}

async function runAgent(agent: AgentKey, inputs: Record<string, unknown>): Promise<ToolResult | null> {
  const tool = TOOL[agent];
  const started = Date.now();
  const base = { id: newId("run"), agent, tool, at: new Date().toISOString(), input: JSON.stringify(inputs).slice(0, 2000) };

  if ((await store.disabledAgents()).includes(agent)) {
    await store.logAgentRun({ ...base, ms: 0, source: "disabled", ok: true, output: "Unit disabled in Control Room; human/rules path used" });
    return null;
  }
  const c = getClient();
  if (!c) return null;

  const payload: Record<string, unknown> = { action: "process", inputs, context: { app: "TryOn AI", channel: "web" } };
  if (config.agenticorg.companyId) payload.company_id = config.agenticorg.companyId;
  try {
    const res = await c.mcp.call(tool, payload);
    const text = res.content?.map((x) => x.text).join("\n") ?? "";
    if (res.isError) throw new Error(text.slice(0, 300) || "tool error");
    const parsed = parseEnvelope(text) ?? extractJson(text);
    const { out, p } = unwrap(parsed);
    const confidence = Number(p?.confidence ?? out.confidence);
    await store.logAgentRun({
      ...base,
      ms: Date.now() - started,
      source: "agenticorg",
      ok: true,
      confidence: Number.isFinite(confidence) ? confidence : undefined,
      recommendation: out.recommendation ? String(out.recommendation) : undefined,
      hitl: Boolean(p?.hitl_trigger ?? out.hitl_trigger),
      output: text.slice(0, 4000),
    });
    return { text, parsed };
  } catch (err) {
    await store.logAgentRun({ ...base, ms: Date.now() - started, source: "agenticorg", ok: false, output: "", error: (err as Error).message });
    throw err;
  }
}

function interpret(agent: AgentKey, result: ToolResult, fallback: AgentAnalysis): AgentAnalysis {
  const { out, p } = unwrap(result.parsed);
  const confidence = Number(p?.confidence ?? out.confidence);
  const hitl = (p?.hitl_trigger ?? out.hitl_trigger) as string | undefined;
  const rec = String(out.recommendation ?? out.decision ?? "").toLowerCase();
  const flags = [...fallback.flags];
  if (hitl) flags.push(`AgenticOrg HITL trigger: ${hitl}`);
  return {
    source: "agenticorg",
    tool: TOOL[agent],
    summary: String(out.summary ?? out.answer ?? out.message ?? result.text ?? fallback.summary).slice(0, 1200),
    // Anything ambiguous (no explicit verdict, HITL trigger, no confidence) goes to a human
    recommendation: rec.includes("reject") ? "reject" : rec.includes("approve") && !hitl ? "approve" : "review",
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    flags,
    raw: result.parsed ?? result.text,
  };
}

async function analyze(agent: AgentKey, inputs: Record<string, unknown>, fallback: AgentAnalysis): Promise<AgentAnalysis> {
  try {
    const result = await runAgent(agent, inputs);
    return result ? interpret(agent, result, fallback) : fallback;
  } catch (err) {
    return { ...fallback, flags: [...fallback.flags, `AgenticOrg unavailable: ${(err as Error).message}`] };
  }
}

const rupees = (paise: number) => `Rs ${(paise / 100).toFixed(0)}`;

// ─── 1. AI Stylist Concierge ────────────────────────────────────────────────

export type ConciergeReply = { reply: string; productIds: string[]; source: "agenticorg" | "rules"; followUps: string[] };

const catalogBrief = () =>
  catalog.map((p) => `${p.id} | ${p.name} | ${rupees(p.pricePaise)} | ${p.category} | ${p.tags.join(", ")} | sizes ${p.sizes.join("/")}`).join("\n");

/** Rule-based matcher, used when AgenticOrg is off and to ground agent replies in the real catalog. */
function matchCatalog(message: string): Product[] {
  const q = message.toLowerCase();
  const budget = Number(q.match(/(?:under|below|less than|upto|up to|within|max|₹|rs\.?)\s*₹?\s*(\d[\d,]*)/)?.[1]?.replace(/,/g, ""));
  const scored = catalog
    .filter((p) => !Number.isFinite(budget) || p.pricePaise / 100 <= budget)
    .map((p) => {
      const hay = `${p.name} ${p.description} ${p.category} ${p.tags.join(" ")}`.toLowerCase();
      const score = q.split(/[^a-z]+/).filter((w) => w.length > 2 && hay.includes(w)).length;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score);
  const hits = scored.filter((s) => s.score > 0).map((s) => s.p);
  return (hits.length ? hits : scored.map((s) => s.p)).slice(0, 3);
}

export type PhotoProfile = { outfitColors: { name: string; share: number }[]; temperature: string; brightness: string; contrast: string };

// Classic pairings: what goes well with a dominant outfit colour
const PAIRS: Record<string, string[]> = {
  black: ["white", "red", "tan", "grey", "cream"], charcoal: ["white", "sky", "tangerine", "cream"], grey: ["navy", "white", "black", "plum"],
  white: ["navy", "black", "tan", "chambray", "red"], cream: ["tan", "olive", "navy", "brown"], beige: ["navy", "white", "olive", "black"],
  tan: ["white", "navy", "cream", "black"], brown: ["cream", "white", "sky", "olive"], navy: ["white", "tan", "grey", "red", "sky"],
  blue: ["white", "tan", "grey", "cream"], "sky blue": ["navy", "white", "tan", "grey"], teal: ["white", "cream", "tan"],
  olive: ["cream", "white", "tan", "black"], green: ["white", "cream", "navy"], mustard: ["navy", "grey", "white", "olive"],
  yellow: ["navy", "grey", "white"], orange: ["navy", "white", "cream", "grey"], red: ["white", "black", "navy", "grey"],
  maroon: ["cream", "grey", "navy", "white"], pink: ["white", "grey", "navy", "cream"], purple: ["grey", "white", "black"], plum: ["grey", "cream", "white"],
};

function photoPicks(profile: PhotoProfile): Product[] {
  const main = profile.outfitColors[0]?.name;
  const wants = (main && PAIRS[main]) || ["white", "navy", "tan"];
  const scored = catalog.map((p) => {
    const hay = `${p.color.name} ${p.name} ${p.tags.join(" ")}`.toLowerCase();
    let score = wants.reduce((s, w, i) => s + (hay.includes(w.split(" ")[0]) ? 4 - Math.min(3, i) : 0), 0);
    if (main && hay.includes(main.split(" ")[0])) score -= 2; // avoid head-to-toe same colour
    return { p, score };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, 3).map((s) => s.p);
}

export async function concierge(message: string, history: { role: "user" | "assistant"; text: string }[], photo?: PhotoProfile): Promise<ConciergeReply> {
  const followUps = ["Something for a wedding", "Casual under ₹1,200", "What layers well for monsoon?"];
  const photoLine = photo
    ? `The shopper uploaded a photo (analysed on their device). Outfit colours: ${photo.outfitColors.map((c) => `${c.name} ${c.share}%`).join(", ") || "unclear"}; overall ${photo.temperature}, ${photo.brightness}, ${photo.contrast}-contrast look. Recommend pieces that pair well with or upgrade this look, and say why in terms of colour.`
    : "";
  const fallback = (): ConciergeReply => {
    if (photo) {
      const picks = photoPicks(photo);
      const main = photo.outfitColors[0]?.name;
      return {
        reply: main
          ? `I can see a lot of ${main} in your photo. These pieces pair well with it: ${picks.map((p) => p.name).join(", ")}. Tap one to try it on with your photo.`
          : `Here are a few versatile pieces that work with most looks. Tap one to try it on.`,
        productIds: picks.map((p) => p.id),
        source: "rules",
        followUps: ["Something for a wedding", "A more casual option", "Match my colours instead"],
      };
    }
    const picks = matchCatalog(message);
    return {
      reply: picks.length
        ? `${picks.length === 1 ? "Here's a pick that fits" : "Here are a few picks that fit"} what you described. Tap one to try it on live.`
        : "I couldn't find a match. Tell me the occasion, your budget or a colour you like.",
      productIds: picks.map((p) => p.id),
      source: "rules",
      followUps,
    };
  };
  try {
    const result = await runAgent("concierge", {
      merchant_id: config.agenticorg.merchantId,
      query:
        `You are the AI stylist for an Indian fashion store with live virtual try-on. ` +
        `Recommend at most 3 products ONLY from this catalog (id | name | price | category | tags | sizes):\n${catalogBrief()}\n\n` +
        `Conversation so far:\n${history.slice(-6).map((h) => `${h.role}: ${h.text}`).join("\n")}\n` +
        `${photoLine ? photoLine + "\n" : ""}Shopper: ${message}\n\n` +
        `Reply as JSON {"reply": "<2-3 friendly sentences>", "product_ids": ["<id>"], "follow_ups": ["<short suggestion>"]}.`,
    });
    if (!result) return fallback();
    const { out } = unwrap(result.parsed);
    const ids = ((out.product_ids ?? out.productIds ?? []) as unknown[]).map(String).filter((id) => catalog.some((p) => p.id === id));
    // Ground the agent: if it named products but not ids, match names in its text
    const named = catalog.filter((p) => result.text.toLowerCase().includes(p.name.toLowerCase())).map((p) => p.id);
    const productIds = [...new Set([...ids, ...named])].slice(0, 3);
    const reply = String(out.reply ?? out.answer ?? out.summary ?? result.text).slice(0, 800);
    const fu = Array.isArray(out.follow_ups) ? (out.follow_ups as unknown[]).map(String).slice(0, 3) : followUps;
    const backup = photo ? photoPicks(photo) : matchCatalog(message);
    return { reply, productIds: productIds.length ? productIds : backup.map((p) => p.id), source: "agenticorg", followUps: fu };
  } catch {
    return fallback();
  }
}

// ─── 2. Fit Advisor ─────────────────────────────────────────────────────────

export async function recommendSize(input: {
  productName: string;
  category: string;
  sizes: string[];
  selectedSize: string;
  cameraHint?: Record<string, number>;
  question?: string;
}): Promise<AgentAnalysis> {
  const hint = input.cameraHint?.shoulderCm ? `Rough camera hint: shoulders ≈ ${input.cameraHint.shoulderCm} cm (unreliable).` : "No camera hint.";
  const fallback: AgentAnalysis = {
    source: "heuristic",
    summary: `Shopper picked ${input.selectedSize} for ${input.productName}. ${hint} Check against the size chart and the shopper's question.`,
    recommendation: "review",
    confidence: 0.3,
    flags: ["AgenticOrg unavailable: stylist must review from scratch"],
  };
  return analyze(
    "fit_advisor",
    {
      merchant_id: config.agenticorg.merchantId,
      query:
        `Act as a fit stylist. Product: ${input.productName} (${input.category}), sizes ${input.sizes.join("/")}. ` +
        `Shopper selected ${input.selectedSize}. ${hint} Camera estimates are rough; prefer the size chart and the shopper's preference. ` +
        `${input.question ? `Customer asks: ${input.question}. ` : ""}Reply as JSON {"recommendation": "review", "size": "", "confidence": 0-1, "summary": ""}.`,
    },
    fallback,
  );
}

// ─── 3. Order Guardian ──────────────────────────────────────────────────────

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
    "order_guardian",
    {
      merchant_id: config.agenticorg.merchantId,
      order_id: order.id,
      query:
        `Review this apparel order before payment. Reply as JSON {"recommendation": "approve|reject|review", "confidence": 0-1, "summary": ""}. ` +
        `Items: ${order.items.map((i) => `${i.quantity}x ${i.name} size ${i.size} @ ${rupees(i.unitPricePaise)}`).join("; ")}. ` +
        `Total ${rupees(order.totalPaise)}. Ship to ${order.customer.city}, ${order.customer.state} ${order.customer.pincode}. Flags: ${flags.join(", ") || "none"}.`,
    },
    fallback,
  );
}

// ─── 4. Returns Desk ────────────────────────────────────────────────────────

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
    "returns_desk",
    {
      order_id: order.id,
      query: `Assess this refund request. Reply as JSON {"recommendation": "approve|reject|review", "confidence": 0-1, "summary": ""}. Order ${order.id}, paid ${rupees(order.totalPaise)}, refund ${rupees(amountPaise)}, reason: ${reason}.`,
    },
    fallback,
  );
}

// ─── 5. Payment Reconciliation ──────────────────────────────────────────────

export type ReconLine = { orderId: string; appStatus: string; pinelabsStatus: string; amountPaise: number; issue?: string };
export type ReconReport = { at: string; checked: number; mismatches: ReconLine[]; lines: ReconLine[]; summary: string; source: "agenticorg" | "rules" };

const PAID_STATES = ["PROCESSED"];

export async function reconcile(): Promise<ReconReport> {
  const orders = (await store.listOrders()).filter((o) => o.attempts.length);
  const lines: ReconLine[] = [];
  for (const o of orders.slice(0, 50)) {
    const attempt = o.attempts.at(-1)!;
    let pl = "UNKNOWN";
    try {
      pl = o.demo ? (attempt.status ?? "CREATED") : (await fetchPlOrder(attempt.pinelabsOrderId)).status;
    } catch (e) {
      pl = `ERROR: ${(e as Error).message.slice(0, 80)}`;
    }
    const plPaid = PAID_STATES.includes(pl.toUpperCase());
    const appPaid = o.status === "paid";
    let issue: string | undefined;
    if (plPaid && !appPaid && !["refunded", "partially_refunded", "payment_mismatch"].includes(o.status)) issue = "Paid at Pine Labs but not marked paid in app";
    if (o.status === "payment_mismatch") issue = "Pine Labs data didn't match the order (amount, currency or reference)";
    const refundedOk = ["refunded", "partially_refunded"].includes(o.status) && o.refund?.status === "processed" && (plPaid || /REFUNDED/i.test(pl));
    if (refundedOk) issue = undefined;
    else if (["refunded", "partially_refunded"].includes(o.status) && !issue) issue = "Marked refunded in app but the refund isn't confirmed by Pine Labs";
    if (pl === "AUTHORIZED") issue = "Authorized but not captured";
    if (!plPaid && appPaid) issue = "Marked paid in app but Pine Labs does not show a successful payment";
    if (pl.startsWith("ERROR")) issue = "Could not fetch status from Pine Labs";
    lines.push({ orderId: o.id, appStatus: o.status, pinelabsStatus: pl, amountPaise: o.totalPaise, issue });
  }
  const mismatches = lines.filter((l) => l.issue);
  const rulesSummary = mismatches.length
    ? `${mismatches.length} of ${lines.length} orders need attention.`
    : `All ${lines.length} orders with payments match Pine Labs.`;
  let summary = rulesSummary;
  let source: ReconReport["source"] = "rules";
  try {
    const result = await runAgent("reconciliation", {
      query:
        `Reconcile these e-commerce orders against payment gateway status and explain each mismatch with a recommended action. ` +
        `Reply as JSON {"summary": ""}.\n${JSON.stringify(mismatches.length ? mismatches : lines.slice(0, 20))}`,
    });
    if (result) {
      const { out } = unwrap(result.parsed);
      summary = String(out.summary ?? out.answer ?? result.text).slice(0, 1500);
      source = "agenticorg";
    }
  } catch {
    /* keep rules summary */
  }
  return { at: new Date().toISOString(), checked: lines.length, mismatches, lines, summary, source };
}

// ─── Audit mirror ───────────────────────────────────────────────────────────

/** Optional: mirror the approval as an AgenticOrg governed case so it shows in its audit trail. */
export async function mirrorCase(approval: Approval): Promise<string | undefined> {
  const c = getClient();
  if (!c || !config.agenticorg.mirrorCases) return undefined;
  try {
    const res = await c.cases.submit(
      { approval_id: approval.id, kind: approval.kind, order_id: approval.orderId, analysis: approval.analysis.summary },
      `tryon_ai_${approval.kind}`,
    );
    return String(res.case_ref ?? res.id ?? "");
  } catch {
    return undefined;
  }
}

export { agentUnit };
