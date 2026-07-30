import "server-only";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isModelProviderId, resolveModelProviderSettings, type ModelProviderId } from "@/lib/model-providers";

// Keep credentials next to the desktop user's data rather than inside a signed app bundle.
const managedKeys = ["LLM_PROVIDER", "LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"] as const;
type ManagedKey = (typeof managedKeys)[number];
type EnvironmentValues = Partial<Record<ManagedKey, string>>;

export type EnvironmentSettings = {
  provider: ModelProviderId;
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
};

export type RuntimeEnvironmentValues = Record<ManagedKey, string>;

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

function environmentFile() { return join(process.env.MOCK_INTERVIEW_HOME || process.cwd(), ".env.local"); }
function readFile() { const file = environmentFile(); return existsSync(file) ? readFileSync(file, "utf8") : ""; }

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

// Next only loads .env.local from the application bundle at startup. Desktop
// settings deliberately live in MOCK_INTERVIEW_HOME instead, so consult that
// persistent file whenever a server feature needs its runtime configuration.
// An explicitly provided process value still wins; this keeps command-line and
// test configuration predictable, including an intentionally empty value.
export function getRuntimeEnvironmentValues(): RuntimeEnvironmentValues {
  const stored = readManagedValues(readFile());
  return Object.fromEntries(managedKeys.map((key) => [key, Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] ?? "" : stored[key] ?? ""])) as RuntimeEnvironmentValues;
}

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
  writeFileSync(environmentFile(), renderEnvironment(content, values), { encoding: "utf8", mode: 0o600 });

  for (const key of managedKeys) {
    if (values[key]) process.env[key] = values[key];
    else delete process.env[key];
  }
  return getEnvironmentSettings();
}
