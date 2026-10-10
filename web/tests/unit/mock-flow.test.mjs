// Whole threads through the in-memory contract of mock mode, from node, with no browser:
//
//   node --test tests/unit/mock-flow.test.mjs
//
// A visitor joins each of the three demo plans, sends a cancellation, the demo provider replies in its
// own habit and the stamp lands: Ironside honours it, Northwind and Lingo stall it and the fee comes
// back in the same transaction. The honoured period is collected for the gym once it ends, a silent
// window lapses, and every refusal a visitor can meet is walked with its way out. After every step no
// atto is created or lost.

import test from "node:test";
import assert from "node:assert/strict";

import * as mock from "../../lib/chain-mock.ts";
import { calls } from "../../lib/calls.ts";
import { DEMO_PERIOD, DEMO_PLANS, DEMO_WINDOW } from "../../lib/demo-plans.ts";
import { MESSAGE_CHIPS, REPLY_CHIPS } from "../../lib/suggestions.ts";

const { VISITOR, DEMO_PROVIDER, PASSER_BY, EARLIER_MEMBER, OTHER_PROVIDER, MY_PROVIDER } = mock;

/** Every atto in the mock world: the accounts plus the contract's own balance. */
async function world() {
  let sum = mock.mockContractBalance();
  for (const a of mock.ACCOUNTS) sum += await mock.balanceOf(a);
  return sum;
}

/** The contract holds exactly what it says it holds, and nothing was created or lost. */
async function conserved(total, step) {
  const { held, balance } = mock.mockHeld();
  assert.equal(held, balance, `${step}: the contract's balance equals what it says it holds`);
  assert.equal(await world(), total, `${step}: no atto created or lost`);
}

async function finalOf(hash) {
  for (let i = 0; i < 40; i++) {
    const s = await mock.txStatus(hash);
    if (s.status === "FINALIZED") return s;
  }
  throw new Error("never finalized: " + hash);
}

async function send(as, call) {
  mock.setMockPersona(as);
  return finalOf(await mock.write(call));
}

const view = async (fn, args) => JSON.parse(await mock.view(fn, args));
const refusal = (s) => (s.exec === "ERROR" ? s.message : s.result?.ok === false ? s.result.reason : "");

async function demoPlanId(name) {
  const page = await view("plans", [0, 20]);
  const row = page.rows.find((r) => r.name === name && r.provider === DEMO_PROVIDER);
  assert.ok(row, `${name} is open on the demo provider`);
  return row.plan;
}

const memberships = {};

test("each demo plan: join, cancel, the demo provider's reply, and the stamp the money follows", async () => {
  const total = await world();
  await conserved(total, "seeded");
  for (const p of DEMO_PLANS) {
    const plan = await demoPlanId(p.name);
    const fee = BigInt(p.feeAtto);
    const start = await mock.balanceOf(VISITOR);
    const j = await send(VISITOR, calls.join(plan, fee));
    assert.equal(j.result.ok, true, `${p.name}: joined`);
    const m = j.result.membership;
    memberships[p.key] = m;
    assert.equal(await mock.balanceOf(VISITOR), start - fee, "the fee left the visitor");
    assert.equal((await view("membership", [m])).held, p.feeAtto, "and the contract holds it");
    await conserved(total, `${p.key} join`);

    const c = await send(VISITOR, calls.cancel(m, MESSAGE_CHIPS[0].value));
    assert.equal(c.result.ok, true);
    const req = c.result.request;
    assert.equal((await view("request", [req])).phase, "reply");

    const asked = await mock.demoReply(req);
    assert.equal(asked.ok, true, `${p.name}: the demo provider replies`);
    const r = await finalOf(asked.hash);
    assert.equal(r.result.verdict, p.expect, `${p.name}: stamped ${p.expect}`);
    const thread = await view("request", [req]);
    assert.equal(thread.replies[0].text, p.reply, "the scripted reply is on the thread");
    const mem = await view("membership", [m]);
    if (p.expect === "stalled") {
      assert.equal(thread.status, "stalled");
      assert.equal(r.result.refunded, p.feeAtto, "the month comes back in the same transaction");
      assert.equal(mem.status, "refunded");
      assert.equal(await mock.balanceOf(VISITOR), start, "the visitor has the fee back");
    } else {
      assert.equal(thread.status, "honoured");
      assert.equal(mem.status, "cancelled");
      assert.equal(mem.held, p.feeAtto, "an honoured month stays held for the provider");
      assert.equal(await mock.balanceOf(VISITOR), start - fee);
    }
    const again = await mock.demoReply(req);
    assert.equal(again.ok, false, "the demo provider replies once");
    await conserved(total, `${p.key} stamped`);
  }
});

