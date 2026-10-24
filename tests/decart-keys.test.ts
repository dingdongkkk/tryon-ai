import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Decart key rotation: primary first, backups when a key is out of credits or rejected.
const create = vi.fn();
let dir = "";

async function load(failing: string[]) {
  vi.resetModules();
  dir = mkdtempSync(path.join(tmpdir(), "tryon-decart-"));
  vi.stubEnv("DATA_DIR", dir);
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("APP_URL", "https://tryon.example");
  vi.stubEnv("DECART_API_KEY", "dct_primary_aaaaaaaa");
  vi.stubEnv("DECART_API_KEYS_FALLBACK", "dct_backup1_bbbbbbbb, dct_backup2_cccccccc");
  create.mockReset();
  vi.doMock("@decartai/sdk", () => ({
    createDecartClient: ({ apiKey }: { apiKey: string }) => ({
      tokens: {
        create: async () => {
          create(apiKey);
          if (failing.includes(apiKey)) throw new Error("402 Payment Required: insufficient credits");
          return { apiKey: `tok_for_${apiKey}`, expiresAt: "2030-01-01T00:00:00Z" };
        },
      },
    }),
  }));
  return import("@/lib/decartKeys");
}

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("Decart key rotation", () => {
  it("uses the primary key while it has credits", async () => {
    const { mintToken } = await load([]);
    const t = await mintToken();
    expect(t.keyIndex).toBe(0);
    expect(t.apiKey).toBe("tok_for_dct_primary_aaaaaaaa");
  });

  it("falls through to the first backup when the primary is out of credits, and remembers it", async () => {
    const { mintToken } = await load(["dct_primary_aaaaaaaa"]);
    expect((await mintToken()).keyIndex).toBe(1);
    create.mockClear();
    expect((await mintToken()).keyIndex).toBe(1);
    expect(create).toHaveBeenCalledTimes(1); // the exhausted primary isn't retried
  });

  it("a key reported exhausted by the browser is skipped next time", async () => {
    const { mintToken, markExhausted } = await load([]);
    await markExhausted(0);
    expect((await mintToken()).keyIndex).toBe(1);
    await markExhausted(1);
    expect((await mintToken()).keyIndex).toBe(2);
  });

  it("errors clearly when every key is out of credits", async () => {
    const { mintToken } = await load(["dct_primary_aaaaaaaa", "dct_backup1_bbbbbbbb", "dct_backup2_cccccccc"]);
    await expect(mintToken()).rejects.toThrow(/All Decart keys are unavailable/);
  });
});
