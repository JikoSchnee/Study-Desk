import { describe, expect, it } from "vitest";
import { isModelProviderId, modelProviders, resolveModelProviderSettings } from "./model-providers";

describe("model provider presets", () => {
  it("keeps each standard provider's known API configuration together", () => {
    expect(resolveModelProviderSettings("deepseek", "ignored", "deepseek-v4-pro")).toMatchObject({
      baseUrl: modelProviders.deepseek.baseUrl,
      model: "deepseek-v4-pro",
      protocol: "chat-completions",
    });
    expect(resolveModelProviderSettings("claude", "ignored", "")).toMatchObject({
      baseUrl: modelProviders.claude.baseUrl,
      model: modelProviders.claude.model,
      protocol: "anthropic-messages",
    });
  });

  it("leaves custom endpoints and model names under the user's control", () => {
    expect(resolveModelProviderSettings("custom", " https://proxy.example/v1 ", " my-model ")).toMatchObject({
      baseUrl: "https://proxy.example/v1",
      model: "my-model",
    });
    expect(isModelProviderId("qwen")).toBe(true);
    expect(isModelProviderId("unknown")).toBe(false);
  });
});
