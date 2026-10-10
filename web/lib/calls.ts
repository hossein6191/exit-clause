// One builder per write method of the contract: the method's name, its arguments in the contract's
// order, and the value sent. Pure, so tests/unit/interface.test.mjs checks every builder against the
// signatures in contracts/exit_clause.py with no browser and no network.

import type { Call } from "./types.ts";

export const calls = {
  /** open_plan(name, fee_atto, period_seconds, reply_seconds): anyone; the sender is the provider. The two spans travel as integers. */
  openPlan: (name: string, feeAtto: bigint, periodSeconds: number, replySeconds: number): Call => ({
    fn: "open_plan",
    args: [name, feeAtto.toString(), Math.trunc(periodSeconds), Math.trunc(replySeconds)],
  }),
  /** close_plan(plan): the provider, once; every membership runs to its own end. */
  closePlan: (plan: string): Call => ({ fn: "close_plan", args: [plan] }),
  /** reply(request, text): the provider, before the deadline, at most two per request. Judged in the same call. */
  reply: (request: string, text: string): Call => ({ fn: "reply", args: [request, text] }),
  /** join(plan), payable: exactly the fee. A refused join returns what was sent in the same transaction. */
  join: (plan: string, feeAtto: bigint): Call => ({ fn: "join", args: [plan], value: feeAtto }),
  /** cancel(membership, message): the member who holds it, during its period, once. */
  cancel: (membership: string, message: string): Call => ({ fn: "cancel", args: [membership, message] }),
  /** lapse(request): anyone, once the reply window closed with the request still open. */
  lapse: (request: string): Call => ({ fn: "lapse", args: [request] }),
  /** collect(membership): anyone, once the period ended with no request open and the fee still held. */
  collect: (membership: string): Call => ({ fn: "collect", args: [membership] }),
};
