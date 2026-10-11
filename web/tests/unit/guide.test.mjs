// The waiting words of lib/guide.ts, for every state and every role, from node with no browser: each
// in-between state says what is happening and who it waits for, how long or until when, what is
// needed from the viewer, whether they can close the page, and where the money is; each closed state
// says nothing is left to do and where the money ended up. Then one walk through the in-memory
// contract (join, cancel, the demo provider's honoured reply, the period, collect), with the guide
// asked at every step.

import test from "node:test";
import assert from "node:assert/strict";

import {
  KICKERS,
  NOTHING_LEFT,
  NOTHING_NEEDED,
  deskGuide,
  memberStatusOf,
  membershipGuide,
  membershipLine,
  sendingGuide,
  signGuide,
  threadGuide,
  threadLine,
  updatingGuide,
} from "../../lib/guide.ts";
import { clockTime, gen } from "../../lib/format.ts";
import * as mock from "../../lib/chain-mock.ts";
import { calls } from "../../lib/calls.ts";
import { DEMO_PLANS } from "../../lib/demo-plans.ts";
import { MESSAGE_CHIPS } from "../../lib/suggestions.ts";

const GEN = 10n ** 18n;
const FEE = (GEN / 4n).toString(); // 0.25 GEN
const NOW = 1_800_000_000;
const ROLES = ["member", "provider", "visitor"];

/** Every guide has all five answers, in words, and a kicker. */
function complete(g, where) {
  for (const k of ["id", "kicker", "now", "time", "need", "leave", "money"]) assert.ok(typeof g[k] === "string" && g[k].trim().length > 0, `${where}: ${k} is said`);
  assert.equal(typeof g.canLeave, "boolean", `${where}: whether to stay is said`);
  assert.ok(["busy", "clock", "late", "ready", "done"].includes(g.tone), `${where}: a known tone`);
  assert.ok(!/undefined|NaN|null/.test(JSON.stringify(g)), `${where}: no missing value printed`);
  if (g.canLeave) assert.match(g.leave, /You can close this page/, `${where}: says plainly that the page can be closed`);
  else assert.match(g.leave, /^Stay/, `${where}: says plainly to stay`);
}

const thread = (over = {}) => ({
  role: "member",
  now: NOW,
  id: "R4",
  membership: "M7",
  status: "open",
  deadline: NOW + 600,
  replies: 0,
  repliesLeft: 2,
  memberStatus: "cancelling",
  end: NOW + 900,
  feeAtto: FEE,
  heldAtto: FEE,
  refundedAtto: "0",
  ...over,
});

/** Every state of a thread, as the request page reaches it. */
const THREAD_STATES = {
  "provider-clock": {},
  "demo-writing": { demo: true, demoState: "writing" },
  "demo-asking": { demo: true, demoState: "asking" },
  "demo-late": { demo: true, demoState: "late" },
  "demo-failed": { demo: true, demoState: "failed", demoReason: "The demo provider is resting for a minute." },
  "demo-idle": { demo: true, demoState: "idle" },
  "demo-silent": { demo: true, demoState: "silent" },
  "not-stored": { demo: true, demoState: "not-stored" },
  judging: { judging: "busy" },
  "judging-late": { judging: "late" },
  "unclear-wait": { replies: 1, repliesLeft: 1 },
  "unclear-last": { replies: 2, repliesLeft: 0 },
  "unclear-demo": { replies: 1, repliesLeft: 1, demo: true },
  "lapse-ready": { now: NOW + 601 },
  lapse: { now: NOW + 601, sending: "lapse" },
  "collect-clock": { status: "honoured", memberStatus: "cancelled", replies: 1 },
  "collect-ready": { status: "honoured", memberStatus: "cancelled", replies: 1, now: NOW + 901 },
  collect: { status: "honoured", memberStatus: "cancelled", replies: 1, now: NOW + 901, sending: "collect" },
  "closed-served": { status: "honoured", memberStatus: "served", replies: 1, heldAtto: "0", collectedAtto: FEE, closedAt: NOW + 950 },
  "closed-stalled": { status: "stalled", memberStatus: "refunded", replies: 1, heldAtto: "0", refundedAtto: FEE, closedAt: NOW + 100 },
  "closed-lapsed": { status: "lapsed", memberStatus: "refunded", heldAtto: "0", refundedAtto: FEE, now: NOW + 700, closedAt: NOW + 650 },
};

test("every thread state, for the member, the provider and anyone else, answers all five questions", () => {
  for (const [name, over] of Object.entries(THREAD_STATES))
    for (const role of ROLES) {
      const g = threadGuide(thread({ ...over, role }));
      complete(g, `${name} as ${role}`);
      assert.match(g.money, /0\.25 GEN/, `${name} as ${role}: the amount is said`);
      assert.equal(g.kicker.length > 0, true);
    }
});

