import { createHash, randomBytes, randomUUID } from "node:crypto";

export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
export const newSecret = () => randomBytes(24).toString("base64url");
export const hashSecret = (s: string) => createHash("sha256").update(s).digest("hex");
