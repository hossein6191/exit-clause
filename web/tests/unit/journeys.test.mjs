// Seeded random journeys through the in-memory contract: anyone does anything, in any order, and the
// clock jumps. After every step no atto is created or lost, the contract's balance is exactly the
// fees it says it holds, and every membership's fee is in exactly one place: held, refunded to the
// member, or collected for the provider.

import test from "node:test";
import assert from "node:assert/strict";

import * as mock from "../../lib/chain-mock.ts";
import { calls } from "../../lib/calls.ts";
import { SAMPLE_PLANS } from "../../lib/demo-plans.ts";
import { FEE_CHIPS, MESSAGE_CHIPS, NAME_CHIPS, PERIOD_CHIPS, REPLY_CHIPS, WINDOW_CHIPS } from "../../lib/suggestions.ts";

const HOLDING = ["live", "cancelling", "cancelled"];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const view = async (fn, args) => JSON.parse(await mock.view(fn, args));

async function finalOf(hash) {
  for (let i = 0; i < 40; i++) {
    const s = await mock.txStatus(hash);
    if (s.status === "FINALIZED") return s;
  }
  throw new Error("never finalized");
}

async function check(total, step) {
  let sum = mock.mockContractBalance();
  for (const a of mock.ACCOUNTS) sum += await mock.balanceOf(a);
  assert.equal(sum, total, `${step}: no atto created or lost`);
  const stats = await view("stats", []);
  let held = 0n;
  let paid = 0n;
  for (let k = 1; k <= stats.memberships; k++) {
    const m = await view("membership", ["M" + k]);
    const fee = BigInt(m.fee);
    paid += fee;
    const parts = [BigInt(m.held), BigInt(m.refunded), BigInt(m.collected)];
    assert.equal(parts[0] + parts[1] + parts[2], fee, `${step}: M${k}'s fee is in exactly one place`);
    assert.equal(parts.filter((x) => x > 0n).length, 1, `${step}: M${k}'s fee is not split`);
    if (HOLDING.includes(m.status)) assert.equal(parts[0], fee, `${step}: M${k} (${m.status}) is held`);
    if (m.status === "refunded") assert.equal(parts[1], fee, `${step}: M${k} went back to the member`);
    if (m.status === "served") assert.equal(parts[2], fee, `${step}: M${k} went to the provider`);
    held += parts[0];
  }
  assert.equal(BigInt(stats.held), held, `${step}: stats().held is the sum of the held fees`);
  const { held: said, balance } = mock.mockHeld();
  assert.equal(said, held, `${step}: the held total is the memberships' held fees`);
  assert.equal(balance, held, `${step}: the contract's balance is what it holds`);
  assert.equal(BigInt(stats.refunded) + BigInt(stats.collected) + held, paid, `${step}: every fee ever paid is held, refunded or collected`);
}

test("four hundred random steps keep every atto accounted for", async () => {
  const r = rng(20261011);
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  let total = mock.mockContractBalance();
  for (const a of mock.ACCOUNTS) total += await mock.balanceOf(a);
  await check(total, "start");
  const kinds = new Map();
  for (let step = 0; step < 400; step++) {
    const who = pick(mock.ACCOUNTS);
    mock.setMockPersona(who);
    const stats = await view("stats", []);
    const plan = "P" + (1 + Math.floor(r() * stats.plans));
    const membership = "M" + (1 + Math.floor(r() * Math.max(1, stats.memberships)));
    const request = "R" + (1 + Math.floor(r() * Math.max(1, stats.requests)));
    const roll = r();
    let hash = "";
    let kind = "";
    if (roll < 0.06) {
      mock.advanceClock(pick([60, 300, 600, 900, 3600, 86400, 3 * 86400]));
      continue;
    } else if (roll < 0.12) {
      kind = "open_plan";
      const s = r() < 0.5 ? pick(SAMPLE_PLANS) : { name: pick(NAME_CHIPS), feeAtto: String(pick(FEE_CHIPS).value), period: pick(PERIOD_CHIPS).value, window: pick(WINDOW_CHIPS).value };
      hash = await mock.write(calls.openPlan(s.name, BigInt(s.feeAtto), s.period, s.window));
    } else if (roll < 0.15) {
      kind = "close_plan";
      hash = await mock.write(calls.closePlan(plan));
    } else if (roll < 0.42) {
      kind = "join";
      const p = await view("plan", [plan]);
      const fee = BigInt(p.fee);
      // A drained account asks the faucet first; the faucet's 10 GEN joins the world's total.
      if ((await mock.balanceOf(who)) < fee) {
        await mock.faucet(who);
        total += 10n ** 19n;
      }
      hash = await mock.write(calls.join(plan, r() < 0.25 ? fee / 2n + 1n : fee));
    } else if (roll < 0.6) {
      kind = "cancel";
      const m = await view("membership", [membership]);
      if (!m.error && r() < 0.7) mock.setMockPersona(m.member);
      hash = await mock.write(calls.cancel(membership, r() < 0.1 ? "too short" : pick(MESSAGE_CHIPS).value));
    } else if (roll < 0.72) {
      kind = "reply";
      const q = await view("request", [request]);
      if (!q.error && r() < 0.8) mock.setMockPersona(q.provider);
      hash = await mock.write(calls.reply(request, pick(REPLY_CHIPS).value));
    } else if (roll < 0.8) {
      kind = "demo reply";
      // The newest request is the one most likely to be a fresh cancellation on a demo plan.
      const answer = await mock.demoReply("R" + Math.max(1, stats.requests));
      if (!answer.ok) continue;
      hash = answer.hash;
    } else if (roll < 0.9) {
      kind = "lapse";
      hash = await mock.write(calls.lapse(request));
    } else {
      kind = "collect";
      hash = await mock.write(calls.collect(membership));
    }
    const s = await finalOf(hash);
    const done = s.exec === "SUCCESS" && s.result?.ok === true;
    kinds.set(kind + (done ? "" : " refused"), (kinds.get(kind + (done ? "" : " refused")) ?? 0) + 1);
    await check(total, `step ${step} (${kind})`);
    // As the request page does: right after a cancellation lands, the demo provider is asked to reply.
    if (kind === "cancel" && done && r() < 0.6) {
      const answer = await mock.demoReply(String(s.result.request));
      if (answer.ok) {
        await finalOf(answer.hash);
        kinds.set("demo reply", (kinds.get("demo reply") ?? 0) + 1);
        await check(total, `step ${step} (demo reply)`);
      }
    }
  }
  // The walk did reach every kind of call, both taken and refused.
  for (const k of ["open_plan", "join", "join refused", "cancel", "reply", "lapse", "collect", "collect refused", "demo reply"]) assert.ok((kinds.get(k) ?? 0) > 0, `the walk did ${k}`);
});
