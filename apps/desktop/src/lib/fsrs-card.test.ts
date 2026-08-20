import { describe, expect, it } from "vitest";
import { fsrsLearningMetrics } from "@/lib/fsrs-card";

describe("FSRS card metrics", () => {
  it("reads Difficulty and Stability from stored FSRS JSON", () => {
    expect(fsrsLearningMetrics(JSON.stringify({ difficulty: 5.4, stability: 12.75 }))).toEqual({ difficulty: 5.4, stability: 12.75 });
  });

  it("returns null for missing, malformed, or out-of-range values", () => {
    expect(fsrsLearningMetrics(null)).toEqual({ difficulty: null, stability: null });
    expect(fsrsLearningMetrics("{")).toEqual({ difficulty: null, stability: null });
    expect(fsrsLearningMetrics(JSON.stringify({ difficulty: 11, stability: -1 }))).toEqual({ difficulty: null, stability: null });
  });
});
