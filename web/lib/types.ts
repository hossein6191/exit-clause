// The shapes the pages use, in one place with no runtime code: lib/chain.ts maps every view answer
// into these, and lib/chain-mock.ts answers in the contract's own JSON so the same mappers run in
// both modes. Every instant is seconds on the message clock; 0 until it happens.

import type { MembershipPhase, MembershipStatus, PlanStatus, RequestPhase, RequestStatus, Verdict } from "./rules.ts";

/** plans(offset, limit): one row per plan. */
export type PlanRow = {
  /** "P3" */
  id: string;
  name: string;
  provider: string;
  status: PlanStatus;
  feeAtto: string;
  /** seconds in one period */
  period: number;
  /** seconds the provider has to reply to a cancellation */
  replyWindow: number;
  openedAt: number;
  closedAt: number;
  /** memberships ever opened */
  members: number;
  /** memberships not over at the instant of the read */
  live: number;
  heldAtto: string;
};

/** plan(id): the row, the plan's membership ids (oldest first) and the contract's clock. */
export type Plan = PlanRow & { memberships: string[]; now: number };

export type PlanPage = { total: number; offset: number; limit: number; rows: PlanRow[]; now: number };

/** membership(id): one address, one plan, one period, and where its fee is. */
export type Membership = {
  /** "M7" */
  id: string;
  plan: string;
  planName: string;
  provider: string;
  member: string;
  feeAtto: string;
  start: number;
  end: number;
  status: MembershipStatus;
  /** the phase the contract computed when it was read; recomputed on the browser's clock for display */
  phase: MembershipPhase;
  collectable: boolean;
  heldAtto: string;
  refundedAtto: string;
  collectedAtto: string;
  /** "" until the one cancellation of this membership is sent */
  request: string;
  closedAt: number;
  now: number;
};

export type Reply = { text: string; verdict: Verdict; at: number };

/** request(id): one cancellation and every reply to it. */
export type Request = {
  /** "R4" */
  id: string;
  membership: string;
  plan: string;
  planName: string;
  member: string;
  provider: string;
  message: string;
  status: RequestStatus;
  phase: RequestPhase;
  sentAt: number;
  deadline: number;
  /** the membership's period end */
  end: number;
  replies: Reply[];
  repliesLeft: number;
  feeAtto: string;
  /** the membership's fee while the contract holds it */
  heldAtto: string;
  refundedAtto: string;
  closedAt: number;
  closedBy: string;
  now: number;
};

/** memberships_of(address) and requests_of(address), as ids, oldest first. */
export type MyIds = { address: string; memberships: string[]; provides: string[]; sent: string[]; received: string[] };

/** stats(): totals only. Amounts in atto. */
export type Stats = {
  plans: number;
  closedPlans: number;
  memberships: number;
  requests: number;
  openRequests: number;
  honoured: number;
  stalled: number;
  lapsed: number;
  replies: number;
  unclearReplies: number;
  refunds: number;
  refundedAtto: string;
  collections: number;
  collectedAtto: string;
  heldAtto: string;
  refusedJoins: number;
  returnedAtto: string;
};

/** rules(): the contract's own words, kept as it wrote them. */
export type Rules = Record<string, unknown>;

export type Votes = { agree: number; disagree: number; idle: number };

export type TxStatus = {
  /** PENDING | PROPOSING | COMMITTING | REVEALING | ACCEPTED | FINALIZED | CANCELED | UNDETERMINED | UNKNOWN */
  status: string;
  votes: Votes;
  /** null until votes exist */
  applied: boolean | null;
  /** finished with no majority: nothing was stored */
  undetermined: boolean;
  /** SUCCESS | ERROR | null */
  exec: string | null;
  /** the contract's JSON return, if any */
  result: Record<string, unknown> | null;
  /** the decoded return or error text */
  message: string;
};

export type ReadResult<T> = { data: T; source: "chain" | "mock" };

/** The contract's write methods, by name. */
export type WriteFn = "open_plan" | "close_plan" | "reply" | "join" | "cancel" | "lapse" | "collect";

export type Arg = string | number;

/** One contract call, ready to sign: the method, its arguments in the contract's order, and the value sent. */
export type Call = { fn: WriteFn; args: Arg[]; value?: bigint };

/** What the demo provider answered when asked to reply to a cancellation on one of its plans. */
export type DemoReplyAnswer = { ok: true; hash: string } | { ok: false; reason: string; retryAfter?: number };

/** Whether the demo provider can sign right now, and who it is. `reason` says exactly why not. */
export type DemoStatus = { online: boolean; provider: string; reason: string };
