"use client";

import { useEffect, useRef } from "react";

/** Checks and starts the local model download after each initial app load. */
export function SemanticModelPrewarm() {
  const requested = useRef(false);
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    const timer = window.setTimeout(() => {
      void fetch("/api/settings/prewarm", { method: "POST" }).catch(() => undefined);
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
