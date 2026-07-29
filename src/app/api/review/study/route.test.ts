import { describe, expect, it, vi } from "vitest";

const review = vi.hoisted(() => ({ completeInitialStudy: vi.fn() }));

vi.mock("@/lib/review", () => review);

import { POST } from "@/app/api/review/study/route";

describe("POST /api/review/study", () => {
  it("completes an initial study session without submitting an answer", async () => {
    review.completeInitialStudy.mockReturnValue({ dueAt: "2026-07-29T22:00:00.000Z", card: { id: "00000000-0000-4000-8000-000000000001" } });

    const response = await POST(new Request("http://localhost/api/review/study", {
      method: "POST",
      body: JSON.stringify({ cardId: "00000000-0000-4000-8000-000000000001" }),
    }));

    expect(response.status).toBe(200);
    expect(review.completeInitialStudy).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001");
    expect(await response.json()).toEqual({ dueAt: "2026-07-29T22:00:00.000Z", card: { id: "00000000-0000-4000-8000-000000000001" } });
  });

  it("rejects malformed card IDs", async () => {
    const response = await POST(new Request("http://localhost/api/review/study", { method: "POST", body: JSON.stringify({ cardId: "not-a-uuid" }) }));

    expect(response.status).toBe(400);
    expect(review.completeInitialStudy).toHaveBeenCalledTimes(1);
  });
});
