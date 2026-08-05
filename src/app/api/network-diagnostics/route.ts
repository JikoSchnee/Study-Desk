import { NextResponse } from "next/server";

type CheckId = "network" | "github" | "huggingface";
type FailureKind = "timeout" | "dns" | "tls" | "proxy" | "connection" | "http" | "unknown";
type NetworkCheck = { id: CheckId; label: string; ok: boolean; status?: number; durationMs: number; failureKind?: FailureKind; detail: string };
type NetworkDiagnostics = { layers: Array<{ id: "service"; label: string; transport: string; checks: NetworkCheck[] }>; guidance?: string };

const CHECKS: Array<{ id: CheckId; label: string; url: string }> = [
  { id: "network", label: "基础网络", url: "https://www.baidu.com/" },
  { id: "github", label: "GitHub", url: "https://raw.githubusercontent.com/JikoSchnee/Study-Desk/main/README.md" },
  { id: "huggingface", label: "Hugging Face", url: "https://huggingface.co/" },
];
const TIMEOUT_MS = 8_000;

function errorCode(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const cause = "cause" in error ? error.cause : undefined;
  const value = cause && typeof cause === "object" && "code" in cause ? cause.code : "code" in error ? error.code : "";
  return typeof value === "string" ? value.toUpperCase() : "";
}

function failure(error: unknown, timedOut: boolean): Pick<NetworkCheck, "failureKind" | "detail"> {
  if (timedOut) return { failureKind: "timeout", detail: `超过 ${TIMEOUT_MS / 1_000} 秒未收到响应。` };
  const code = errorCode(error);
  const message = error instanceof Error ? `${error.name} ${error.message}`.toUpperCase() : "";
  if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) return { failureKind: "dns", detail: "域名无法解析（DNS）。" };
  if (code.includes("CERT") || ["SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "DEPTH_ZERO_SELF_SIGNED_CERT"].includes(code)) return { failureKind: "tls", detail: "HTTPS 证书验证失败，可能被代理或安全软件拦截。" };
  if (message.includes("PROXY") || message.includes("TUNNEL")) return { failureKind: "proxy", detail: "系统代理无法建立连接、认证或转发请求。" };
  if (["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH", "ETIMEDOUT"].includes(code)) return { failureKind: "connection", detail: "连接被拒绝、重置或网络不可达。" };
  return { failureKind: "unknown", detail: "请求未能建立；可能受网络、代理或安全软件影响。" };
}

async function check({ id, label, url }: (typeof CHECKS)[number]): Promise<NetworkCheck> {
  const startedAt = Date.now();
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT_MS);
  try {
    const response = await fetch(url, { method: "GET", redirect: "manual", cache: "no-store", signal: controller.signal, headers: { "User-Agent": "Study-Desk network diagnostic", Accept: "text/html,application/json;q=0.9" } });
    const durationMs = Date.now() - startedAt;
    if (response.status >= 200 && response.status < 400) return { id, label, ok: true, status: response.status, durationMs, detail: `已连接（HTTP ${response.status}）。` };
    return { id, label, ok: false, status: response.status, durationMs, failureKind: "http", detail: `网站返回 HTTP ${response.status}。网络已到达该网站，但请求被其服务拒绝或限制。` };
  } catch (error) {
    return { id, label, ok: false, durationMs: Date.now() - startedAt, ...failure(error, timedOut) };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const checks = await Promise.all(CHECKS.map(check));
  const usesElectronNetwork = (globalThis as typeof globalThis & { __studyDeskNetworkTransport?: unknown }).__studyDeskNetworkTransport === "electron";
  const response: NetworkDiagnostics = {
    layers: [{ id: "service", label: "本地服务网络", transport: usesElectronNetwork ? "Electron / Chromium" : "Node.js", checks }],
    ...(checks.every((check) => !check.ok) ? { guidance: "本地服务无法访问基础网络。若 Electron 系统网络同样失败，请检查 Windows 防火墙、安全软件、系统代理或企业网络策略。" } : {}),
  };
  return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
}
