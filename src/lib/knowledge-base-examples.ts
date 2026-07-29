import {
  difficultyTiers,
  rarityPresetOptions,
  stabilityRarityTier,
  stabilityRarityTiers,
  type StabilityRarityPreset,
} from "@/lib/card-tiers";

const difficultyRepresentativeValues = [2.0, 4.5, 7.0, 9.0] as const;

export type KnowledgeBaseExample = {
  id: string;
  difficulty: (typeof difficultyTiers)[number];
  difficultyValue: number;
  rarity: (typeof stabilityRarityTiers)[number];
  stability: number;
};

export function knowledgeBaseExamples(preset: StabilityRarityPreset): KnowledgeBaseExample[] {
  const boundaries = rarityPresetOptions.find((option) => option.id === preset)!.boundaries;
  const representativeStabilities = [
    boundaries[0] / 2,
    (boundaries[0] + boundaries[1]) / 2,
    (boundaries[1] + boundaries[2]) / 2,
    (boundaries[2] + boundaries[3]) / 2,
    boundaries[3] * 1.25,
  ];

  return difficultyTiers.flatMap((difficulty, difficultyIndex) => stabilityRarityTiers.map((rarity, rarityIndex) => {
    const stability = representativeStabilities[rarityIndex];
    return {
      id: `${difficulty.className}-${rarity.label.toLowerCase()}`,
      difficulty,
      difficultyValue: difficultyRepresentativeValues[difficultyIndex],
      rarity: stabilityRarityTier(stability, preset),
      stability,
    };
  }));
}
