export type DifficultyTierLabel = "Easy" | "Normal" | "Hard" | "Very Hard";

export const difficultyTiers = [
  { label: "Easy", className: "easy", min: 1, max: 3 },
  { label: "Normal", className: "normal", min: 3, max: 6 },
  { label: "Hard", className: "hard", min: 6, max: 8 },
  { label: "Very Hard", className: "very-hard", min: 8, max: 10.000001 },
] as const;

export function difficultyTier(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 1 || value > 10) return null;
  return difficultyTiers.find((tier) => value >= tier.min && value < tier.max) ?? difficultyTiers.at(-1)!;
}

export type StabilityRarityPreset = "fast" | "memory-cycle" | "long-term";
export type StabilityRarityLabel = "N" | "R" | "SR" | "SSR" | "UR";

export const rarityPresetOptions: ReadonlyArray<{
  id: StabilityRarityPreset;
  name: string;
  description: string;
  boundaries: readonly [number, number, number, number];
}> = [
  { id: "fast", name: "更快获得稀有度", description: "1 / 3 / 7 / 30 天，适合在学习早期获得更强反馈。", boundaries: [1, 3, 7, 30] },
  { id: "memory-cycle", name: "按记忆周期", description: "1 / 7 / 30 / 90 天，兼顾早期反馈与长期成长。", boundaries: [1, 7, 30, 90] },
  { id: "long-term", name: "长期挑战", description: "3 / 14 / 60 / 180 天，适合强调长期稳定记忆。", boundaries: [3, 14, 60, 180] },
];

export const stabilityRarityTiers = [
  { label: "N", name: "Normal", description: "记忆刚刚建立，继续通过主动回忆打好基础。" },
  { label: "R", name: "Rare", description: "已经跨过初始记忆阶段，开始形成可保持的记忆。" },
  { label: "SR", name: "Super Rare", description: "记忆稳定性持续成长，能够承受更长复习间隔。" },
  { label: "SSR", name: "Super Special Rare", description: "知识已经相当稳固，长期回忆表现出色。" },
  { label: "UR", name: "Ultra Rare", description: "达到当前方案的最高稳定阶段，是长期掌握的成果。" },
] as const;

export function rarityPreset(value: unknown): StabilityRarityPreset {
  return rarityPresetOptions.some((option) => option.id === value) ? value as StabilityRarityPreset : "memory-cycle";
}

export function stabilityRarityTier(value: number | null | undefined, preset: StabilityRarityPreset) {
  const stability = typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
  const boundaries = rarityPresetOptions.find((option) => option.id === preset)?.boundaries
    ?? rarityPresetOptions.find((option) => option.id === "memory-cycle")!.boundaries;
  const index = stability < boundaries[0] ? 0
    : stability < boundaries[1] ? 1
      : stability < boundaries[2] ? 2
        : stability < boundaries[3] ? 3
          : 4;
  return stabilityRarityTiers[index];
}

export function stabilityRarityRange(label: StabilityRarityLabel, preset: StabilityRarityPreset) {
  const boundaries = rarityPresetOptions.find((option) => option.id === preset)?.boundaries
    ?? rarityPresetOptions.find((option) => option.id === "memory-cycle")!.boundaries;
  const index = stabilityRarityTiers.findIndex((tier) => tier.label === label);
  if (index === 0) return `< ${boundaries[0]} 天`;
  if (index === stabilityRarityTiers.length - 1) return `≥ ${boundaries[3]} 天`;
  return `${boundaries[index - 1]}–<${boundaries[index]} 天`;
}
