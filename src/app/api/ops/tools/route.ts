import { NextResponse } from "next/server";
import { listTools } from "@/lib/agenticorg";
import { jsonError } from "@/lib/http";

// Console only. Lists AgenticOrg MCP tools so you can pick AGENTICORG_*_TOOL values.
export async function GET() {
  try {
    const tools = await listTools();
    return NextResponse.json({ tools: tools.map((t) => ({ name: t.name, description: t.description })) });
  } catch (err) {
    return jsonError(err, 502);
  }
}
