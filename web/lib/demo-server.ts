// The demo provider, server side only (imported by app/api/demo/*). It holds a throwaway Studio test
// key from the DEMO_PROVIDER_KEY environment variable and signs exactly one kind of call with it: the
// scripted reply of one of its three plans, to a cancellation on that plan that is open, inside its
// window and not yet replied to. The key is never logged, never returned and never written anywhere;
// an answer names the provider's public address at most.

import { createAccount, createClient } from "genlayer-js";
import type { Address } from "viem";

import { contractAddress, isMock, readPlan, readRequest, studio } from "./chain";
import { cleanKey, keyProblem } from "./demo-key";
import { DEMO_LIMITS, createLimiter } from "./demo-limit";
import { demoPlanByName, demoReplyProblem } from "./demo-plans";
import type { DemoStatus } from "./types";

type Account = ReturnType<typeof createAccount>;
let account: { key: string; value: Account } | null = null;

/** The demo provider's account, or null when no usable key is configured. */
function demoAccount(): Account | null {
  const raw = process.env.DEMO_PROVIDER_KEY;
  if (keyProblem(raw)) return null;
  const key = cleanKey(raw);
  if (!account || account.key !== key) account = { key, value: createAccount(key as `0x${string}`) };
  return account.value;
}

export function demoStatusNow(): DemoStatus {
  if (isMock) return { online: false, provider: "", reason: "in the demo build the demo provider answers in the browser" };
  const problem = keyProblem(process.env.DEMO_PROVIDER_KEY);
  if (problem) return { online: false, provider: "", reason: problem };
  const a = demoAccount()!;
  if (!contractAddress()) return { online: false, provider: a.address.toLowerCase(), reason: "the contract is not deployed yet" };
  return { online: true, provider: a.address.toLowerCase(), reason: "" };
}

const limiter = createLimiter(DEMO_LIMITS);

// One signature at a time: two replies signed at once would ask for the same nonce.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

export type DemoAnswer = { status: number; body: { ok: true; hash: string } | { ok: false; reason: string; retryAfter?: number } };

/** Sends the scripted reply to `request` as the demo provider, if it is a fresh cancellation on one of its plans. */
export async function sendDemoReply(request: string): Promise<DemoAnswer> {
  const status = demoStatusNow();
  if (!status.online) return { status: 503, body: { ok: false, reason: "the demo provider is offline: " + status.reason } };
  const a = demoAccount()!;
  const turn = limiter.attempt(request, Date.now());
  if (!turn.ok) return { status: 429, body: { ok: false, reason: `the demo provider was asked about ${request} a moment ago; try again in ${turn.retryAfter} s`, retryAfter: turn.retryAfter } };
  let req;
  let plan;
  try {
    req = (await readRequest(request, { fresh: true })).data;
    plan = req ? (await readPlan(req.plan, { fresh: true })).data : null;
  } catch {
    return { status: 502, body: { ok: false, reason: "could not read the request from Studio; try again in a minute" } };
  }
  if (!req || !plan) return { status: 404, body: { ok: false, reason: `there is no request ${request}` } };
  const now = req.now > 0 ? req.now : Math.floor(Date.now() / 1000);
  const problem = demoReplyProblem({ id: req.id, status: req.status, replies: req.replies.length, deadline: req.deadline }, plan, a.address, now);
  if (problem) return { status: 409, body: { ok: false, reason: problem } };
  const text = demoPlanByName(plan.name)!.reply;
  try {
    const hash = await serial(async () => {
      const client = createClient({ chain: studio, account: a });
      return client.writeContract({
        address: contractAddress() as Address,
        functionName: "reply",
        args: [request, text],
        value: 0n,
      });
    });
    if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("no hash");
    limiter.hold(request, DEMO_LIMITS.sentHoldMs, Date.now());
    return { status: 200, body: { ok: true, hash } };
  } catch {
    // Nothing of the error goes out: it is the network's, and it is not the visitor's business.
    return { status: 502, body: { ok: false, reason: "Studio did not take the demo provider's reply; try again in a minute" } };
  }
}