test("the owner's case: honoured, the period still running, the member has nothing to do and may leave", () => {
  const g = threadGuide(thread({ status: "honoured", memberStatus: "cancelled", replies: 1 }));
  const end = clockTime(NOW + 900, NOW);
  assert.equal(g.id, "collect-clock");
  assert.equal(g.waitsFor, "clock");
  assert.equal(g.need, NOTHING_NEEDED);
  assert.equal(g.canLeave, true);
  assert.match(g.leave, /^You can close this page; R4 stays under My memberships/);
  assert.match(g.money, new RegExp(`^0\\.25 GEN is held by the contract for the provider until ${end}`));
  assert.match(g.money, /anyone may press Collect/);
  assert.doesNotMatch(g.money, /back to you/, "an honoured fee never comes back to the member");
  assert.equal(g.left, 900);
  assert.match(g.time, new RegExp(end));

  const p = threadGuide(thread({ role: "provider", status: "honoured", memberStatus: "cancelled", replies: 1 }));
  assert.equal(p.need, `Nothing until ${end}. Then press Collect (anyone may) and 0.25 GEN reaches you.`);
  assert.match(p.leave, /Provider desk/);
});

test("who it waits for follows the state and the role", () => {
  const w = (over, role) => threadGuide(thread({ ...over, role })).waitsFor;
  assert.equal(w({}, "member"), "provider");
  assert.equal(w({}, "visitor"), "provider");
  assert.equal(w({}, "provider"), "you", "the provider is told its reply is due");
  assert.equal(threadGuide(thread({ role: "provider" })).id, "reply-due");
  assert.equal(w({ judging: "busy" }, "member"), "validators");
  assert.equal(w({ demo: true, demoState: "writing" }, "member"), "demo");
  assert.equal(w({ replies: 1, repliesLeft: 1 }, "member"), "provider");
  assert.equal(w({ replies: 1, repliesLeft: 1 }, "provider"), "you");
  assert.equal(threadGuide(thread({ role: "provider", replies: 1, repliesLeft: 1 })).id, "reply-again");
  assert.equal(w({ replies: 2, repliesLeft: 0 }, "member"), "clock");
  assert.equal(w({ replies: 1, repliesLeft: 1, demo: true }, "member"), "clock", "the demo provider does not reply twice");
  assert.equal(w({ now: NOW + 601 }, "member"), "you");
  assert.equal(w({ now: NOW + 601 }, "visitor"), "anyone");
  assert.equal(w({ status: "honoured", memberStatus: "cancelled", now: NOW + 901 }, "provider"), "you");
  assert.equal(w({ status: "honoured", memberStatus: "cancelled", now: NOW + 901 }, "member"), "anyone");
  for (const g of [threadGuide(thread({ status: "stalled", memberStatus: "refunded", heldAtto: "0", refundedAtto: FEE }))]) assert.equal(g.kicker, KICKERS.done);
});

test("unclear with a reply left: the member waits, then lapse is theirs to press", () => {
  const before = threadGuide(thread({ replies: 1, repliesLeft: 1 }));
  assert.equal(before.id, "unclear-wait");
  assert.equal(before.need, NOTHING_NEEDED);
  assert.match(before.leave, /Lapse button waits for you there/);
  const after = threadGuide(thread({ replies: 1, repliesLeft: 1, now: NOW + 600 }));
  assert.equal(after.id, "lapse-ready");
  assert.equal(after.need, "Press Lapse R4 and 0.25 GEN comes back to you.");
  assert.match(after.money, /Lapse sends all of it back to you/);
  const stranger = threadGuide(thread({ role: "visitor", replies: 1, repliesLeft: 1, now: NOW + 600 }));
  assert.match(stranger.need, /whoever sends it/);
});

test("wallet prompts and transactions on their way say to stay only while a signature waits", () => {
  for (const fn of ["open_plan", "close_plan", "join", "cancel", "reply", "lapse", "collect"]) {
    const g = signGuide({ fn, label: "Doing it", feeAtto: FEE });
    complete(g, `sign ${fn}`);
    assert.equal(g.canLeave, false);
    assert.equal(g.waitsFor, "you");
    const m = signGuide({ fn, label: "Doing it", feeAtto: FEE, mock: true });
    complete(m, `mock sign ${fn}`);
  }
  assert.match(signGuide({ fn: "join", label: "Joining P3", feeAtto: FEE }).money, /^0\.25 GEN is still in your wallet/);
  for (const fn of ["join", "cancel", "collect", "close_plan", "open_plan"])
    for (const demo of [false, true]) {
      const g = sendingGuide({ fn, role: "member", planName: "Ironside Gym", planId: "P3", target: "M7", feeAtto: FEE, period: 900, replyWindow: 600, demo });
      complete(g, `sending ${fn}${demo ? " (demo)" : ""}`);
      assert.equal(g.waitsFor, "validators");
    }
  const demoCancel = sendingGuide({ fn: "cancel", role: "member", planName: "Ironside Gym", planId: "P3", feeAtto: FEE, replyWindow: 600, demo: true });
  assert.equal(demoCancel.canLeave, false, "a demo cancellation asks the demo provider from the thread, so stay");
  const join = sendingGuide({ fn: "join", role: "member", planName: "Ironside Gym", planId: "P3", feeAtto: FEE, period: 900 });
  assert.match(join.money, /holds it for 15 minutes/);
  assert.match(join.money, /refused join sends all of it back/);
  complete(updatingGuide("Final. Updating the thread…"), "updating");
});

