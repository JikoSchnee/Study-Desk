import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/review", () => ({
  reviewQueueProgress: () => ({
    initial: { pending: 4, completedToday: 1 },
    review: { pending: 2, completedToday: 3 },
  }),
}));
vi.mock("@/lib/planner", () => ({ hasExtraInitialStudy: () => true }));

import { GET } from "@/app/api/review/queue/route";

describe("GET /api/review/queue", () => {
  it("returns separate initial-study and due-review progress", async () => {
    const response = await GET();

    expect(await response.json()).toEqual({ progress: { initial: { pending: 4, completedToday: 1 }, review: { pending: 2, completedToday: 3 } }, extraInitialStudyAvailable: true });
  });
});
