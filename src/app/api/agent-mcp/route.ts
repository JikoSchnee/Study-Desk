import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const GUIDE_URL = "https://raw.githubusercontent.com/JikoSchnee/Study-Desk/main/docs/AGENT-MCP.md";
const GUIDE_TIMEOUT_MS = 10_000;

function unavailable(message: string) {
  return NextResponse.json({ error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  const localGuide = join(process.cwd(), "docs", "AGENT-MCP.md");
  if (existsSync(localGuide)) {
    const content = readFileSync(localGuide, "utf8");
    if (content.trim()) return NextResponse.json({ content }, { headers: { "Cache-Control": "no-store" } });
  }
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, GUIDE_TIMEOUT_MS);

  try {
    const response = await fetch(GUIDE_URL, { cache: "no-store", signal: controller.signal, headers: { Accept: "text/markdown, text/plain;q=0.9" } });
    if (!response.ok) return unavailable("暂时无法获取 Agent · MCP 使用手册，请稍后重试。");
    const content = await response.text();
    if (!content.trim()) return unavailable("Agent · MCP 使用手册暂无内容，请稍后重试。");
    return NextResponse.json({ content }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return unavailable(timedOut ? "读取 Agent · MCP 使用手册超时，请检查网络后重试。" : "无法连接 GitHub 获取 Agent · MCP 使用手册，请检查网络后重试。");
  } finally {
    clearTimeout(timeout);
  }
}
