import { NextResponse } from "next/server";

const README_URL = "https://raw.githubusercontent.com/JikoSchnee/Study-Desk/main/README.md";
const README_TIMEOUT_MS = 10_000;

function unavailable(message: string) {
  return NextResponse.json({ error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, README_TIMEOUT_MS);

  try {
    const response = await fetch(README_URL, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "text/markdown, text/plain;q=0.9" },
    });
    if (!response.ok) return unavailable("暂时无法获取最新 README，请稍后重试。");

    const content = await response.text();
    if (!content.trim()) return unavailable("最新 README 暂无内容，请稍后重试。");
    return NextResponse.json({ content }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return unavailable(timedOut ? "读取最新 README 超时，请检查网络后重试。" : "无法连接 GitHub 获取最新 README，请检查网络后重试。");
  } finally {
    clearTimeout(timeout);
  }
}
