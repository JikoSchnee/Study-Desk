import "server-only";
import { NextResponse } from "next/server";

const nativeAddonErrorPattern = /(better_sqlite3\.node|NODE_MODULE_VERSION|compiled against a different Node\.js version)/i;
const nativeAddonMessage = "本地数据库组件无法加载，请安装修复版本后重试。";

export function isNativeAddonError(error: unknown) {
  return error instanceof Error && nativeAddonErrorPattern.test(`${error.message}\n${error.stack ?? ""}`);
}

export function localApiErrorResponse(context: string, error: unknown, fallback: string, status = 500) {
  console.error(context, error);
  return NextResponse.json({
    error: isNativeAddonError(error) ? nativeAddonMessage : error instanceof Error && error.message ? error.message : fallback,
  }, { status: isNativeAddonError(error) ? 500 : status });
}
