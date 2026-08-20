import { describe, expect, it } from "vitest";
import { rarityPreset, stabilityRarityRange, stabilityRarityTier, type StabilityRarityPreset } from "@/lib/card-tiers";

const cases: Array<{ preset: StabilityRarityPreset; boundaries: [number, number, number, number] }> = [
  { preset: "fast", boundaries: [1, 3, 7, 30] },
  { preset: "memory-cycle", boundaries: [1, 7, 30, 90] },
  { preset: "long-term", boundaries: [3, 14, 60, 180] },
];

describe("Stability rarity tiers", () => {
  for (const { preset, boundaries } of cases) {
    it(`maps every ${preset} boundary`, () => {
      expect(stabilityRarityTier(0, preset).label).toBe("N");
      expect(stabilityRarityTier(boundaries[0], preset).label).toBe("R");
      expect(stabilityRarityTier(boundaries[1], preset).label).toBe("SR");
      expect(stabilityRarityTier(boundaries[2], preset).label).toBe("SSR");
      expect(stabilityRarityTier(boundaries[3], preset).label).toBe("UR");
      expect(stabilityRarityTier(1_000_000, preset).label).toBe("UR");
    });
  }

  it("treats missing and invalid Stability as N", () => {
    expect(stabilityRarityTier(null, "memory-cycle").label).toBe("N");
    expect(stabilityRarityTier(Number.NaN, "memory-cycle").label).toBe("N");
    expect(stabilityRarityTier(-1, "memory-cycle").label).toBe("N");
  });

  it("defaults unknown settings and formats the selected ranges", () => {
    expect(rarityPreset("unknown")).toBe("memory-cycle");
    expect(stabilityRarityRange("N", "memory-cycle")).toBe("< 1 天");
    expect(stabilityRarityRange("SSR", "memory-cycle")).toBe("30–<90 天");
    expect(stabilityRarityRange("UR", "memory-cycle")).toBe("≥ 90 天");
  });
});
