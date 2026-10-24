import { describe, expect, it, vi } from "vitest";

vi.mock("agenticorg-sdk", () => ({ AgenticOrg: class {} }));
vi.mock("@/lib/pinelabs", () => ({ fetchPlOrder: vi.fn() }));
vi.mock("@/lib/store", () => ({ store: {}, newId: () => "x" }));

describe("AgenticOrg MCP envelope", () => {
  it("lifts status, confidence and HITL out of the text reply (real hackathon response shape)", async () => {
    const { parseEnvelope } = await import("@/lib/agenticorg");
    const text = 'Agent: Chat Agent\nStatus: hitl_triggered\nConfidence: 73%\nResult: {\n  "reply": "Two red dresses",\n  "product_ids": ["1402", "1403"]\n}\n\nHITL Triggered: confidence 0.730 < floor 0.88\nA human reviewer needs to approve this action.';
    expect(parseEnvelope(text)).toEqual({
      status: "hitl_triggered",
      confidence: 0.73,
      hitl_trigger: "confidence 0.730 < floor 0.88",
      output: { reply: "Two red dresses", product_ids: ["1402", "1403"] },
    });
  });

  it("handles a completed run without HITL", async () => {
    const { parseEnvelope } = await import("@/lib/agenticorg");
    const p = parseEnvelope('Agent: Risk Sentinel\nStatus: completed\nConfidence: 94%\nResult: {"recommendation":"approve","summary":"ok"}');
    expect(p).toMatchObject({ status: "completed", confidence: 0.94, hitl_trigger: undefined, output: { recommendation: "approve" } });
  });
});
