export const settingsSections = [
  { id: "learning", label: "学习偏好", description: "学习节奏与展示方式" },
  { id: "backup-sync", label: "备份与云同步", description: "本机备份与 WebDAV" },
  { id: "models", label: "模型设置", description: "语义模型与 LLM 服务" },
  { id: "updates", label: "版本更新", description: "桌面应用与发布信息" },
  { id: "testing", label: "测试功能", description: "开发中的工具与诊断" },
  { id: "guide", label: "使用说明", description: "README 与 Agent MCP" },
] as const;

export type SettingsSection = (typeof settingsSections)[number]["id"];

export function resolveSettingsSection(value: string | null | undefined): SettingsSection {
  return settingsSections.some((section) => section.id === value) ? value as SettingsSection : "learning";
}
