// Every one-click suggestion and every demo text sits inside the contract's limits, so a visitor who
// only clicks never meets a refusal for the length or the shape of what they sent.

import test from "node:test";
import assert from "node:assert/strict";

import { DEMO_PLANS, SAMPLE_PLANS, demoTextsFit } from "../../lib/demo-plans.ts";
import { feeProblem, messageProblem, nameProblem, periodProblem, replyProblem, windowProblem } from "../../lib/rules.ts";
import { FEE_CHIPS, MESSAGE_CHIPS, NAME_CHIPS, PERIOD_CHIPS, REPLY_CHIPS, WINDOW_CHIPS } from "../../lib/suggestions.ts";

test("eight plan names, none a demo plan's name, each a valid name", () => {
  assert.equal(NAME_CHIPS.length, 8);
  assert.equal(new Set(NAME_CHIPS).size, 8);
  for (const n of NAME_CHIPS) {
    assert.equal(nameProblem(n), "", n);
    assert.ok(!DEMO_PLANS.some((p) => p.name === n), `${n} is not a demo plan's name`);
  }
});

test("fees, periods and windows are allowed values, and the forms' minute fields are whole", () => {
  assert.deepEqual(FEE_CHIPS.map((c) => c.label), ["0.1 GEN", "0.25 GEN", "0.5 GEN", "1 GEN"]);
  for (const c of FEE_CHIPS) assert.equal(feeProblem(c.value), "", c.label);
  for (const c of PERIOD_CHIPS) {
    assert.equal(periodProblem(c.value), "", c.label);
    assert.ok(Number.isInteger(c.value / 60), `${c.label} is whole minutes`);
  }
  for (const c of WINDOW_CHIPS) {
    assert.equal(windowProblem(c.value), "", c.label);
    assert.ok(Number.isInteger(c.value / 60), `${c.label} is whole minutes`);
  }
  assert.ok(PERIOD_CHIPS.some((c) => c.label === "30 min" || c.value === 900));
  assert.ok(PERIOD_CHIPS.some((c) => c.value === 30 * 86400), "30 days");
  assert.ok(WINDOW_CHIPS.some((c) => c.value === 86400), "1 day");
});

test("six cancellation messages and the four kinds of reply, all inside the limits", () => {
  assert.equal(MESSAGE_CHIPS.length, 6);
  for (const c of MESSAGE_CHIPS) {
    assert.equal(messageProblem(c.value), "", c.label);
    assert.ok(c.value.length >= 20 && c.value.length <= 400);
  }
  assert.deepEqual(REPLY_CHIPS.map((c) => c.kind).sort(), ["call", "honour", "offer", "vague"]);
  for (const c of REPLY_CHIPS) assert.equal(replyProblem(c.value), "", c.label);
});

test("the demo plans and the provider's samples fit the contract", () => {
  assert.ok(demoTextsFit());
  assert.deepEqual(DEMO_PLANS.map((p) => p.name), ["Ironside Gym, monthly", "Northwind Stream, premium", "Lingo Daily Pro"]);
  assert.deepEqual(DEMO_PLANS.map((p) => p.expect), ["honoured", "stalled", "stalled"]);
  for (const p of [...DEMO_PLANS, ...SAMPLE_PLANS]) {
    assert.equal(nameProblem(p.name), "", p.name);
    assert.equal(feeProblem(BigInt(p.feeAtto)), "", p.name);
    assert.equal(periodProblem(p.period), "", p.name);
    assert.equal(windowProblem(p.window), "", p.name);
  }
  for (const p of DEMO_PLANS) {
    assert.equal(replyProblem(p.reply), "", p.name);
    assert.ok(p.period <= 15 * 60, `${p.name} has a short period, so a visitor can watch a collect`);
    assert.ok(p.window < p.period, `${p.name} answers inside the period`);
  }
});
