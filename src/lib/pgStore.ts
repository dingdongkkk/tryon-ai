import "server-only";
import postgres from "postgres";
import type { Approval, ApprovalStatus, Order } from "./types";
import type { AgentKey, AgentRun } from "./agents";

// Postgres backend (e.g. Supabase): used whenever DATABASE_URL is set, required for serverless hosting.
// Same contract as the SQLite backend; read-modify-write paths lock the row (SELECT … FOR UPDATE).

const MAX_RUNS = 1000;
const now = () => new Date().toISOString();

type Sql = ReturnType<typeof postgres>;
const g = globalThis as unknown as { __tryonPg?: Sql; __tryonPgReady?: Promise<void> };

function sql(): Sql {
  // prepare:false works with Supabase's transaction pooler (port 6543)
  g.__tryonPg ??= postgres(process.env.DATABASE_URL!, { max: 3, idle_timeout: 20, prepare: false, ssl: process.env.DATABASE_SSL === "false" ? false : "require" });
  return g.__tryonPg;
}

async function ready() {
  g.__tryonPgReady ??= sql()
    .unsafe(`
      CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, data JSONB NOT NULL);
      CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, status TEXT NOT NULL, created_at TEXT NOT NULL, data JSONB NOT NULL);
      CREATE INDEX IF NOT EXISTS approvals_status_idx ON approvals (status, created_at DESC);
      CREATE TABLE IF NOT EXISTS agent_runs (id TEXT PRIMARY KEY, agent TEXT NOT NULL, at TEXT NOT NULL, data JSONB NOT NULL);
      CREATE INDEX IF NOT EXISTS agent_runs_at_idx ON agent_runs (at DESC);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value JSONB NOT NULL);
      CREATE TABLE IF NOT EXISTS processed_events (id TEXT PRIMARY KEY, at TEXT NOT NULL);
    `)
    .then(() => undefined)
    .catch((e) => {
      g.__tryonPgReady = undefined;
      throw e;
    });
  return g.__tryonPgReady;
}

const json = (v: unknown) => sql().json(v as Parameters<Sql["json"]>[0]);

export const pgStore = {
  async getOrder(id: string) {
    await ready();
    const [r] = await sql()<{ data: Order }[]>`SELECT data FROM orders WHERE id = ${id}`;
    return r?.data;
  },
  async listOrders() {
    await ready();
    return (await sql()<{ data: Order }[]>`SELECT data FROM orders ORDER BY created_at DESC`).map((r) => r.data);
  },
  async saveOrder(order: Order) {
    await ready();
    await sql()`INSERT INTO orders (id, created_at, data) VALUES (${order.id}, ${order.createdAt}, ${json(order)})
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`;
    return order;
  },
  async updateOrder(id: string, fn: (o: Order) => void | false, event?: string) {
    await ready();
    return sql().begin(async (tx) => {
      const [r] = await tx<{ data: Order }[]>`SELECT data FROM orders WHERE id = ${id} FOR UPDATE`;
      if (!r) throw new Error(`Order ${id} not found`);
      const o = r.data;
      if (fn(o) === false) return { order: o, changed: false };
      o.updatedAt = now();
      if (event) o.history.push({ at: now(), event });
      await tx`UPDATE orders SET data = ${json(o)} WHERE id = ${id}`;
      return { order: o, changed: true };
    }) as Promise<{ order: Order; changed: boolean }>;
  },

  async getApproval(id: string) {
    await ready();
    const [r] = await sql()<{ data: Approval }[]>`SELECT data FROM approvals WHERE id = ${id}`;
    return r?.data;
  },
  async listApprovals(status?: ApprovalStatus) {
    await ready();
    const rows = status
      ? await sql()<{ data: Approval }[]>`SELECT data FROM approvals WHERE status = ${status} ORDER BY created_at DESC`
      : await sql()<{ data: Approval }[]>`SELECT data FROM approvals ORDER BY created_at DESC`;
    return rows.map((r) => r.data);
  },
  async saveApproval(a: Approval) {
    await ready();
    await sql()`INSERT INTO approvals (id, status, created_at, data) VALUES (${a.id}, ${a.status}, ${a.createdAt}, ${json(a)})
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, data = EXCLUDED.data`;
    return a;
  },
  async decideApproval(id: string, decision: { status: "approved" | "rejected"; by: string; note?: string; stylistSize?: string }) {
    await ready();
    return sql().begin(async (tx) => {
      const [r] = await tx<{ data: Approval }[]>`SELECT data FROM approvals WHERE id = ${id} FOR UPDATE`;
      const a = r?.data;
      if (!a || a.status !== "pending") return null;
      a.status = decision.status;
      a.decidedBy = decision.by;
      a.decidedAt = now();
      a.note = decision.note;
      if (a.stylist && decision.stylistSize) a.stylist.stylistSize = decision.stylistSize;
      await tx`UPDATE approvals SET status = ${a.status}, data = ${json(a)} WHERE id = ${id}`;
      return a;
    }) as Promise<Approval | null>;
  },

  async isEventProcessed(eventId: string) {
    await ready();
    return (await sql()`SELECT 1 FROM processed_events WHERE id = ${eventId}`).length > 0;
  },
  async markEventProcessed(eventId: string) {
    await ready();
    const r = await sql()`INSERT INTO processed_events (id, at) VALUES (${eventId}, ${now()}) ON CONFLICT (id) DO NOTHING RETURNING id`;
    return r.length > 0;
  },

  async logAgentRun(run: AgentRun) {
    await ready();
    await sql()`INSERT INTO agent_runs (id, agent, at, data) VALUES (${run.id}, ${run.agent}, ${run.at}, ${json(run)})`;
    // prune occasionally rather than on every write
    if (Math.random() < 0.05) await sql()`DELETE FROM agent_runs WHERE id NOT IN (SELECT id FROM agent_runs ORDER BY at DESC LIMIT ${MAX_RUNS})`;
  },
  async listAgentRuns(agent?: AgentKey, limit = 200) {
    await ready();
    const rows = agent
      ? await sql()<{ data: AgentRun }[]>`SELECT data FROM agent_runs WHERE agent = ${agent} ORDER BY at DESC LIMIT ${limit}`
      : await sql()<{ data: AgentRun }[]>`SELECT data FROM agent_runs ORDER BY at DESC LIMIT ${limit}`;
    return rows.map((r) => r.data);
  },
  async getSetting<T>(key: string): Promise<T | undefined> {
    await ready();
    const [r] = await sql()<{ value: T }[]>`SELECT value FROM settings WHERE key = ${key}`;
    return r?.value;
  },
  async setSetting(key: string, value: unknown) {
    await ready();
    await sql()`INSERT INTO settings (key, value) VALUES (${key}, ${json(value)}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  },
  async disabledAgents(): Promise<AgentKey[]> {
    await ready();
    const [r] = await sql()<{ value: AgentKey[] }[]>`SELECT value FROM settings WHERE key = 'disabled_agents'`;
    return r?.value ?? [];
  },
  async setAgentEnabled(agent: AgentKey, enabled: boolean) {
    await ready();
    return sql().begin(async (tx) => {
      const [r] = await tx<{ value: AgentKey[] }[]>`SELECT value FROM settings WHERE key = 'disabled_agents' FOR UPDATE`;
      const set = new Set<AgentKey>(r?.value ?? []);
      if (enabled) set.delete(agent);
      else set.add(agent);
      const list = [...set];
      await tx`INSERT INTO settings (key, value) VALUES ('disabled_agents', ${json(list)}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
      return list;
    }) as Promise<AgentKey[]>;
  },
};
