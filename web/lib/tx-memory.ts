// What this browser remembers about each thread: the transactions it sent or asked for, with what
// each one did, and two small flags about the demo provider. A contract does not know the hashes of
// the transactions that ran it, so a plan or a request on chain cannot list them; the browser that
// sent them can, and the pages link each one to the explorer.

import { readItem, writeItem } from "./browser-store.ts";
import { contractAddress } from "./config.ts";

export type Remembered = { hash: string; label: string; at: number };

const HASH = /^0x[0-9a-fA-F]{64}$/;
// The in-memory contract of mock mode starts again on every load and hands out R1, R2... again, so
// what this browser remembers about it is kept per load: a new R7 never inherits an old R7's flags.
const MOCK = process.env.NEXT_PUBLIC_MOCK === "1";
const MOCK_LOAD = typeof window === "undefined" ? "" : Math.random().toString(36).slice(2, 10);
const scope = () => (MOCK ? `mock-${MOCK_LOAD}` : contractAddress() || "no-contract").toLowerCase();
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
export const demoAsked = (request: string): boolean => readItem(flagKey("asked", request)) !== "";
/** When this browser last asked, in browser-clock seconds; 0 when unknown. The waiting panel counts from it. */
export function demoAskedAt(request: string): number {
  const at = Number(readItem(flagKey("asked", request)));
  return Number.isSafeInteger(at) && at > 1_000_000_000 ? at : 0;
}
export const setDemoAsked = (request: string) => writeItem(flagKey("asked", request), String(Math.floor(Date.now() / 1000)));

/** The label the demo provider's reply is remembered under, so a reload can follow it again. */
export const DEMO_REPLY_LABEL = "The demo provider's reply";
