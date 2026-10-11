// Every one-click suggestion and every demo text sits inside the contract's limits, so a visitor who
// only clicks never meets a refusal for the length or the shape of what they sent.

import test from "node:test";
import assert from "node:assert/strict";

import { DEMO_KEYS, DEMO_PERIOD, DEMO_PLANS, DEMO_WINDOW, SAMPLE_PLANS, demoPlansByKeys, demoTextsFit } from "../../lib/demo-plans.ts";
import { MAX_REPLY, MIN_REPLY, feeProblem, messageProblem, nameProblem, periodProblem, plain, pyStrip, replyProblem, windowProblem } from "../../lib/rules.ts";
import { FEE_CHIPS, MESSAGE_CHIPS, NAME_CHIPS, PERIOD_CHIPS, REPLY_CHIPS, WINDOW_CHIPS } from "../../lib/suggestions.ts";

test("twelve plan names, none a demo plan's name, each a valid name", () => {
  assert.equal(NAME_CHIPS.length, 12);
  assert.equal(new Set(NAME_CHIPS.map((n) => n.toLowerCase())).size, 12);
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

test("twelve cancellation messages, each distinct and inside the limits as the form sends it", () => {
  assert.equal(MESSAGE_CHIPS.length, 12);
  assert.equal(new Set(MESSAGE_CHIPS.map((c) => c.label)).size, 12, "every label differs");
  assert.equal(new Set(MESSAGE_CHIPS.map((c) => c.value)).size, 12, "every message differs");
  for (const c of MESSAGE_CHIPS) {
    assert.equal(messageProblem(c.value), "", c.label);
    assert.ok(c.value.length >= 20 && c.value.length <= 400, c.label);
    assert.equal(plain(c.value), c.value, `${c.label} is sent as written`);
    assert.equal(pyStrip(c.value), c.value, `${c.label} has no edge spaces`);
  }
});

test("eight provider replies: three honoured (one with an end date), three stalled in three ways, two unclear", () => {
  assert.equal(REPLY_CHIPS.length, 8);
  assert.equal(new Set(REPLY_CHIPS.map((c) => c.label)).size, 8, "every label differs");
  assert.equal(new Set(REPLY_CHIPS.map((c) => c.value)).size, 8, "every reply differs");
  const count = (v) => REPLY_CHIPS.filter((c) => c.verdict === v).length;
  assert.deepEqual([count("honoured"), count("stalled"), count("unclear")], [3, 3, 2]);
  assert.deepEqual(REPLY_CHIPS.filter((c) => c.verdict === "stalled").map((c) => c.kind).sort(), ["call", "defer", "offer"], "three different stalls");
  assert.equal(REPLY_CHIPS.filter((c) => c.kind === "dated").length, 1, "one honoured reply names its end date");
  for (const c of REPLY_CHIPS) {
    assert.equal(c.verdict === "honoured", c.kind === "honour" || c.kind === "dated", `${c.label}: kind and verdict agree`);
    assert.equal(c.verdict === "unclear", c.kind === "vague", `${c.label}: kind and verdict agree`);
    assert.equal(replyProblem(c.value), "", c.label);
    assert.equal(plain(c.value), c.value, `${c.label} is sent as written`);
  }
  // The mock and the seeded threads lean on these two by position.
  assert.equal(REPLY_CHIPS[0].verdict, "honoured");
  assert.equal(REPLY_CHIPS[3].verdict, "unclear");
});

test("the demo plans and the provider's samples fit the contract", () => {
  assert.ok(demoTextsFit());
  assert.deepEqual(
    DEMO_PLANS.slice(0, 3).map((p) => [p.name, p.feeAtto, p.period, p.window]),
    [
      ["Ironside Gym, monthly", "500000000000000000", 900, 600],
      ["Northwind Stream, premium", "300000000000000000", 900, 600],
      ["Lingo Daily Pro", "250000000000000000", 900, 600],
    ],
    "the three already open on chain are unchanged",
  );
  assert.deepEqual(DEMO_PLANS.slice(0, 3).map((p) => p.expect), ["honoured", "stalled", "stalled"]);
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

test("the five later demo plans: fictional, valid, one scripted reply each inside the reply limits", () => {
  const later = DEMO_PLANS.slice(3);
  assert.deepEqual(
    later.map((p) => [p.key, p.name, p.expect]),
    [
      ["brightline", "Brightline Mobile, monthly", "honoured"],
      ["pageturn", "PageTurn Book Club", "stalled"],
      ["cloudnest", "CloudNest Storage, 1 TB", "stalled"],
      ["fitpulse", "FitPulse Plus", "unclear"],
      ["dailybrew", "Daily Brew coffee box", "honoured"],
    ],
  );
  assert.equal(new Set(DEMO_PLANS.map((p) => p.key)).size, DEMO_PLANS.length, "keys are unique");
  assert.equal(new Set(DEMO_PLANS.map((p) => p.name.toLowerCase())).size, DEMO_PLANS.length, "names are unique");
  for (const p of later) {
    assert.equal(nameProblem(p.name), "", p.name);
    const fee = BigInt(p.feeAtto);
    assert.ok(fee >= 10n ** 17n && fee <= 5n * 10n ** 17n, `${p.name}: a fee from 0.1 to 0.5 GEN`);
    assert.equal(feeProblem(fee), "", p.name);
    assert.equal(p.period, DEMO_PERIOD, `${p.name}: a fifteen-minute period`);
    assert.equal(p.window, DEMO_WINDOW, `${p.name}: a ten-minute reply window`);
    assert.equal(replyProblem(p.reply), "", `${p.name}: the reply is one the contract stores`);
    const n = [...pyStrip(p.reply)].length;
    assert.ok(n >= MIN_REPLY && n <= MAX_REPLY, `${p.name}: ${n} characters, ${MIN_REPLY} to ${MAX_REPLY}`);
    assert.equal(plain(p.reply), p.reply, `${p.name}: the reply is sent exactly as written`);
    assert.ok(p.habit.length > 0 && p.why.length > 0, `${p.name} says its story before anyone joins`);
    // No real phone number and no postal address; a number, if any, sits in the drama range.
    for (const m of p.reply.match(/\d[\d ]{6,}\d/g) ?? []) assert.match(m.replace(/ /g, ""), /^08081570\d{3}$/, `${p.name}: ${m}`);
    assert.doesNotMatch(p.reply, /\b(street|road|avenue|lane|po box|postcode)\b/i, `${p.name}: no postal address`);
  }
  assert.equal(later.find((p) => p.key === "fitpulse").reply, "Thanks for your message. We have noted your feedback and a member of our team will be in touch.");
  assert.equal(later.find((p) => p.key === "dailybrew").reply, "Done: your subscription is cancelled. Your last box ships this Friday and you will not be charged again.");
});

test("ONLY picks demo plans by key, and an unknown key is named", () => {
  assert.deepEqual(DEMO_KEYS, ["gym", "stream", "lingo", "brightline", "pageturn", "cloudnest", "fitpulse", "dailybrew"]);
  const five = demoPlansByKeys("brightline,pageturn, cloudnest ,fitpulse,dailybrew");
  assert.equal(five.problem, "");
  assert.deepEqual(five.plans.map((p) => p.key), ["brightline", "pageturn", "cloudnest", "fitpulse", "dailybrew"]);
  assert.deepEqual(demoPlansByKeys("FitPulse").plans.map((p) => p.key), ["fitpulse"]);
  assert.match(demoPlansByKeys("fitpulse,gymm").problem, /unknown plan key: gymm/);
  assert.match(demoPlansByKeys(" , ").problem, /at least one/);
});
