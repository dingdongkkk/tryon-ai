import "server-only";
import type { sqliteStore as SqliteStore } from "./sqliteStore";

// Storage facade. Postgres when DATABASE_URL is set (serverless/production), SQLite otherwise
// (local dev, tests, single server). Backends load lazily so serverless never touches node:sqlite.

export { newId, newSecret, hashSecret } from "./ids";

type Store = typeof SqliteStore;
const backend = async (): Promise<Store> =>
  process.env.DATABASE_URL ? (await import("./pgStore")).pgStore : (await import("./sqliteStore")).sqliteStore;

export const store = new Proxy({} as Store, {
  get: (_t, key: keyof Store) =>
    async (...args: unknown[]) => {
      const b = await backend();
      return (b[key] as (...a: unknown[]) => unknown)(...args);
    },
}) as Store;