test("the member's own membership, on a plan's page, in every status", () => {
  const base = { now: NOW, id: "M7", end: NOW + 900, feeAtto: FEE, heldAtto: FEE, refundedAtto: "0", collectedAtto: "0", request: "" };
  const cases = [
    [{ status: "live" }, "live"],
    [{ status: "cancelling", request: "R4", deadline: NOW + 600 }, "cancelling"],
    [{ status: "cancelling", request: "R4", demo: true }, "cancelling"],
    [{ status: "cancelled", request: "R4" }, "collect-clock"],
    [{ status: "cancelled", request: "R4", now: NOW + 901 }, "collect-ready"],
    [{ status: "live", now: NOW + 901 }, "collect-ready"],
    [{ status: "refunded", heldAtto: "0", refundedAtto: FEE }, "closed-refunded"],
    [{ status: "served", heldAtto: "0", collectedAtto: FEE }, "closed-served"],
  ];
  for (const [over, id] of cases) {
    const g = membershipGuide({ ...base, ...over });
    complete(g, `membership ${over.status}`);
    assert.equal(g.id, id);
    assert.match(g.money, /0\.25 GEN/);
    assert.ok(membershipLine({ ...base, ...over }).length > 10);
  }
  const live = membershipGuide({ ...base, status: "live" });
  assert.equal(live.waitsFor, "nobody");
  assert.match(live.need, /^Nothing is needed from you\. To leave the plan, send a cancellation below/);
  const done = membershipGuide({ ...base, status: "refunded", heldAtto: "0", refundedAtto: FEE });
  assert.match(done.need, /^Nothing is left to do here\./);
  assert.equal(done.money, "0.25 GEN went back to your wallet.");
});

test("every closed thread says nothing is left to do and where the money ended up", () => {
  const ends = {
    "closed-served": [{ status: "honoured", memberStatus: "served", heldAtto: "0", collectedAtto: FEE }, { member: /went to the provider/, provider: /paid to you/, visitor: /went to the provider/ }],
    "closed-stalled": [{ status: "stalled", memberStatus: "refunded", heldAtto: "0", refundedAtto: FEE }, { member: /back to your wallet/, provider: /back to the member/, visitor: /back to the member/ }],
    "closed-lapsed": [{ status: "lapsed", memberStatus: "refunded", heldAtto: "0", refundedAtto: FEE }, { member: /back to your wallet by rule/, provider: /back to the member/, visitor: /back to the member/ }],
  };
  for (const [id, [over, money]] of Object.entries(ends))
    for (const role of ROLES) {
      const g = threadGuide(thread({ ...over, role, replies: 1 }));
      assert.equal(g.id, id);
      assert.equal(g.tone, "done");
      assert.equal(g.need, NOTHING_LEFT);
      assert.match(g.money, money[role], `${id} as ${role}`);
    }
});

test("the provider desk: replies due, a reply being judged, served periods, or nothing", () => {
  const d = { now: NOW, plans: 2, due: [], judging: [], collectable: 0, collectableAtto: "0", heldAtto: FEE, live: 1 };
  assert.equal(deskGuide({ ...d, plans: 0 }), null, "no plan, no panel");
  const quiet = deskGuide(d);
  complete(quiet, "desk quiet");
  assert.equal(quiet.id, "desk-quiet");
  assert.equal(quiet.need, NOTHING_NEEDED);
  const replies = deskGuide({ ...d, due: [{ id: "R9", deadline: NOW + 1200 }, { id: "R4", deadline: NOW + 300 }] });
  complete(replies, "desk replies");
  assert.equal(replies.waitsFor, "you");
  assert.match(replies.time, /on R4/, "the nearest deadline first");
  assert.equal(replies.left, 300);
  const judging = deskGuide({ ...d, judging: ["R4"], due: [{ id: "R9", deadline: NOW + 1200 }] });
  complete(judging, "desk judging");
  assert.equal(judging.waitsFor, "validators");
  assert.match(judging.need, /1 other cancellation still waits/);
  const collect = deskGuide({ ...d, collectable: 2, collectableAtto: (GEN / 2n).toString() });
  complete(collect, "desk collect");
  assert.match(collect.money, /0\.5 GEN is held by the contract for you/);
  assert.match(deskGuide({ ...d, heldAtto: "0", live: 0 }).money, /Nothing is held/);
});

