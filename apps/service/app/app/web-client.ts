"use client";

export function csrfToken() {
  const item = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("__Host-study_desk_csrf="));
  return item ? decodeURIComponent(item.slice(item.indexOf("=") + 1)) : "";
}

export async function webFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const response = await fetch(`/api/${path.replace(/^\/+/, "")}`, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(!["GET", "HEAD"].includes(method) ? { "X-Study-Desk-CSRF": csrfToken() } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `请求失败（${response.status}）`);
  return body;
}

export function uid() { return crypto.randomUUID(); }
