import "server-only";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isModelProviderId, resolveModelProviderSettings, type ModelProviderId } from "@/lib/model-providers";

const ENVIRONMENT_FILE = join(process.cwd(), ".env.local");
const managedKeys = ["LLM_PROVIDER", "LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"] as const;
type ManagedKey = (typeof managedKeys)[number];
type EnvironmentValues = Partial<Record<ManagedKey, string>>;

export type EnvironmentSettings = {
  provider: ModelProviderId;
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
};

function parseValue(raw: string) {
  const value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    if (value.startsWith('"')) {
      try { return JSON.parse(value) as string; } catch { /* Use the unquoted value below. */ }
    }
    return value.slice(1, -1);
  }
  return value.replace(/\s+#.*$/, "").trim();
}

function readFile() { return existsSync(ENVIRONMENT_FILE) ? readFileSync(ENVIRONMENT_FILE, "utf8") : ""; }

function readManagedValues(content: string) {
  const values: EnvironmentValues = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || !managedKeys.includes(match[1] as ManagedKey)) continue;
    values[match[1] as ManagedKey] = parseValue(match[2]);
  }
  return values;
}

function valueFor(key: ManagedKey, values: EnvironmentValues) { return values[key] ?? process.env[key] ?? ""; }

export function getEnvironmentSettings(): EnvironmentSettings {
  const values = readManagedValues(readFile());
  return {
    provider: isModelProviderId(valueFor("LLM_PROVIDER", values)) ? valueFor("LLM_PROVIDER", values) as ModelProviderId : "custom",
    baseUrl: valueFor("LLM_BASE_URL", values),
    model: valueFor("LLM_MODEL", values),
    apiKeyConfigured: Boolean(valueFor("LLM_API_KEY", values)),
  };
}

function renderEnvironment(content: string, values: EnvironmentValues) {
  const preserved = content.split(/\r?\n/).filter((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    return !match || !managedKeys.includes(match[1] as ManagedKey);
  }).join("\n").trimEnd();
  const entries = managedKeys.flatMap((key) => values[key] ? [`${key}=${JSON.stringify(values[key])}`] : []);
  const prefix = preserved || "# Local model settings for 八股训练台";
  return `${prefix}\n${entries.join("\n")}\n`;
}

export function saveEnvironmentSettings(input: { provider: ModelProviderId; baseUrl: string; model: string; apiKey?: string; clearApiKey: boolean }) {
  const content = readFile();
  const stored = readManagedValues(content);
  const storedProvider = isModelProviderId(stored.LLM_PROVIDER ?? "") ? stored.LLM_PROVIDER as ModelProviderId : "custom";
  const apiKey = input.clearApiKey ? "" : input.apiKey?.trim() || (storedProvider === input.provider ? stored.LLM_API_KEY ?? "" : "");
  const resolved = resolveModelProviderSettings(input.provider, input.baseUrl, input.model);
  const values: EnvironmentValues = { LLM_PROVIDER: resolved.provider, LLM_BASE_URL: resolved.baseUrl, LLM_MODEL: resolved.model, LLM_API_KEY: apiKey };
  writeFileSync(ENVIRONMENT_FILE, renderEnvironment(content, values), { encoding: "utf8", mode: 0o600 });

  for (const key of managedKeys) {
    if (values[key]) process.env[key] = values[key];
    else delete process.env[key];
  }
  return getEnvironmentSettings();
}