test("one line per thread row, for each role", () => {
  for (const [name, over] of Object.entries(THREAD_STATES))
    for (const role of ROLES) {
      const line = threadLine(thread({ ...over, role }));
      assert.ok(line.length > 10 && !/undefined|NaN/.test(line), `${name} as ${role}: ${line}`);
    }
  assert.match(threadLine(thread({ role: "provider" })), /^Waits for your reply until /);
  assert.match(threadLine(thread({})), /nothing to do, you can leave$/);
  assert.match(threadLine(thread({ status: "honoured", memberStatus: "cancelled", replies: 1 })), /^Honoured · nothing to do; 0\.25 GEN held for the provider until /);
  assert.equal(threadLine(thread({ now: NOW + 601 })), "Window closed · press Lapse to get 0.25 GEN back");
  assert.equal(memberStatusOf({ status: "honoured", heldAtto: "0" }), "served");
  assert.equal(memberStatusOf({ status: "honoured", heldAtto: FEE }), "cancelled");
  assert.equal(memberStatusOf({ status: "lapsed", heldAtto: "0" }), "refunded");
});

// ---- one walk through the in-memory contract --------------------------------------------------------

async function finalOf(hash) {
  for (let i = 0; i < 40; i++) {
    const s = await mock.txStatus(hash);
    if (s.status === "FINALIZED") return s;
  }
  throw new Error("never finalized: " + hash);
}
const view = async (fn, args) => JSON.parse(await mock.view(fn, args));
const asThread = (r, m, role) => ({
  role,
  now: mock.mockNow(),
  id: r.request,
  membership: r.membership,
  status: r.status,
  deadline: r.deadline,
  replies: r.replies.length,
  repliesLeft: r.replies_left,
  memberStatus: m.status,
  end: m.end,
  feeAtto: m.fee,
  heldAtto: m.held,
  refundedAtto: m.refunded,
  collectedAtto: m.collected,
  demo: true,
});

test("the main flow, step by step: join, cancel, honoured, the period, collect", async () => {
  const gym = DEMO_PLANS.find((p) => p.key === "gym") ?? DEMO_PLANS[0];
  const page = await view("plans", [0, 20]);
  const plan = page.rows.find((r) => r.name === gym.name && r.provider === mock.DEMO_PROVIDER);
  assert.ok(plan, "the gym is open on the demo provider");
  mock.setMockPersona(mock.VISITOR);
  const j = await finalOf(await mock.write(calls.join(plan.plan, BigInt(gym.feeAtto))));
  const mId = j.result.membership;
  let m = await view("membership", [mId]);
  let g = membershipGuide({ now: mock.mockNow(), id: mId, status: m.status, end: m.end, feeAtto: m.fee, heldAtto: m.held, refundedAtto: m.refunded, collectedAtto: m.collected, request: "" });
  assert.equal(g.id, "live");
  assert.equal(g.need.startsWith(NOTHING_NEEDED), true);

  const c = await finalOf(await mock.write(calls.cancel(mId, MESSAGE_CHIPS[0].value)));
  const rId = c.result.request;
  let r = await view("request", [rId]);
  m = await view("membership", [mId]);
  g = threadGuide({ ...asThread(r, m, "member"), demoState: "writing" });
  assert.equal(g.id, "demo-writing");
  assert.equal(g.canLeave, true);

  const answer = await mock.demoReply(rId);
  assert.equal(answer.ok, true);
  await finalOf(answer.hash);
  r = await view("request", [rId]);
  m = await view("membership", [mId]);
  assert.equal(r.status, "honoured");
  g = threadGuide(asThread(r, m, "member"));
  assert.equal(g.id, "collect-clock");
  assert.equal(g.need, NOTHING_NEEDED);
  assert.equal(threadGuide(asThread(r, m, "provider")).waitsFor, "clock");

  mock.advanceClock(m.end - mock.mockNow() + 1);
  g = threadGuide(asThread(r, m, "member"));
  assert.equal(g.id, "collect-ready");
  assert.equal(threadGuide(asThread(r, m, "provider")).need, `Press Collect and ${gen(m.held)} reaches you.`);

  mock.setMockPersona(mock.PASSER_BY);
  await finalOf(await mock.write(calls.collect(mId)));
  r = await view("request", [rId]);
  m = await view("membership", [mId]);
  g = threadGuide(asThread(r, m, "member"));
  assert.equal(g.id, "closed-served");
  assert.equal(g.need, NOTHING_LEFT);
  assert.match(g.money, /went to the provider/);
});
