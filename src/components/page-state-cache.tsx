"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

type Cache = Map<string, unknown>;
const PageStateCacheContext = createContext<Cache | null>(null);

/** Keeps route-local UI state alive while navigating inside this running app. */
export function PageStateCacheProvider({ children }: { children: React.ReactNode }) {
  const cache = useRef<Cache>(new Map());
  return <PageStateCacheContext.Provider value={cache.current}>{children}</PageStateCacheContext.Provider>;
}

export function usePageState<T>(key: string, initial: T) {
  const cache = useContext(PageStateCacheContext);
  const [value, setValue] = useState<T>(() => (cache?.get(key) as T | undefined) ?? initial);
  useEffect(() => () => { cache?.set(key, value); }, [cache, key, value]);
  return [value, setValue] as const;
}

export function usePageStateCache() {
  const cache = useContext(PageStateCacheContext);
  if (!cache) throw new Error("PageStateCacheProvider is missing.");
  return cache;
}
