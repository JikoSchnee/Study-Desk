import { describe, expect, it } from "vitest";
import { stabilityRarityTier, type StabilityRarityPreset } from "@/lib/card-tiers";
import { knowledgeBaseExamples } from "@/lib/knowledge-base-examples";

describe("knowledgeBaseExamples", () => {
  const presets: StabilityRarityPreset[] = ["fast", "memory-cycle", "long-term"];

  it("always creates the 20 unique combinations in difficulty then rarity order", () => {
    const examples = knowledgeBaseExamples("memory-cycle");
    expect(examples).toHaveLength(20);
    expect(new Set(examples.map((example) => example.id)).size).toBe(20);
    expect(examples.map((example) => `${example.difficulty.label}-${example.rarity.label}`)).toEqual([
      "Easy-N", "Easy-R", "Easy-SR", "Easy-SSR", "Easy-UR",
      "Normal-N", "Normal-R", "Normal-SR", "Normal-SSR", "Normal-UR",
      "Hard-N", "Hard-R", "Hard-SR", "Hard-SSR", "Hard-UR",
      "Very Hard-N", "Very Hard-R", "Very Hard-SR", "Very Hard-SSR", "Very Hard-UR",
    ]);
  });

  it.each(presets)("uses representative stability values that map back under %s", (preset) => {
    for (const example of knowledgeBaseExamples(preset)) {
      expect(stabilityRarityTier(example.stability, preset).label).toBe(example.rarity.label);
    }
  });
});
