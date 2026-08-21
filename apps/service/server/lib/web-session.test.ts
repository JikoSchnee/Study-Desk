import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@service/lib/service-supabase", () => ({ createServiceSupabase: vi.fn() }));

import { decryptWebSecret, encryptWebSecret, webTokenHash } from "./web-session";

describe("browser session encryption", () => {
  beforeEach(() => { process.env.STUDY_DESK_WEB_SESSION_KEY = Buffer.alloc(32, 19).toString("base64"); });

  it("encrypts session material and detects tampering", () => {
    const ciphertext = encryptWebSecret({ access_token: "private-access-token" });
    expect(ciphertext).not.toContain("private-access-token");
    expect(decryptWebSecret(ciphertext)).toEqual({ access_token: "private-access-token" });
    const parts = ciphertext.split(".");
    const encrypted = Buffer.from(parts[2], "base64url");
    encrypted[0] ^= 1;
    parts[2] = encrypted.toString("base64url");
    expect(() => decryptWebSecret(parts.join("."))).toThrow();
  });

  it("stores only a one-way hash of opaque cookie tokens", () => {
    expect(webTokenHash("opaque-session-token")).toMatch(/^[0-9a-f]{64}$/);
    expect(webTokenHash("opaque-session-token")).not.toContain("opaque-session-token");
  });

  it("rejects keys that are not exactly 32 bytes", () => {
    process.env.STUDY_DESK_WEB_SESSION_KEY = Buffer.alloc(16).toString("base64");
    expect(() => encryptWebSecret({ value: 1 })).toThrow("32 字节");
  });
});
