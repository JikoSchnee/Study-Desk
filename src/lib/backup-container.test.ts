import { describe, expect, it } from "vitest";
import { decryptStudyDeskContainer, encryptStudyDeskContainer, isStudyDeskContainer, type TransferKeyRing } from "./backup-container";

const ring: TransferKeyRing = { currentVersion: 3, keys: { 3: Buffer.alloc(32, 7), 2: Buffer.alloc(32, 4) } };

describe("Study Desk encrypted transfer container", () => {
  it("round-trips without exposing JSON or ZIP signatures", () => {
    const encrypted = encryptStudyDeskContainer({ version: 8, secret: "private-card" }, ring);
    expect(isStudyDeskContainer(encrypted)).toBe(true);
    expect(encrypted.subarray(0, 1).toString()).not.toBe("{");
    expect(encrypted.subarray(0, 2).toString()).not.toBe("PK");
    expect(encrypted.includes(Buffer.from("private-card"))).toBe(false);
    expect(decryptStudyDeskContainer(encrypted, ring)).toEqual({ version: 8, secret: "private-card" });
  });

  it("rejects tampering, truncation and unknown key versions", () => {
    const encrypted = encryptStudyDeskContainer({ ok: true }, ring);
    const changed = Buffer.from(encrypted); changed[changed.length - 20] ^= 1;
    expect(() => decryptStudyDeskContainer(changed, ring)).toThrow(/损坏|修改/);
    expect(() => decryptStudyDeskContainer(encrypted.subarray(0, 20), ring)).toThrow();
    expect(() => decryptStudyDeskContainer(encrypted, { currentVersion: 4, keys: { 4: Buffer.alloc(32, 9) } })).toThrow(/密钥版本/);
  });
});
