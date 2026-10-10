// A stand-in for the contract, in memory, for NEXT_PUBLIC_MOCK=1. lib/chain.ts delegates here.
//
// It follows contracts/exit_clause.py on everything deterministic: who may call what and when, the
// order of the checks and their refusal sentences word for word, the period and the reply window on
// the clock, where every fee goes, the counters, and every view answered in the contract's own JSON
// shape, so the mappers in lib/chain.ts run on the same rows in both modes. The one thing it cannot
// do is ask a model: the verdict on a reply is SCRIPTED here (a demo plan's own reply, a suggestion
// chip's kind, or a word list for anything else), and the demo bar says so on every page.
//
// The visitor acts as one of a few demo accounts. The demo provider runs the three demo plans and
// replies to their cancellations (demoReply, the in-memory twin of POST /api/demo/reply). A few
// finished threads are seeded so the ledger and the inbox have something to show, and the clock can
// be moved on so a closed window or an ended period can be seen. State lasts as long as the tab.

import type { Call, DemoReplyAnswer, DemoStatus, TxStatus, WriteFn } from "./types.ts";
import { notify } from "./browser-store.ts";
import { DEMO_PLANS, demoPlanByName, demoReplyProblem, openArgs } from "./demo-plans.ts";
import { MESSAGE_CHIPS, REPLY_CHIPS } from "./suggestions.ts";
import {
  ADDRESS_CHARS,
  ID_CHARS,
  MAX_FEE,
  MAX_MESSAGE,
  MAX_NAME,
  MAX_PERIOD,
  MAX_REPLIES,
  MAX_REPLY,
  MAX_WINDOW,
  MIN_FEE,
  MIN_MESSAGE,
  MIN_NAME,
  MIN_PERIOD,
  MIN_REPLY,
  MIN_WINDOW,
  PAGE,
  QUESTION_HONOUR,
  QUESTION_STALL,
  THE_RULE,
  ZERO,
  isOver,
  membershipPhase,
  numberArg,
  pyStrip,
  requestPhase,
  textProblem,
  type MembershipStatus,
  type RequestStatus,
  type Verdict,
} from "./rules.ts";

const GEN = 10n ** 18n;
export const MOCK_CONTRACT = "0x00000000000000000000000000000000e7c1a05e";

