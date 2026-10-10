"use client";

// The clock the pages count down with: whole seconds, ticking once a second while a component
// listens. In mock mode it is the in-memory contract's clock, which the demo bar can move on.
// 0 on the server and during hydration, so nothing time-dependent is rendered twice.

import { useSyncExternalStore } from "react";
import { subscribe as subscribeStore } from "@/lib/browser-store";
import { isMock } from "@/lib/chain";
import { mockNow } from "@/lib/chain-mock";

const nowSeconds = (): number => (isMock ? mockNow() : Math.floor(Date.now() / 1000));

function subscribe(cb: () => void): () => void {
  const timer = setInterval(cb, 1000);
  const off = subscribeStore(cb);
  return () => {
    clearInterval(timer);
    off();
  };
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, nowSeconds, () => 0);
}
