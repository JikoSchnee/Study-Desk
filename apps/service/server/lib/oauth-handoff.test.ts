import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@service/lib/service-supabase", () => ({
  createServiceSupabase: () => supabaseMock,
}));

import {
  codeChallenge,
  consumeOAuthHandoff,
  decryptAuthSecret,
  desktopCallback,
  encryptAuthSecret,
  publicOAuthError,
  startOAuthFlow,
  tokenHash,
} from "./oauth-handoff";

const key = Buffer.alloc(32, 7).toString("base64");

describe("Google OAuth PKCE handoff", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    process.env.STUDY_DESK_AUTH_HANDOFF_KEY = key;
    process.env.STUDY_DESK_PUBLIC_URL = "https://study-desk.jiko-official.top";
    supabaseMock.from.mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("encrypts authenticated data and rejects ciphertext changes", () => {
    const ciphertext = encryptAuthSecret({ access_token: "secret-token" });
    expect(ciphertext).not.toContain("secret-token");
    expect(decryptAuthSecret(ciphertext)).toEqual({ access_token: "secret-token" });

    const parts = ciphertext.split(".");
    const encrypted = Buffer.from(parts[2], "base64url");
    encrypted[0] ^= 1;
    parts[2] = encrypted.toString("base64url");
    expect(() => decryptAuthSecret(parts.join("."))).toThrow();
  });

  it("creates a PKCE authorization URL without exposing the verifier", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    supabaseMock.from.mockReturnValue({ insert });

    const result = await startOAuthFlow({ intent: "sign-in" });
    const url = new URL(result.authorizationUrl);
    const inserted = insert.mock.calls[0][0] as { verifier_ciphertext: string };
    const verifier = decryptAuthSecret<string>(inserted.verifier_ciphertext);

    expect(url.origin).toBe("https://project.supabase.co");
    expect(url.pathname).toBe("/auth/v1/authorize");
    expect(url.searchParams.get("provider")).toBe("google");
    expect(url.searchParams.get("scopes")).toBe("openid email profile");
    expect(url.searchParams.get("redirect_to")).toMatch(/^https:\/\/study-desk\.jiko-official\.top\/api\/service\/auth\/oauth\/callback\//);
    expect(url.searchParams.get("code_challenge")).toBe(codeChallenge(verifier));
    expect(result.authorizationUrl).not.toContain(verifier);
  });

  it("allows a handoff token to be consumed only once", async () => {
    const handoff = "handoff-token-that-is-long-enough-for-a-test";
    const session = { access_token: "access", refresh_token: "refresh", user: { id: "user-1", email: "user@example.com" } };
    const maybeSingle = vi.fn()
      .mockResolvedValueOnce({ data: { result_ciphertext: encryptAuthSecret(session), intent: "sign-in", initiating_user_id: null }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const builder = {
      eq: vi.fn(), is: vi.fn(), gt: vi.fn(), select: vi.fn(), maybeSingle,
    };
    Object.values(builder).slice(0, 4).forEach((method) => method.mockReturnValue(builder));
    supabaseMock.from.mockReturnValue({ update: vi.fn().mockReturnValue(builder) });

    await expect(consumeOAuthHandoff(handoff)).resolves.toEqual({ session, intent: "sign-in" });
    await expect(consumeOAuthHandoff(handoff)).rejects.toThrow("已过期或已使用");
    expect(builder.eq).toHaveBeenCalledWith("handoff_hash", tokenHash(handoff));
    expect(builder.eq).not.toHaveBeenCalledWith("handoff_hash", handoff);
  });

  it("puts only a short handoff code in the desktop deep link", () => {
    const response = desktopCallback({ handoffToken: "one-time-code", intent: "sign-in" });
    const location = response.headers.get("location") ?? "";
    expect(location).toBe("study-desk://auth/callback?handoff=one-time-code&intent=sign-in");
    expect(location).not.toContain("access_token");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("does not expose internal OAuth or database errors to the deep link", () => {
    expect(publicOAuthError(new Error("database password=secret failed"))).toBe("Google 登录未完成，请回到 Study Desk 重试。");
    expect(publicOAuthError(new Error("identity belongs to another account 不支持合并"))).toContain("不支持合并");
  });
});
