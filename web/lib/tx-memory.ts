// What this browser remembers about each thread: the transactions it sent or asked for, with what
// each one did, and two small flags about the demo provider. A contract does not know the hashes of
// the transactions that ran it, so a plan or a request on chain cannot list them; the browser that
// sent them can, and the pages link each one to the explorer.

import { readItem, writeItem } from "./browser-store.ts";
import { contractAddress } from "./config.ts";

export type Remembered = { hash: string; label: string; at: number };

const HASH = /^0x[0-9a-fA-F]{64}$/;
const scope = () => (contractAddress() || "mock").toLowerCase();
const keyOf = (thread: string) => `exit-clause:tx:${scope()}:${thread}`;

/** The raw stored list for a plan or a request id (a string, so it can be a stable store snapshot). */
export const rememberedRaw = (thread: string): string => readItem(keyOf(thread));

export function parseRemembered(raw: string): Remembered[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as Remembered[];
    return Array.isArray(list) ? list.filter((r) => r && HASH.test(String(r.hash)) && typeof r.label === "string") : [];
  } catch {
    return [];
  }
}

export function rememberTx(thread: string, hash: string, label: string): void {
  if (!thread || !HASH.test(hash)) return;
  const list = parseRemembered(rememberedRaw(thread)).filter((r) => r.hash !== hash);
  list.unshift({ hash, label, at: Math.floor(Date.now() / 1000) });
  writeItem(keyOf(thread), JSON.stringify(list.slice(0, 12)));
}

// ---- the demo provider's flags ----------------------------------------------------------------------

const flagKey = (what: "skip" | "asked", request: string) => `exit-clause:demo-${what}:${scope()}:${request}`;

/** The member asked the demo provider to stay silent on this request, to watch it lapse. */
export const demoSkipped = (request: string): boolean => readItem(flagKey("skip", request)) === "1";
export const setDemoSkipped = (request: string, skip: boolean) => writeItem(flagKey("skip", request), skip ? "1" : null);

/** This browser already asked the demo provider about this request (so a reload does not ask again). */
export const demoAsked = (request: string): boolean => readItem(flagKey("asked", request)) === "1";
export const setDemoAsked = (request: string) => writeItem(flagKey("asked", request), "1");
