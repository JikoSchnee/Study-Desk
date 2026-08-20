import { describe, expect, it } from "vitest";
import { canAccessCommunityKnowledgeBase, canRefundOrder, communityCatalog, refundDeadline } from "./community";

const paidBase = communityCatalog.find((item) => !item.isFree)!;

describe("community entitlements", () => {
  it("grants free knowledge bases without an entitlement", () => {
    const freeBase = communityCatalog.find((item) => item.isFree)!;
    expect(canAccessCommunityKnowledgeBase({ knowledgeBase: freeBase, entitlements: [] })).toBe(true);
  });

  it("grants an active knowledge-base or author entitlement", () => {
    const now = new Date("2026-08-20T00:00:00.000Z");
    expect(canAccessCommunityKnowledgeBase({ knowledgeBase: paidBase, now, entitlements: [{ kind: "timed", knowledgeBaseId: paidBase.id, startsAt: "2026-08-01T00:00:00.000Z", expiresAt: "2026-09-01T00:00:00.000Z" }] })).toBe(true);
    expect(canAccessCommunityKnowledgeBase({ knowledgeBase: paidBase, now, entitlements: [{ kind: "author-subscription", authorId: paidBase.author.id, startsAt: "2026-08-01T00:00:00.000Z", expiresAt: "2026-09-01T00:00:00.000Z" }] })).toBe(true);
  });

  it("rejects expired, revoked, and unrelated entitlements", () => {
    const now = new Date("2026-08-20T00:00:00.000Z");
    expect(canAccessCommunityKnowledgeBase({ knowledgeBase: paidBase, now, entitlements: [{ kind: "timed", knowledgeBaseId: paidBase.id, startsAt: "2026-07-01T00:00:00.000Z", expiresAt: "2026-08-01T00:00:00.000Z" }] })).toBe(false);
    expect(canAccessCommunityKnowledgeBase({ knowledgeBase: paidBase, now, entitlements: [{ kind: "lifetime", knowledgeBaseId: paidBase.id, startsAt: "2026-07-01T00:00:00.000Z", expiresAt: null, revokedAt: "2026-08-10T00:00:00.000Z" }] })).toBe(false);
    expect(canAccessCommunityKnowledgeBase({ knowledgeBase: paidBase, now, entitlements: [{ kind: "author-subscription", authorId: "other-author", startsAt: "2026-08-01T00:00:00.000Z", expiresAt: "2026-09-01T00:00:00.000Z" }] })).toBe(false);
  });
});

describe("community refunds", () => {
  it("uses a three-day no-reason refund window", () => {
    expect(refundDeadline("2026-08-20T10:00:00.000Z")).toBe("2026-08-23T10:00:00.000Z");
    const order = { id: "order", userId: "user", productId: "product", status: "paid" as const, paidAt: "2026-08-20T10:00:00.000Z", refundDeadline: "2026-08-23T10:00:00.000Z" };
    expect(canRefundOrder(order, new Date("2026-08-23T09:59:59.000Z"))).toBe(true);
    expect(canRefundOrder(order, new Date("2026-08-23T10:00:00.000Z"))).toBe(false);
  });
});
