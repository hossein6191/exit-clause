// The demo provider's three plans, and the three samples a visitor can open as a provider.
//
// The demo provider is a throwaway Studio key held by the site's server (DEMO_PROVIDER_KEY). It
// opens the three plans below once (tools/open-demo-plans.mjs), and afterwards signs one kind of
// call only: the scripted reply of the plan, to a cancellation on that plan that is open, inside its
// window and not yet replied to. One plan takes any number of members, so no copies are needed.
// Each period is short, so a visitor can also watch a held fee being collected. The brands are
// fictional. Pure, so node runs it in tests/unit.

import { MAX_NAME, MAX_REPLY, MIN_NAME, MIN_REPLY, type Verdict } from "./rules.ts";

export type DemoPlan = {
  key: "gym" | "stream" | "lingo";
  name: string;
  feeAtto: string;
  /** seconds in one period */
  period: number;
  /** seconds the provider has to reply */
  window: number;
  /** what this provider writes back to every cancellation, word for word */
  reply: string;
  /** what the in-memory contract of mock mode answers for that reply; on chain the validators decide */
  expect: Verdict;
  /** the provider's habit, in a few words */
  habit: string;
};

const GEN = 10n ** 18n;

export const DEMO_PERIOD = 15 * 60;
export const DEMO_WINDOW = 10 * 60;

export const DEMO_PLANS: DemoPlan[] = [
  {
    key: "gym",
    name: "Ironside Gym, monthly",
    feeAtto: (GEN / 2n).toString(),
    period: DEMO_PERIOD,
    window: DEMO_WINDOW,
    reply:
      "Hi, this is Ironside Gym. Your membership is cancelled as you asked. It stays active until the end of the current month and ends then. No further payments will be taken and there is nothing else you need to do.",
    expect: "honoured",
    habit: "replies with a clean confirmation",
  },
  {
    key: "stream",
    name: "Northwind Stream, premium",
    feeAtto: ((GEN * 3n) / 10n).toString(),
    period: DEMO_PERIOD,
    window: DEMO_WINDOW,
    reply:
      "Thanks for being with Northwind Stream. To cancel your premium plan, please call our customer care line on 0808 157 0192, Monday to Friday between 9am and 5pm, so that an agent can verify your account and process the cancellation.",
    expect: "stalled",
    habit: "asks you to phone a care line to cancel",
  },
  {
    key: "lingo",
    name: "Lingo Daily Pro",
    feeAtto: (GEN / 4n).toString(),
    period: DEMO_PERIOD,
    window: DEMO_WINDOW,
    reply:
      "Before you go: we would like to offer you 50% off Lingo Daily Pro for the next three months. Please reply to let us know whether you accept this offer or still wish to cancel, and we will process your request once we hear back from you.",
    expect: "stalled",
    habit: "offers 50% off and waits for your answer first",
  },
];

export const demoPlanByName = (name: string): DemoPlan | null => DEMO_PLANS.find((p) => p.name === name) ?? null;

/** True when a plan is one of the demo provider's three: its name and its provider both match. */
export function isDemoPlan(plan: { name: string; provider: string }, demoProvider: string): boolean {
  return !!demoProvider && plan.provider.toLowerCase() === demoProvider.toLowerCase() && !!demoPlanByName(plan.name);
}

/** open_plan's arguments for a demo plan, in the contract's order. */
export const openArgs = (p: { name: string; feeAtto: string; period: number; window: number }): [string, string, number, number] => [
  p.name,
  p.feeAtto,
  p.period,
  p.window,
];

/**
 * Why the demo provider will not reply to this request now, in words a visitor can act on; "" when it
 * will. The server asks this of a fresh read before it signs, and so does the in-memory contract.
 */
export function demoReplyProblem(
  req: { id: string; status: string; replies: number; deadline: number },
  plan: { name: string; provider: string },
  demoProvider: string,
  now: number,
): string {
  if (!isDemoPlan(plan, demoProvider)) return `${req.id} is not on one of the demo provider's three plans; only that plan's own provider can reply to it`;
  if (req.status !== "open") return `${req.id} is ${req.status}; the demo provider replies only to an open request`;
  if (req.replies > 0) return `the demo provider has already replied to ${req.id}`;
  if (now >= req.deadline) return `the reply window of ${req.id} closed; lapse(${req.id}) gives the member the fee back`;
  return "";
}

/** A plan a visitor can open as a provider with one click: every field filled, every value inside the limits. */
export type SamplePlan = { key: string; name: string; feeAtto: string; period: number; window: number; note: string };

export const SAMPLE_PLANS: SamplePlan[] = [
  { key: "climb", name: "Riverside Climbing, monthly", feeAtto: (GEN / 2n).toString(), period: 30 * 86400, window: 2 * 86400, note: "a month's pass, two days to reply" },
  { key: "coffee", name: "Daily Grind coffee club", feeAtto: (GEN / 4n).toString(), period: 7 * 86400, window: 86400, note: "a weekly bag of beans, a day to reply" },
  { key: "chef", name: "Pocket Chef recipes, trial", feeAtto: (GEN / 10n).toString(), period: 30 * 60, window: 5 * 60, note: "a half-hour trial, five minutes to reply" },
];

/** True when every text of the demo is inside the contract's limits (the unit tests also check this). */
export function demoTextsFit(): boolean {
  const ascii = (t: string) => /^[\x20-\x7e]+$/.test(t);
  return (
    DEMO_PLANS.every((p) => p.reply.length >= MIN_REPLY && p.reply.length <= MAX_REPLY && ascii(p.reply) && p.name.length >= MIN_NAME && p.name.length <= MAX_NAME) &&
    SAMPLE_PLANS.every((p) => p.name.length >= MIN_NAME && p.name.length <= MAX_NAME && ascii(p.name))
  );
}
