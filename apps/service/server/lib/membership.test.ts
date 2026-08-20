import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyPaddleSignature } from "./membership";

describe("Paddle webhook verification", () => {
  it("accepts a fresh valid signature and rejects changed payloads", () => {
    const secret = "pdl_webhook_secret"; const timestamp = Math.floor(Date.now() / 1000); const body = '{"event_id":"evt_1"}';
    const h1 = createHmac("sha256", secret).update(`${timestamp}:${body}`).digest("hex");
    expect(verifyPaddleSignature(body, `ts=${timestamp};h1=${h1}`, secret)).toBe(true);
    expect(verifyPaddleSignature(`${body} `, `ts=${timestamp};h1=${h1}`, secret)).toBe(false);
  });

  it("rejects stale and missing signatures", () => {
    const stale = Math.floor(Date.now() / 1000) - 600; const secret = "secret"; const body = "{}"; const h1 = createHmac("sha256", secret).update(`${stale}:${body}`).digest("hex");
    expect(verifyPaddleSignature(body, `ts=${stale};h1=${h1}`, secret)).toBe(false);
    expect(verifyPaddleSignature(body, null, secret)).toBe(false);
  });
});