const inBrowser = typeof window !== "undefined";
const delay = (ms: number) => (inBrowser ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

// ---- the clock -----------------------------------------------------------------------------------

let clockOffset = 0;
/** The mock's message clock, in seconds: the browser's clock plus however far the visitor moved it on. */
export const mockNow = (): number => Math.floor(Date.now() / 1000) + clockOffset;
/** How far the clock has been moved on, in seconds: a stable snapshot for useSyncExternalStore. */
export const mockClockOffset = (): number => clockOffset;
/** Moves the mock clock on, so a window that is still open can be seen closed. */
export function advanceClock(seconds: number): void {
  clockOffset += Math.max(0, Math.floor(seconds));
  notify();
}

// ---- who the visitor is acting as -----------------------------------------------------------------

export type Persona = { address: string; name: string; note: string };

export const VISITOR = "0x6b2e0c94d17a3f58e2c1b0a97d4e6f3812c5a9e0";
export const MY_PROVIDER = "0x3f9a1c7e05b2d84e6a0f19c3b7d5e2a48c06f1b7";
export const EARLIER_MEMBER = "0xc41d7e2a9b3f6058e1a2c4d97b0e5f3a6d8c2b19";
export const PASSER_BY = "0x92e5b0a3c7d14f6e8b2a05c9d3f71e4a0b6c8d25";
export const DEMO_PROVIDER = "0xd7e0a3b5c19f42e6a8b0c3d5e7f91a2b4c6d8e0f";
export const OTHER_PROVIDER = "0x5c8e1f3a7b9d02c4e6a8b1d3f5a7c9e0b2d4f6a8";

/** The accounts a visitor can act as in mock mode. The first is a newcomer with test GEN. */
export const PERSONAS: Persona[] = [
  { address: VISITOR, name: "You, a member", note: "join a demo plan, send a cancellation, watch the stamp" },
  { address: MY_PROVIDER, name: "You, a provider", note: "R6 on Stillwater Yoga waits for your reply; M8 can be collected" },
  { address: EARLIER_MEMBER, name: "An earlier member", note: "five finished or running threads" },
  { address: PASSER_BY, name: "A passer-by", note: "anyone may lapse or collect once the clock allows" },
  { address: DEMO_PROVIDER, name: "The demo provider", note: "runs the three demo plans" },
  { address: OTHER_PROVIDER, name: "Brightline Cloud", note: "its first reply to R5 was unclear; one reply left" },
];

let persona = VISITOR;
/** The address the mock treats as the connected wallet. */
export const mockAddress = (): string => persona;
export function setMockPersona(address: string): void {
  if (PERSONAS.some((p) => p.address === address)) persona = address;
  notify();
}

// ---- balances -------------------------------------------------------------------------------------

const balances = new Map<string, bigint>([
  [VISITOR, 20n * GEN],
  [MY_PROVIDER, 6n * GEN],
  [EARLIER_MEMBER, 30n * GEN],
  [PASSER_BY, 4n * GEN],
  [DEMO_PROVIDER, 5n * GEN],
  [OTHER_PROVIDER, 3n * GEN],
]);
const balance = (a: string) => balances.get(a.toLowerCase()) ?? 0n;
const credit = (a: string, v: bigint) => {
  balances.set(a.toLowerCase(), balance(a) + v);
  notify();
};
/** The balance as a decimal string: a stable snapshot for useSyncExternalStore. */
export const mockBalanceText = (address: string): string => balance(address).toString();
/** The contract's own balance: every fee it holds. */
let contractBalance = 0n;
export const mockContractBalance = (): bigint => contractBalance;

// ---- the contract's state -----------------------------------------------------------------------

type PlanRec = {
  provider: string;
  name: string;
  fee: bigint;
  period: number;
  reply_window: number;
  status: string;
  opened_at: number;
  closed_at: number;
  members: number;
  held: bigint;
  memberships: string[];
};

type MemRec = {
  plan_id: string;
  member: string;
  fee: bigint;
  start: number;
  end: number;
  status: MembershipStatus;
  held: bigint;
  refunded: bigint;
  collected: bigint;
  request_id: string;
  closed_at: number;
};

type ReplyRec = { text: string; verdict: Verdict; at: number };

type ReqRec = {
  membership_id: string;
  plan_id: string;
  member: string;
  message: string;
  status: RequestStatus;
  sent_at: number;
  deadline: number;
  replies: ReplyRec[];
  refunded: bigint;
  closed_at: number;
  closed_by: string;
};

const planRows = new Map<string, PlanRec>();
const memberRows = new Map<string, MemRec>();
const requestRows = new Map<string, ReqRec>();
const latest = new Map<string, string>();
const planNames = new Map<string, string>();
const byProvider = new Map<string, string[]>();
const byMember = new Map<string, string[]>();
const sentBy = new Map<string, string[]>();
const receivedBy = new Map<string, string[]>();
const n = {
  plan_count: 0,
  membership_count: 0,
  request_count: 0,
  held: 0n,
  refunded_total: 0n,
  collected_total: 0n,
  returned: 0n,
  n_refused: 0,
  n_closed_plans: 0,
  n_refunds: 0,
  n_collected: 0,
  n_honoured: 0,
  n_stalled: 0,
  n_lapsed: 0,
  n_replies: 0,
  n_unclear: 0,
};

/** A refusal that raises: nothing is stored, and the receipt carries the sentence. */
class Refused extends Error {}
const fail = (message: string): never => {
  throw new Refused("[EXPECTED] " + message);
};

type Ctx = { sender: string; value: bigint; now: number };
type Row = Record<string, unknown>;

const isStr = (v: unknown): v is string => typeof v === "string";

const clock = (c: Ctx): number => {
  if (c.now < 0) fail("no readable clock on this transaction; no period or window can be measured");
  return c.now;
};

function planOf(id: string): PlanRec {
  const p = planRows.get(id);
  if (!p) return fail("no plan " + id.slice(0, ID_CHARS));
  return p;
}
function membershipOf(id: string): MemRec {
  const m = memberRows.get(id);
  if (!m) return fail("no membership " + id.slice(0, ID_CHARS));
  return m;
}
function requestOf(id: string): ReqRec {
  const r = requestRows.get(id);
  if (!r) return fail("no request " + id.slice(0, ID_CHARS));
  return r;
}

function index(table: Map<string, string[]>, key: string, id: string): void {
  table.set(key, [...(table.get(key) ?? []), id]);
}

function transfer(to: string, value: bigint): void {
  contractBalance -= value;
  credit(to, value);
}

const over = (id: string, now: number): boolean => {
  const m = memberRows.get(id)!;
  return isOver(m.status, m.end, now);
};
const liveOf = (p: PlanRec, now: number): number => p.memberships.filter((id) => !over(id, now)).length;

/** The single exit for a request: write the ending, then move the money. What went back is returned. */
function closeRequest(req: ReqRec, status: RequestStatus, c: Ctx, now: number): bigint {
  const m = memberRows.get(req.membership_id)!;
  req.status = status;
  req.closed_at = now;
  req.closed_by = c.sender;
  if (status === "honoured") {
    m.status = "cancelled";
    n.n_honoured++;
    return 0n;
  }
  const plan = planRows.get(req.plan_id)!;
  const amount = m.held;
  req.refunded = amount;
  m.status = "refunded";
  m.held = 0n;
  m.refunded = amount;
  m.closed_at = now;
  plan.held -= amount;
  n.held -= amount;
  n.refunded_total += amount;
  n.n_refunds++;
  if (status === "stalled") n.n_stalled++;
  else n.n_lapsed++;
  transfer(m.member, amount);
  return amount;
}

// ---- the scripted reading -----------------------------------------------------------------------

const STALL_WORDS =
  /\b(call|calls|calling|phone|ring us|visit|in person|front desk|form|fill in|offer|discount|\d+% off|percent off|verify|verification|chat|speak to|agent|before we|once we hear|let us know whether|cannot cancel|unable to cancel)\b/i;
const HONOUR_WORDS = /\b(cancelled|canceled|confirm|confirmed|has ended|will end|ends at|ends when|ends then)\b/i;
/** "no call or form is needed" names a stall only to deny it: such phrases are dropped before reading. */
const denied = (text: string) => text.replace(/\b(no|without|not|nothing)\b[^.;:!?]*/gi, " ");

/**
 * The verdict the in-memory contract gives a reply. A demo plan's own reply answers its script, a
 * suggestion chip its kind, and any other text is read with two word lists. On chain the validators decide.
 */
function scriptedVerdict(plan: PlanRec, text: string): Verdict {
  const demo = demoPlanByName(plan.name);
  if (demo && plan.provider === DEMO_PROVIDER && demo.reply === text) return demo.expect;
  const chip = REPLY_CHIPS.find((x) => x.value === text);
  if (chip) return chip.kind === "honour" ? "honoured" : chip.kind === "vague" ? "unclear" : "stalled";
  const t = denied(text);
  if (STALL_WORDS.test(t)) return "stalled";
  if (HONOUR_WORDS.test(t)) return "honoured";
  return "unclear";
}

// ---- the writes -----------------------------------------------------------------------------------

function openPlan(c: Ctx, rawName: unknown, feeAtto: unknown, periodSeconds: unknown, replySeconds: unknown): Row {
  if (!isStr(rawName)) fail("the name is a string");
  const name = pyStrip(rawName as string);
  const problem = textProblem(name, MIN_NAME, MAX_NAME, "the name");
  if (problem) fail(problem);
  const fee = numberArg(feeAtto);
  const period = numberArg(periodSeconds);
  const window = numberArg(replySeconds);
  if (fee < MIN_FEE || fee > MAX_FEE) fail(`the fee is a whole number of atto from ${MIN_FEE} (0.1 GEN) to ${MAX_FEE} (100 GEN), for one period`);
  if (period < BigInt(MIN_PERIOD) || period > BigInt(MAX_PERIOD)) fail(`the period is ${MIN_PERIOD} to ${MAX_PERIOD} seconds`);
  if (window < BigInt(MIN_WINDOW) || window > BigInt(MAX_WINDOW)) fail(`the reply window is ${MIN_WINDOW} to ${MAX_WINDOW} seconds`);
  const who = c.sender;
  const nameKey = who + "|" + name.toLowerCase();
  const existing = planNames.get(nameKey);
  if (existing && planRows.get(existing)!.status === "open")
    fail(`this address already runs an open plan named ${name}, ${existing}; close it first or choose another name`);
  const now = clock(c);
  n.plan_count++;
  const id = "P" + n.plan_count;
  planRows.set(id, {
    provider: who, name, fee, period: Number(period), reply_window: Number(window), status: "open",
    opened_at: now, closed_at: 0, members: 0, held: 0n, memberships: [],
  });
  planNames.set(nameKey, id);
  index(byProvider, who, id);
  return { ok: true, plan: id, provider: who, name, fee: fee.toString(), period: Number(period), reply_window: Number(window), opened_at: now };
}

function closePlan(c: Ctx, raw: unknown): Row {
  if (!isStr(raw)) fail("the plan id is a string");
  const id = pyStrip(raw as string);
  const plan = planOf(id);
  if (c.sender !== plan.provider) fail(`only the provider of ${id} may close it`);
  if (plan.status !== "open") fail(`${id} is already closed`);
  const now = clock(c);
  plan.status = "closed";
  plan.closed_at = now;
  n.n_closed_plans++;
  return { ok: true, plan: id, status: "closed", live: liveOf(plan, now), held: plan.held.toString() };
}

function reply(c: Ctx, rawId: unknown, rawText: unknown): Row {
  if (!isStr(rawId) || !isStr(rawText)) fail("the request id and the reply are strings");
  const id = pyStrip(rawId as string);
  const text = pyStrip(rawText as string);
  const req = requestOf(id);
  const planId = req.plan_id;
  const plan = planRows.get(planId)!;
  if (c.sender !== plan.provider) fail(`only the provider of ${planId} may reply to ${id}`);
  if (req.status !== "open") fail(`${id} is ${req.status}; a reply is taken while the request is open`);
  if (req.replies.length >= MAX_REPLIES)
    fail(`${id} has had its ${MAX_REPLIES} replies and neither settled it; once the window closes, lapse(${id}) gives the member the fee back`);
  const now = clock(c);
  if (now >= req.deadline) fail(`the reply window of ${id} closed; lapse(${id}) gives the member the fee back`);
  const problem = textProblem(text, MIN_REPLY, MAX_REPLY, "the reply");
  if (problem) fail(problem);
  const verdict = scriptedVerdict(plan, text);
  req.replies.push({ text, verdict, at: now });
  n.n_replies++;
  let refunded = 0n;
  if (verdict === "honoured") refunded = closeRequest(req, "honoured", c, now);
  else if (verdict === "stalled") refunded = closeRequest(req, "stalled", c, now);
  else n.n_unclear++;
  const m = memberRows.get(req.membership_id)!;
  return {
    ok: true, request: id, membership: req.membership_id, verdict, status: req.status, replies: req.replies.length,
    verdicts: req.replies.map((r) => r.verdict), refunded: refunded.toString(), membership_status: m.status,
    held: m.held.toString(), deadline: req.deadline,
  };
}

function refuse(sender: string, value: bigint, reason: string, fields: Row): Row {
  n.n_refused++;
  n.returned += value;
  if (value > 0n) transfer(sender, value);
  return { ok: false, ...fields, reason, returned: value.toString() };
}

function join(c: Ctx, raw: unknown): Row {
  const value = c.value;
  const who = c.sender;
  let problem = "";
  let planId = "";
  if (!isStr(raw)) problem = "the plan id is a string";
  else {
    planId = pyStrip(raw);
    if (!planRows.has(planId)) problem = "no plan " + planId.slice(0, ID_CHARS);
  }
  const key = planId + "|" + who;
  let now = -1;
  if (!problem) {
    const plan = planRows.get(planId)!;
    now = c.now;
    const held = latest.get(key) ?? "";
    if (who === plan.provider) problem = `the provider of ${planId} may not join it`;
    else if (plan.status !== "open") problem = `${planId} is closed and takes no new members`;
    else if (now < 0) problem = "no readable clock on this transaction; no period can be measured";
    else if (held && !over(held, now)) problem = `this address already holds ${held} in ${planId}; it may join again once ${held} ends`;
    else if (value !== plan.fee) problem = `send exactly the fee of ${plan.fee} atto to join ${planId}; this one sent ${value}`;
  }
  if (problem) return refuse(who, value, problem, { plan: planId.slice(0, ID_CHARS), membership: "" });
  const plan = planRows.get(planId)!;
  n.membership_count++;
  const id = "M" + n.membership_count;
  const end = now + plan.period;
  memberRows.set(id, {
    plan_id: planId, member: who, fee: value, start: now, end, status: "live", held: value, refunded: 0n, collected: 0n,
    request_id: "", closed_at: 0,
  });
  latest.set(key, id);
  plan.members++;
  plan.held += value;
  plan.memberships.push(id);
  n.held += value;
  index(byMember, who, id);
  return { ok: true, membership: id, plan: planId, member: who, fee: value.toString(), held: value.toString(), start: now, end, status: "live" };
}

function cancel(c: Ctx, rawId: unknown, rawMessage: unknown): Row {
  if (!isStr(rawId) || !isStr(rawMessage)) fail("the membership id and the message are strings");
  const id = pyStrip(rawId as string);
  const message = pyStrip(rawMessage as string);
  const m = membershipOf(id);
  if (c.sender !== m.member) fail(`only the member who holds ${id} may cancel it`);
  if (m.request_id !== "") fail(`${id} already has its cancellation, ${m.request_id}; one request per membership`);
  const problem = textProblem(message, MIN_MESSAGE, MAX_MESSAGE, "the message");
  if (problem) fail(problem);
  const now = clock(c);
  if (now >= m.end) fail(`the period of ${id} has ended; a membership is cancelled during its period, and nothing renews it`);
  const plan = planRows.get(m.plan_id)!;
  n.request_count++;
  const rid = "R" + n.request_count;
  const deadline = now + plan.reply_window;
  requestRows.set(rid, {
    membership_id: id, plan_id: m.plan_id, member: m.member, message, status: "open", sent_at: now, deadline, replies: [],
    refunded: 0n, closed_at: 0, closed_by: ZERO,
  });
  m.status = "cancelling";
  m.request_id = rid;
  index(sentBy, m.member, rid);
  index(receivedBy, plan.provider, rid);
  return { ok: true, request: rid, membership: id, plan: m.plan_id, member: m.member, status: "open", deadline, end: m.end };
}

function lapse(c: Ctx, raw: unknown): Row {
  if (!isStr(raw)) fail("the request id is a string");
  const id = pyStrip(raw as string);
  const req = requestOf(id);
  if (req.status !== "open") fail(`${id} is ${req.status}; only an open request can lapse`);
  const now = clock(c);
  if (now < req.deadline) fail(`the provider of ${req.plan_id} may still reply to ${id}, for ${req.deadline - now} seconds`);
  const refunded = closeRequest(req, "lapsed", c, now);
  return { ok: true, request: id, membership: req.membership_id, status: "lapsed", member: req.member, refunded: refunded.toString() };
}

function collect(c: Ctx, raw: unknown): Row {
  if (!isStr(raw)) fail("the membership id is a string");
  const id = pyStrip(raw as string);
  const m = membershipOf(id);
  if (m.status === "cancelling") fail(`the cancellation ${m.request_id} of ${id} is still open; the fee is held until it closes`);
  if (m.status === "refunded") fail(`the fee of ${id} went back to the member; there is nothing to collect`);
  if (m.status === "served") fail(`the fee of ${id} was already collected`);
  const now = clock(c);
  if (now < m.end) fail(`the period of ${id} runs for another ${m.end - now} seconds; its fee is held until it ends`);
  const plan = planRows.get(m.plan_id)!;
  const amount = m.held;
  m.status = "served";
  m.held = 0n;
  m.collected = amount;
  m.closed_at = now;
  plan.held -= amount;
  n.held -= amount;
  n.collected_total += amount;
  n.n_collected++;
  transfer(plan.provider, amount);
  return { ok: true, membership: id, plan: m.plan_id, provider: plan.provider, collected: amount.toString(), status: "served" };
}

function run(fn: WriteFn, args: unknown[], c: Ctx): Row {
  switch (fn) {
    case "open_plan":
      return openPlan(c, args[0], args[1], args[2], args[3]);
    case "close_plan":
      return closePlan(c, args[0]);
    case "reply":
      return reply(c, args[0], args[1]);
    case "join":
      return join(c, args[0]);
    case "cancel":
      return cancel(c, args[0], args[1]);
    case "lapse":
      return lapse(c, args[0]);
    case "collect":
      return collect(c, args[0]);
  }
}

// ---- the views ------------------------------------------------------------------------------------

function planRow(id: string, now: number): Row {
  const p = planRows.get(id)!;
  return {
    plan: id, name: p.name, provider: p.provider, status: p.status, fee: p.fee.toString(), period: p.period,
    reply_window: p.reply_window, opened_at: p.opened_at, closed_at: p.closed_at, members: p.members,
    live: liveOf(p, now), held: p.held.toString(),
  };
}

function membershipRow(id: string, now: number): Row {
  const m = memberRows.get(id)!;
  const plan = planRows.get(m.plan_id)!;
  const phase = membershipPhase(m.status, m.end, now);
  return {
    membership: id, plan: m.plan_id, plan_name: plan.name, provider: plan.provider, member: m.member, fee: m.fee.toString(),
    start: m.start, end: m.end, status: m.status, phase, collectable: phase === "due", held: m.held.toString(),
    refunded: m.refunded.toString(), collected: m.collected.toString(), request: m.request_id, closed_at: m.closed_at, now,
  };
}

function requestRow(id: string, now: number): Row {
  const r = requestRows.get(id)!;
  const m = memberRows.get(r.membership_id)!;
  const plan = planRows.get(r.plan_id)!;
  return {
    request: id, membership: r.membership_id, plan: r.plan_id, plan_name: plan.name, member: r.member, provider: plan.provider,
    message: r.message, status: r.status, phase: requestPhase(r.status, r.deadline, now), sent_at: r.sent_at,
    deadline: r.deadline, end: m.end, replies: r.replies.map((x) => ({ ...x })), verdicts: r.replies.map((x) => x.verdict),
    replies_left: r.status === "open" ? MAX_REPLIES - r.replies.length : 0, fee: m.fee.toString(), held: m.held.toString(),
    refunded: r.refunded.toString(), closed_at: r.closed_at, closed_by: r.closed_by === ZERO ? "" : r.closed_by, now,
  };
}

const READING =
  "The MESSAGE only shows what the customer asked for; a customer needs no reason to cancel. An offer the customer is free to ignore, while the cancellation goes ahead anyway, is not an offer that must be answered first.";

/** rules(), as the contract publishes it. */
const RULES = {
  rule: THE_RULE,
  reading: READING,
  value: 'one word per reply: "honoured", "stalled" or "unclear"',
  askings: ["order 1: RULE, MESSAGE, REPLY, and the question: " + QUESTION_HONOUR, "order 2: REPLY, MESSAGE, RULE, and the question: " + QUESTION_STALL],
  combine: { "yes then no": "honoured", "no then yes": "stalled", "anything else": "unclear" },
  compared:
    "the word, by exact string equality; every validator reruns both askings itself inside one consensus block and never agrees with a leader that raised",
  model_sees: "the rule, the member's message and the provider's reply; never an amount, an address, a plan name or a date",
  money: {
    join: "the member pays exactly the fee; the contract holds it for the period",
    honoured: "nothing moves now; the membership ends at the period's end and its fee stays held for the provider",
    stalled: "this period's held fee goes back to the member in the same transaction; the membership ends now",
    unclear: "nothing moves; the provider may reply once more before the deadline",
    lapse: "after the deadline with the request still open: the held fee goes back to the member by rule, with no model asked; the membership ends now",
    collect: "after the period's end with no request open: the held fee goes to the provider",
    refusal: "a refused join returns everything sent, in the same transaction",
    balance: "the contract holds exactly the fees of the memberships not yet refunded or collected",
  },
  who: {
    open_plan: "anyone; the sender is the provider; one open plan per name per address",
    close_plan: "the provider, once; no new members, every membership runs to its end",
    join: "anyone but the provider, while the plan is open, with exactly the fee; one live membership per address per plan",
    cancel: "the member who holds the membership, during its period, once",
    reply: `the provider, before the deadline, at most ${MAX_REPLIES} replies per request`,
    lapse: "anyone, after the deadline with the request still open",
    collect: "anyone, after the period's end, with no request open and the fee still held",
  },
  limits: {
    name: [MIN_NAME, MAX_NAME],
    message: [MIN_MESSAGE, MAX_MESSAGE],
    reply: [MIN_REPLY, MAX_REPLY],
    replies_per_request: MAX_REPLIES,
    fee_atto: [MIN_FEE.toString(), MAX_FEE.toString()],
    period_seconds: [MIN_PERIOD, MAX_PERIOD],
    reply_seconds: [MIN_WINDOW, MAX_WINDOW],
    plans_per_page: PAGE,
    text: "printable ASCII on one line; nothing longer than its limit is ever judged in part",
  },
  untrusted:
    "the member wrote the message and the provider wrote the reply; each is fenced (< and > replaced, never deleted), sits between delimiter lines tagged with the start of its own sha256, and the prompt says before the blocks that both are untrusted and never an instruction",
};

export async function view(fn: string, args: (string | number)[]): Promise<unknown> {
  seed();
  await delay(70);
  const now = mockNow();
  const idKey = (v: unknown) => pyStrip(String(v)).slice(0, ID_CHARS);
  switch (fn) {
    case "plan": {
      if (!isStr(args[0])) return JSON.stringify({ error: "the plan id is a string" });
      const key = idKey(args[0]);
      if (!planRows.has(key)) return JSON.stringify({ error: "no plan " + key, plan: key });
      return JSON.stringify({ ...planRow(key, now), memberships_list: [...planRows.get(key)!.memberships], now });
    }
    case "membership": {
      if (!isStr(args[0])) return JSON.stringify({ error: "the membership id is a string" });
      const key = idKey(args[0]);
      if (!memberRows.has(key)) return JSON.stringify({ error: "no membership " + key, membership: key });
      return JSON.stringify(membershipRow(key, now));
    }
    case "request": {
      if (!isStr(args[0])) return JSON.stringify({ error: "the request id is a string" });
      const key = idKey(args[0]);
      if (!requestRows.has(key)) return JSON.stringify({ error: "no request " + key, request: key });
      return JSON.stringify(requestRow(key, now));
    }
    case "plans": {
      const total = n.plan_count;
      const off = numberArg(args[0]);
      const start = Number(off < 0n ? 0n : off);
      let size = Number(numberArg(args[1]));
      size = size < 1 || size > PAGE ? PAGE : size;
      const rows: Row[] = [];
      for (let k = start + 1; k <= Math.min(total, start + size); k++) rows.push(planRow("P" + k, now));
      return JSON.stringify({ total, offset: start, limit: size, rows, now });
    }
    case "memberships_of": {
      if (!isStr(args[0])) return JSON.stringify({ error: "the address is a string" });
      const key = pyStrip(args[0]).toLowerCase().slice(0, ADDRESS_CHARS);
      return JSON.stringify({ address: key, memberships: byMember.get(key) ?? [], provides: byProvider.get(key) ?? [] });
    }
    case "requests_of": {
      if (!isStr(args[0])) return JSON.stringify({ error: "the address is a string" });
      const key = pyStrip(args[0]).toLowerCase().slice(0, ADDRESS_CHARS);
      return JSON.stringify({ address: key, sent: sentBy.get(key) ?? [], received: receivedBy.get(key) ?? [] });
    }
    case "stats": {
      const closed = n.n_honoured + n.n_stalled + n.n_lapsed;
      return JSON.stringify({
        plans: n.plan_count, closed_plans: n.n_closed_plans, memberships: n.membership_count, requests: n.request_count,
        open_requests: n.request_count - closed, honoured: n.n_honoured, stalled: n.n_stalled, lapsed: n.n_lapsed,
        replies: n.n_replies, unclear_replies: n.n_unclear, refunds: n.n_refunds, refunded: n.refunded_total.toString(),
        collections: n.n_collected, collected: n.collected_total.toString(), held: n.held.toString(),
        refused_joins: n.n_refused, returned: n.returned.toString(),
      });
    }
    case "rules":
      return JSON.stringify(RULES);
    default:
      throw new Error("the mock has no view " + fn);
  }
}

// ---- transactions ---------------------------------------------------------------------------------

const pending = new Map<string, { fn: string; polls: number; result: Row; error: string; judged: boolean }>();
let txCount = 0;
const fakeHash = () => "0x" + (++txCount).toString(16).padStart(8, "0") + "e7c1a05e".repeat(7);

/** Runs one call as `sender` and records it as a transaction; the hash comes back at once. */
function send(sender: string, fn: WriteFn, args: unknown[], value: bigint): string {
  if (value > balance(sender)) throw new Error("insufficient funds for this demo account");
  if (value > 0n) {
    credit(sender, -value);
    contractBalance += value;
  }
  let result: Row = {};
  let error = "";
  try {
    result = run(fn, args, { sender, value, now: mockNow() });
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    // A raised refusal changes nothing; no write that takes value raises, but the value goes back regardless.
    if (value > 0n) {
      contractBalance -= value;
      credit(sender, value);
    }
    error = e.message;
  }
  const hash = fakeHash();
  pending.set(hash, { fn, polls: 0, result, error, judged: fn === "reply" && !error });
  notify();
  return hash;
}

export async function write(call: Call): Promise<string> {
  seed();
  await delay(250);
  return send(persona.toLowerCase(), call.fn, call.args, call.value ?? 0n);
}

const STAGES = ["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED", "FINALIZED"];
const NO_VOTES = { agree: 0, disagree: 0, idle: 0 };

export async function txStatus(hash: string): Promise<TxStatus> {
  await delay(60);
  const p = pending.get(hash);
  if (!p) return { status: "UNKNOWN", votes: NO_VOTES, applied: null, undetermined: false, exec: null, result: null, message: "" };
  p.polls += 1;
  // A reply is read by every validator, twice, so it moves slower than a plain call.
  const stages = p.judged ? Math.max(1, Math.floor(p.polls / 2)) : p.polls;
  const done = stages >= STAGES.length;
  // Studio assigns five validators and one is often idle in a round; the mock shows the same shape.
  const agree = done ? 4 : p.judged ? Math.min(Math.max(0, stages - 2), 4) : 0;
  return {
    status: STAGES[Math.min(stages - 1, STAGES.length - 1)],
    votes: { agree, disagree: 0, idle: done || agree ? 5 - agree : 0 },
    applied: done ? true : null,
    undetermined: false,
    exec: done ? (p.error ? "ERROR" : "SUCCESS") : null,
    result: done && !p.error ? p.result : null,
    message: done ? p.error || JSON.stringify(p.result) : "",
  };
}

export async function balanceOf(address: string): Promise<bigint> {
  await delay(40);
  return balance(address);
}

export async function faucet(address: string): Promise<bigint> {
  await delay(500);
  credit(address, 10n * GEN);
  return balance(address);
}

// ---- the demo provider -----------------------------------------------------------------------------

export function demoStatus(): DemoStatus {
  return { online: true, provider: DEMO_PROVIDER, reason: "" };
}

/** The in-memory twin of POST /api/demo/reply: the demo provider sends its plan's scripted reply. */
export async function demoReply(raw: string): Promise<DemoReplyAnswer> {
  seed();
  await delay(300);
  const id = pyStrip(String(raw ?? "")).slice(0, ID_CHARS);
  const req = requestRows.get(id);
  if (!req) return { ok: false, reason: "no request " + id };
  const plan = planRows.get(req.plan_id)!;
  const reason = demoReplyProblem({ id, status: req.status, replies: req.replies.length, deadline: req.deadline }, plan, DEMO_PROVIDER, mockNow());
  if (reason) return { ok: false, reason };
  return { ok: true, hash: send(DEMO_PROVIDER, "reply", [id, demoPlanByName(plan.name)!.reply], 0n) };
}

// ---- seeding ---------------------------------------------------------------------------------------

let seeded = false;

/** Runs a call at a given instant, outside the transaction log: the seeded past. */
function at(sender: string, now: number, fn: WriteFn, args: unknown[], value = 0n): Row {
  if (value > 0n) {
    credit(sender, -value);
    contractBalance += value;
  }
  return run(fn, args, { sender, value, now });
}

function seed(): void {
  if (seeded) return;
  seeded = true;
  const now = mockNow();
  const MIN = 60;
  const HOUR = 3600;
  const DAY = 86400;
  // P1 to P3: the demo provider's three plans, opened three days ago.
  for (const p of DEMO_PLANS) at(DEMO_PROVIDER, now - 3 * DAY, "open_plan", openArgs(p));
  // P4, P5: the "You, a provider" persona's own plans. P6: another provider's.
  at(MY_PROVIDER, now - 40 * DAY, "open_plan", ["Stillwater Yoga, unlimited", ((GEN * 4n) / 10n).toString(), 30 * DAY, 2 * DAY]);
  at(MY_PROVIDER, now - 30 * DAY, "open_plan", ["Paperleaf book box", ((GEN * 6n) / 10n).toString(), 7 * DAY, DAY]);
  at(OTHER_PROVIDER, now - 30 * DAY, "open_plan", ["Brightline Cloud 2 TB", (GEN / 5n).toString(), 30 * DAY, 3 * DAY]);
  const E = EARLIER_MEMBER;
  const msg = (k: number) => MESSAGE_CHIPS[k].value;
  const gym = DEMO_PLANS[0];
  const stream = DEMO_PLANS[1];
  const lingo = DEMO_PLANS[2];
  // M1 / R1, Ironside Gym: honoured, and the fee collected for the gym once the period ended.
  let t = now - 2 * DAY;
  at(E, t, "join", ["P1"], BigInt(gym.feeAtto));
  at(E, t + 4 * MIN, "cancel", ["M1", msg(0)]);
  at(DEMO_PROVIDER, t + 6 * MIN, "reply", ["R1", gym.reply]);
  at(PASSER_BY, t + 20 * MIN, "collect", ["M1"]);
  // M2 / R2, Northwind Stream: "please call us", stalled; the fee went back at once.
  t = now - DAY;
  at(E, t, "join", ["P2"], BigInt(stream.feeAtto));
  at(E, t + 3 * MIN, "cancel", ["M2", msg(1)]);
  at(DEMO_PROVIDER, t + 5 * MIN, "reply", ["R2", stream.reply]);
  // M3 / R3, Lingo Daily Pro: a discount to answer first, stalled.
  t = now - 6 * HOUR;
  at(E, t, "join", ["P3"], BigInt(lingo.feeAtto));
  at(E, t + 2 * MIN, "cancel", ["M3", msg(3)]);
  at(DEMO_PROVIDER, t + 4 * MIN, "reply", ["R3", lingo.reply]);
  // M4 / R4, Paperleaf: nobody answered in a day, and an earlier member lapsed it for the passer-by.
  at(PASSER_BY, now - 6 * DAY, "join", ["P5"], (GEN * 6n) / 10n);
  at(PASSER_BY, now - 3 * DAY, "cancel", ["M4", msg(2)]);
  at(E, now - 2 * DAY + HOUR, "lapse", ["R4"]);
  // M5 / R5, Brightline Cloud: a vague first reply, unclear; one reply left and two days on the window.
  at(E, now - 4 * DAY, "join", ["P6"], GEN / 5n);
  at(E, now - 20 * HOUR, "cancel", ["M5", msg(4)]);
  at(OTHER_PROVIDER, now - 18 * HOUR, "reply", ["R5", REPLY_CHIPS[3].value]);
  // M6 / R6, Stillwater Yoga: sent an hour ago, waiting for "You, a provider" to reply.
  at(E, now - 10 * DAY, "join", ["P4"], (GEN * 4n) / 10n);
  at(E, now - HOUR, "cancel", ["M6", msg(5)]);
  // M7: the visitor's own running membership of Stillwater Yoga.
  at(VISITOR, now - 3 * DAY, "join", ["P4"], (GEN * 4n) / 10n);
  // M8: an earlier member's Paperleaf week that ended yesterday with nothing open: anyone may collect it.
  at(E, now - 8 * DAY, "join", ["P5"], (GEN * 6n) / 10n);
}

/** Test hook: the contract's held total and its own balance, which must always be equal. */
export function mockHeld(): { held: bigint; balance: bigint } {
  seed();
  return { held: n.held, balance: contractBalance };
}

/** Every account the mock knows, for the tests' conservation checks. */
export const ACCOUNTS = [VISITOR, MY_PROVIDER, EARLIER_MEMBER, PASSER_BY, DEMO_PROVIDER, OTHER_PROVIDER];
