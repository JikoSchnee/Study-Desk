export const modelProviders = {
  openai: {
    label: "OpenAI",
    detail: "GPT 系列 · 官方 API",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5-mini",
    protocol: "chat-completions",
    models: [
      { id: "gpt-5-mini", label: "GPT-5 mini", detail: "默认推荐 · 兼顾质量与成本" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini", detail: "快速、低延迟" },
      { id: "gpt-4.1", label: "GPT-4.1", detail: "更高质量" },
    ],
  },
  deepseek: {
    label: "DeepSeek",
    detail: "DeepSeek-V4 · OpenAI 兼容",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    protocol: "chat-completions",
    models: [
      { id: "deepseek-v4-flash", label: "DeepSeek-V4-Flash", detail: "默认推荐 · 更快、更经济" },
      { id: "deepseek-v4-pro", label: "DeepSeek-V4-Pro", detail: "更强的复杂任务表现" },
    ],
  },
  glm: {
    label: "智谱 GLM",
    detail: "GLM 系列 · OpenAI 兼容",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-5.2",
    protocol: "chat-completions",
    models: [
      { id: "glm-5.2", label: "GLM-5.2", detail: "默认推荐 · 通用与推理" },
    ],
  },
  qwen: {
    label: "千问 Qwen",
    detail: "通义千问 · DashScope 兼容模式",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    protocol: "chat-completions",
    models: [
      { id: "qwen-plus", label: "Qwen Plus", detail: "默认推荐 · 通用平衡" },
      { id: "qwen-max", label: "Qwen Max", detail: "更高质量" },
      { id: "qwen-flash", label: "Qwen Flash", detail: "更快、更经济" },
      { id: "qwen3-max", label: "Qwen3 Max", detail: "混合思考能力" },
    ],
  },
  claude: {
    label: "Claude / Claude Code",
    detail: "Anthropic API · Messages 协议",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-20250514",
    protocol: "anthropic-messages",
    models: [
      { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", detail: "默认推荐 · 质量与速度平衡" },
      { id: "claude-opus-4-20250514", label: "Claude Opus 4", detail: "更强的复杂任务表现" },
      { id: "claude-opus-4-1-20250805", label: "Claude Opus 4.1", detail: "高难度任务" },
    ],
  },
  custom: {
    label: "自定义",
    detail: "兼容 OpenAI Chat Completions 的服务或代理",
    baseUrl: "",
    model: "",
    protocol: "chat-completions",
    models: [],
  },
} as const;

export type ModelProviderId = keyof typeof modelProviders;
export type ModelProtocol = (typeof modelProviders)[ModelProviderId]["protocol"];

export const modelProviderIds = ["openai", "deepseek", "glm", "qwen", "claude", "custom"] as const satisfies readonly ModelProviderId[];

export function isModelProviderId(value: string): value is ModelProviderId {
  return value in modelProviders;
}

export function resolveModelProviderSettings(provider: ModelProviderId, baseUrl: string, model: string) {
  const preset = modelProviders[provider];
  return provider === "custom"
    ? { provider, baseUrl: baseUrl.trim(), model: model.trim(), protocol: preset.protocol }
    : { provider, baseUrl: preset.baseUrl, model: model.trim() || preset.model, protocol: preset.protocol };
}
