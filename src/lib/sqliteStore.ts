import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Approval, ApprovalStatus, Order } from "./types";
import type { AgentKey, AgentRun } from "./agents";

// SQLite backend (WAL, transactional): local development, tests and single-server hosting.

const MAX_RUNS = 1000;

function open() {
  const dir = process.env.DATA_DIR || path.join(process.cwd(), ".data");
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "wearable.sqlite"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, status TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS agent_runs (id TEXT PRIMARY KEY, agent TEXT NOT NULL, at TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS processed_events (id TEXT PRIMARY KEY, at TEXT NOT NULL);
  `);
  return db;
}

const g = globalThis as unknown as { __wearableDb?: DatabaseSync; __wearableDbDir?: string };
function db() {
  // re-open if DATA_DIR changed (tests)
  if (!g.__wearableDb || g.__wearableDbDir !== process.env.DATA_DIR) {
    g.__wearableDb?.close();
    g.__wearableDb = open();
    g.__wearableDbDir = process.env.DATA_DIR;
  }
  return g.__wearableDb;
}

function tx<T>(fn: (d: DatabaseSync) => T): T {
  const d = db();
  d.exec("BEGIN IMMEDIATE");
  try {
    const r = fn(d);
    d.exec("COMMIT");
    return r;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

const now = () => new Date().toISOString();

const getOrderRow = (d: DatabaseSync, id: string) => {
  const row = d.prepare("SELECT data FROM orders WHERE id = ?").get(id) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as Order) : undefined;
};
const putOrder = (d: DatabaseSync, o: Order) =>
  d.prepare("INSERT INTO orders (id, created_at, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data").run(o.id, o.createdAt, JSON.stringify(o));
const getApprovalRow = (d: DatabaseSync, id: string) => {
  const row = d.prepare("SELECT data FROM approvals WHERE id = ?").get(id) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as Approval) : undefined;
};
const putApproval = (d: DatabaseSync, a: Approval) =>
  d
    .prepare("INSERT INTO approvals (id, status, created_at, data) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, data = excluded.data")
    .run(a.id, a.status, a.createdAt, JSON.stringify(a));

export const sqliteStore = {
  async getOrder(id: string) {
    return getOrderRow(db(), id);
  },
  async listOrders() {
    return (db().prepare("SELECT data FROM orders ORDER BY created_at DESC").all() as { data: string }[]).map((r) => JSON.parse(r.data) as Order);
  },
  async saveOrder(order: Order) {
    tx((d) => putOrder(d, order));
    return order;
  },
  /**
   * Atomic read-modify-write. `fn` mutates the order in place and may return false to skip
   * the write (e.g. the transition isn't allowed from the current state).
   */
  async updateOrder(id: string, fn: (o: Order) => void | false, event?: string) {
    return tx((d) => {
      const o = getOrderRow(d, id);
      if (!o) throw new Error(`Order ${id} not found`);
      if (fn(o) === false) return { order: o, changed: false };
      o.updatedAt = now();
      if (event) o.history.push({ at: now(), event });
      putOrder(d, o);
      return { order: o, changed: true };
    });
  },

  async getApproval(id: string) {
    return getApprovalRow(db(), id);
  },
  async listApprovals(status?: ApprovalStatus) {
    const rows = status
      ? db().prepare("SELECT data FROM approvals WHERE status = ? ORDER BY created_at DESC").all(status)
      : db().prepare("SELECT data FROM approvals ORDER BY created_at DESC").all();
    return (rows as { data: string }[]).map((r) => JSON.parse(r.data) as Approval);
  },
  async saveApproval(a: Approval) {
    tx((d) => putApproval(d, a));
    return a;
  },
  /** Atomically move a pending approval to a decided state; null if missing or already decided. */
  async decideApproval(id: string, decision: { status: "approved" | "rejected"; by: string; note?: string; stylistSize?: string }) {
    return tx((d) => {
      const a = getApprovalRow(d, id);
      if (!a || a.status !== "pending") return null;
      a.status = decision.status;
      a.decidedBy = decision.by;
      a.decidedAt = now();
      a.note = decision.note;
      if (a.stylist && decision.stylistSize) a.stylist.stylistSize = decision.stylistSize;
      putApproval(d, a);
      return a;
    });
  },

  async isEventProcessed(eventId: string) {
    return Boolean(db().prepare("SELECT 1 FROM processed_events WHERE id = ?").get(eventId));
  },
  /** Returns true the first time an event id is recorded (dedupe webhooks/callbacks). */
  async markEventProcessed(eventId: string) {
    const r = db().prepare("INSERT OR IGNORE INTO processed_events (id, at) VALUES (?, ?)").run(eventId, now());
    return Number(r.changes) > 0;
  },

  async logAgentRun(run: AgentRun) {
    tx((d) => {
      d.prepare("INSERT INTO agent_runs (id, agent, at, data) VALUES (?, ?, ?, ?)").run(run.id, run.agent, run.at, JSON.stringify(run));
      d.prepare("DELETE FROM agent_runs WHERE id NOT IN (SELECT id FROM agent_runs ORDER BY at DESC LIMIT ?)").run(MAX_RUNS);
    });
  },
  async listAgentRuns(agent?: AgentKey, limit = 200) {
    const rows = agent
      ? db().prepare("SELECT data FROM agent_runs WHERE agent = ? ORDER BY at DESC LIMIT ?").all(agent, limit)
      : db().prepare("SELECT data FROM agent_runs ORDER BY at DESC LIMIT ?").all(limit);
    return (rows as { data: string }[]).map((r) => JSON.parse(r.data) as AgentRun);
  },
  async disabledAgents(): Promise<AgentKey[]> {
    const row = db().prepare("SELECT value FROM settings WHERE key = 'disabled_agents'").get() as { value: string } | undefined;
    return row ? JSON.parse(row.value) : [];
  },
  async setAgentEnabled(agent: AgentKey, enabled: boolean) {
    return tx((d) => {
      const row = d.prepare("SELECT value FROM settings WHERE key = 'disabled_agents'").get() as { value: string } | undefined;
      const set = new Set<AgentKey>(row ? JSON.parse(row.value) : []);
      if (enabled) set.delete(agent);
      else set.add(agent);
      d.prepare("INSERT INTO settings (key, value) VALUES ('disabled_agents', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify([...set]));
      return [...set];
    });
  },
};
