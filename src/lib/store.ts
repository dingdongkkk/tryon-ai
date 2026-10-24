import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Approval, Order } from "./types";
import type { AgentKey, AgentRun } from "./agents";

// Minimal JSON-file persistence for local development. Swap for Postgres/Supabase in production.
type DB = {
  orders: Record<string, Order>;
  approvals: Record<string, Approval>;
  agentRuns?: AgentRun[];
  disabledAgents?: AgentKey[];
};

const MAX_RUNS = 500;

const DB_PATH = path.join(process.cwd(), ".data", "db.json");
let queue: Promise<unknown> = Promise.resolve();

async function read(): Promise<DB> {
  try {
    return JSON.parse(await fs.readFile(DB_PATH, "utf8")) as DB;
  } catch {
    return { orders: {}, approvals: {} };
  }
}

async function write(db: DB) {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  const tmp = `${DB_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, DB_PATH);
}

/** Serialize read-modify-write cycles so concurrent requests don't clobber each other. */
function mutate<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const db = await read();
    const result = await fn(db);
    await write(db);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
const now = () => new Date().toISOString();

export const store = {
  async getOrder(id: string) {
    return (await read()).orders[id];
  },
  async listOrders() {
    return Object.values((await read()).orders).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  saveOrder(order: Order) {
    return mutate((db) => {
      db.orders[order.id] = order;
      return order;
    });
  },
  updateOrder(id: string, patch: Partial<Order>, event?: string) {
    return mutate((db) => {
      const order = db.orders[id];
      if (!order) throw new Error(`Order ${id} not found`);
      Object.assign(order, patch, { updatedAt: now() });
      if (event) order.history.push({ at: now(), event });
      return order;
    });
  },

  async getApproval(id: string) {
    return (await read()).approvals[id];
  },
  async listApprovals(status?: Approval["status"]) {
    return Object.values((await read()).approvals)
      .filter((a) => !status || a.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  saveApproval(approval: Approval) {
    return mutate((db) => {
      db.approvals[approval.id] = approval;
      return approval;
    });
  },
  /** Atomically move a pending approval to a decided state; returns null if it was already decided. */
  decideApproval(id: string, decision: { status: "approved" | "rejected"; by: string; note?: string; stylistSize?: string }) {
    return mutate((db) => {
      const a = db.approvals[id];
      if (!a || a.status !== "pending") return null;
      a.status = decision.status;
      a.decidedBy = decision.by;
      a.decidedAt = now();
      a.note = decision.note;
      if (a.stylist && decision.stylistSize) a.stylist.stylistSize = decision.stylistSize;
      return a;
    });
  },

  logAgentRun(run: AgentRun) {
    return mutate((db) => {
      db.agentRuns = [run, ...(db.agentRuns ?? [])].slice(0, MAX_RUNS);
    });
  },
  async listAgentRuns(agent?: AgentKey) {
    const runs = (await read()).agentRuns ?? [];
    return agent ? runs.filter((r) => r.agent === agent) : runs;
  },
  async disabledAgents() {
    return (await read()).disabledAgents ?? [];
  },
  setAgentEnabled(agent: AgentKey, enabled: boolean) {
    return mutate((db) => {
      const set = new Set(db.disabledAgents ?? []);
      if (enabled) set.delete(agent);
      else set.add(agent);
      db.disabledAgents = [...set];
      return db.disabledAgents;
    });
  },
};
