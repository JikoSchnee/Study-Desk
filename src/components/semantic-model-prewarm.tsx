"use client";

import { useEffect, useRef } from "react";

/** Starts the automatic local-model download only when that source is selected. */
export function SemanticModelPrewarm() {
  const requested = useRef(false);
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    const timer = window.setTimeout(() => {
      void fetch("/api/settings", { cache: "no-store" })
        .then((response) => response.ok ? response.json() as Promise<{ embeddingModelSource?: string }> : null)
        .then((settings) => {
          if (settings?.embeddingModelSource !== "offline") return fetch("/api/settings/prewarm", { method: "POST" });
          return undefined;
        })
        .catch(() => undefined);
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