test("an honoured period is collected for the gym once it has ended, and not a second earlier", async () => {
  const total = await world();
  const m = memberships.gym;
  const early = await send(PASSER_BY, calls.collect(m));
  assert.match(refusal(early), new RegExp(`the period of ${m} runs for another \\d+ seconds; its fee is held until it ends`));
  mock.advanceClock(DEMO_PERIOD);
  const before = await mock.balanceOf(DEMO_PROVIDER);
  const s = await send(PASSER_BY, calls.collect(m));
  assert.equal(s.result.ok, true);
  assert.equal(s.result.status, "served");
  assert.equal(await mock.balanceOf(DEMO_PROVIDER), before + BigInt(DEMO_PLANS[0].feeAtto), "the gym receives the fee, whoever sends it");
  assert.match(refusal(await send(VISITOR, calls.collect(m))), /was already collected/);
  await conserved(total, "collected");
});

test("silence: the window closes, the demo provider no longer answers, and anyone lapses it", async () => {
  const total = await world();
  const p = DEMO_PLANS[1];
  const plan = await demoPlanId(p.name);
  const start = await mock.balanceOf(VISITOR);
  const j = await send(VISITOR, calls.join(plan, BigInt(p.feeAtto)));
  assert.equal(j.result.ok, true, "a refunded membership is over, so the visitor may join again");
  const c = await send(VISITOR, calls.cancel(j.result.membership, MESSAGE_CHIPS[5].value));
  const req = c.result.request;
  assert.match(refusal(await send(PASSER_BY, calls.lapse(req))), new RegExp(`the provider of ${plan} may still reply to ${req}, for \\d+ seconds`));
  mock.advanceClock(DEMO_WINDOW);
  const late = await mock.demoReply(req);
  assert.equal(late.ok, false);
  assert.match(late.reason, /reply window of .* closed/);
  const s = await send(PASSER_BY, calls.lapse(req));
  assert.equal(s.result.status, "lapsed");
  assert.equal(s.result.refunded, p.feeAtto);
  assert.equal(await mock.balanceOf(VISITOR), start, "the fee came back by rule");
  assert.equal((await view("request", [req])).closed_by, PASSER_BY);
  await conserved(total, "lapsed");
});

