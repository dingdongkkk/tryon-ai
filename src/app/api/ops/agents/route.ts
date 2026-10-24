import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { AGENT_UNITS, type AgentKey } from "@/lib/agents";
import { agentTools } from "@/lib/agenticorg";
import { config } from "@/lib/config";
import { jsonError } from "@/lib/http";

// Console only. Fleet status, run log and kill switches for the AgenticOrg units.
export async function GET() {
  const [runs, disabled] = await Promise.all([store.listAgentRuns(undefined, 300), store.disabledAgents()]);
  const tools = agentTools();
  const units = AGENT_UNITS.map((u) => {
    const mine = runs.filter((r) => r.agent === u.key && r.source === "agenticorg");
    const ok = mine.filter((r) => r.ok);
    const conf = ok.map((r) => r.confidence).filter((c): c is number => typeof c === "number");
    return {
      ...u,
      tool: tools[u.key],
      enabled: !disabled.includes(u.key),
      runs: mine.length,
      failures: mine.length - ok.length,
      avgConfidence: conf.length ? conf.reduce((a, b) => a + b, 0) / conf.length : null,
      hitlRate: ok.length ? ok.filter((r) => r.hitl).length / ok.length : null,
      avgMs: ok.length ? Math.round(ok.reduce((a, r) => a + r.ms, 0) / ok.length) : null,
      lastRunAt: runs.find((r) => r.agent === u.key)?.at ?? null,
    };
  });
  return NextResponse.json({ connected: config.agenticorg.enabled, baseUrl: config.agenticorg.baseUrl, units, runs: runs.slice(0, 100) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const agent = String(body?.agent) as AgentKey;
    if (!AGENT_UNITS.some((u) => u.key === agent)) throw new Error("Unknown agent");
    const disabled = await store.setAgentEnabled(agent, body?.enabled === true);
    return NextResponse.json({ disabled });
  } catch (err) {
    return jsonError(err);
  }
}
