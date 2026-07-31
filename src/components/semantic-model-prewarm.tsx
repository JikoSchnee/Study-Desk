"use client";

import { useEffect, useRef } from "react";

/** Starts the automatic local-model download only when that source is selected. */
export function SemanticModelPrewarm() {
  const requested = useRef(false);
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    const timer = window.setTimeout(() => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10_000);
      void fetch("/api/settings", { cache: "no-store", signal: controller.signal })
        .then((response) => response.ok ? response.json() as Promise<{ embeddingModelSource?: string }> : null)
        .then((settings) => {
          if (settings?.embeddingModelSource !== "offline") return fetch("/api/settings/prewarm", { method: "POST", signal: controller.signal });
          return undefined;
        })
        .catch(() => undefined)
        .finally(() => window.clearTimeout(timeout));
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