test("the refusals a visitor can meet, each with its way out", async () => {
  const total = await world();
  const p = DEMO_PLANS[2];
  const plan = await demoPlanId(p.name);
  const fee = BigInt(p.feeAtto);
  // A join with the wrong fee is refused and everything sent comes back in the same transaction.
  const start = await mock.balanceOf(VISITOR);
  const wrong = await send(VISITOR, calls.join(plan, fee + 1n));
  assert.equal(wrong.result.ok, false);
  assert.equal(wrong.result.returned, String(fee + 1n));
  assert.match(wrong.result.reason, /send exactly the fee of \d+ atto to join P\d+; this one sent \d+/);
  assert.equal(await mock.balanceOf(VISITOR), start);
  // The way out: the exact fee.
  const ok = await send(VISITOR, calls.join(plan, fee));
  assert.equal(ok.result.ok, true);
  const m = ok.result.membership;
  // One live membership per plan.
  const twice = await send(VISITOR, calls.join(plan, fee));
  assert.match(twice.result.reason, new RegExp(`this address already holds ${m} in ${plan}; it may join again once ${m} ends`));
  // The provider may not join its own plan.
  const own = await send(DEMO_PROVIDER, calls.join(plan, fee));
  assert.match(own.result.reason, /may not join it/);
  // Only the member may cancel; a message too short is refused before anything is stored.
  assert.match(refusal(await send(PASSER_BY, calls.cancel(m, MESSAGE_CHIPS[0].value))), new RegExp(`only the member who holds ${m} may cancel it`));
  assert.match(refusal(await send(VISITOR, calls.cancel(m, "bye"))), /the message is 20 to 400 characters; this one is 3/);
  const c = await send(VISITOR, calls.cancel(m, MESSAGE_CHIPS[3].value));
  const req = c.result.request;
  assert.match(refusal(await send(VISITOR, calls.cancel(m, MESSAGE_CHIPS[3].value))), /already has its cancellation/);
  // Only the provider may reply.
  assert.match(refusal(await send(VISITOR, calls.reply(req, REPLY_CHIPS[0].value))), new RegExp(`only the provider of ${plan} may reply to ${req}`));
  const stalled = await finalOf((await mock.demoReply(req)).hash);
  assert.equal(stalled.result.verdict, "stalled");
  assert.match(refusal(await send(DEMO_PROVIDER, calls.reply(req, REPLY_CHIPS[0].value))), new RegExp(`${req} is stalled; a reply is taken while the request is open`));
  // The demo provider never answers for another provider's plan.
  const foreign = await mock.demoReply("R6");
  assert.equal(foreign.ok, false);
  assert.match(foreign.reason, /not on one of the demo provider's three plans/);
  await conserved(total, "refusals");
});

test("the provider desk: replying to its own thread, collecting a served week, and closing a plan", async () => {
  const total = await world();
  const reply = await send(MY_PROVIDER, calls.reply("R6", REPLY_CHIPS[0].value));
  assert.equal(reply.result.verdict, "honoured");
  assert.equal(reply.result.membership_status, "cancelled");
  const m8 = await view("membership", ["M8"]);
  assert.equal(m8.collectable, true, "the earlier member's Paperleaf week is over with nothing open");
  const before = await mock.balanceOf(MY_PROVIDER);
  const s = await send(MY_PROVIDER, calls.collect("M8"));
  assert.equal(s.result.collected, m8.fee);
  assert.equal(await mock.balanceOf(MY_PROVIDER), before + BigInt(m8.fee));
  assert.match(refusal(await send(VISITOR, calls.closePlan("P4"))), /only the provider of P4 may close it/);
  const closed = await send(MY_PROVIDER, calls.closePlan("P4"));
  assert.equal(closed.result.status, "closed");
  const late = await send(PASSER_BY, calls.join("P4", (10n ** 18n * 4n) / 10n));
  assert.match(late.result.reason, /P4 is closed and takes no new members/);
  assert.match(refusal(await send(MY_PROVIDER, calls.closePlan("P4"))), /P4 is already closed/);
  const reopened = await send(MY_PROVIDER, calls.openPlan("Stillwater Yoga, unlimited", (10n ** 18n * 4n) / 10n, 30 * 86400, 2 * 86400));
  assert.equal(reopened.result.ok, true, "a closed plan's name may be opened again");
  const dup = await send(MY_PROVIDER, calls.openPlan("stillwater yoga, UNLIMITED", 10n ** 17n, 300, 300));
  assert.match(refusal(dup), /this address already runs an open plan named/);
  await conserved(total, "provider desk");
});

test("two unclear replies leave the provider no third, and the window's end gives the member the fee back", async () => {
  const total = await world();
  const before = await view("request", ["R5"]);
  assert.deepEqual(before.verdicts, ["unclear"], "the seeded Brightline thread has one unclear reply");
  const second = await send(OTHER_PROVIDER, calls.reply("R5", REPLY_CHIPS[3].value));
  assert.equal(second.result.verdict, "unclear");
  assert.equal(second.result.status, "open");
  assert.match(refusal(await send(OTHER_PROVIDER, calls.reply("R5", REPLY_CHIPS[0].value))), /R5 has had its 2 replies and neither settled it; once the window closes, lapse\(R5\) gives the member the fee back/);
  mock.advanceClock(3 * 86400);
  const start = await mock.balanceOf(EARLIER_MEMBER);
  const s = await send(EARLIER_MEMBER, calls.lapse("R5"));
  assert.equal(s.result.status, "lapsed");
  assert.equal(await mock.balanceOf(EARLIER_MEMBER), start + BigInt(before.fee));
  await conserved(total, "two unclear, then lapsed");
});
