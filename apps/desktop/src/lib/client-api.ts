export type LocalApiErrorKind = "http" | "invalid-response" | "network" | "timeout";

export class LocalApiError extends Error {
  constructor(message: string, readonly kind: LocalApiErrorKind, readonly status?: number, readonly data?: unknown, options?: ErrorOptions) {
    super(message, options);
    this.name = "LocalApiError";
  }
}

export type JsonRequestInit = RequestInit & {
  label?: string;
  timeoutMs?: number;
};

function responseFailure(label: string, status: number) {
  return `${label}失败（HTTP ${status}）。`;
}

export async function readJsonResponse<T>(response: Response, label = "读取本地数据"): Promise<T> {
  const body = await response.text();
  let data: T & { error?: unknown };
  try {
    data = JSON.parse(body) as T & { error?: unknown };
  } catch (error) {
    const detail = response.headers.get("content-type")?.includes("text/html")
      ? "本地服务返回了错误页面。"
      : "本地服务返回了无法识别的数据。";
    throw new LocalApiError(`${responseFailure(label, response.status).slice(0, -1)}：${detail}`, "invalid-response", response.status, undefined, { cause: error });
  }
  if (!response.ok) {
    const message = typeof data.error === "string" && data.error.trim() ? data.error : responseFailure(label, response.status);
    throw new LocalApiError(message, "http", response.status, data);
  }
  return data;
}

export async function fetchJson<T>(input: RequestInfo | URL, options: JsonRequestInit = {}): Promise<T> {
  const { label = "读取本地数据", timeoutMs = 10_000, signal: externalSignal, ...init } = options;
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    return await readJsonResponse<T>(response, label);
  } catch (error) {
    if (error instanceof LocalApiError) throw error;
    if (timedOut) throw new LocalApiError(`${label}在 ${Math.ceil(timeoutMs / 1000)} 秒内未响应，请确认桌面应用仍在运行后重试。`, "timeout", undefined, undefined, { cause: error });
    if (externalSignal?.aborted) throw error;
    throw new LocalApiError(`${label}无法连接本地服务，请确认桌面应用仍在运行后重试。`, "network", undefined, undefined, { cause: error });
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }
}
