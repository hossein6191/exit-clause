// The demo provider's server-side guards, from node: the key read forgivingly and its problems named
// exactly (never echoing it), the rate limit, and the check made before every scripted reply.

import test from "node:test";
import assert from "node:assert/strict";

import { BAD_KEY, NO_KEY, cleanKey, keyProblem } from "../../lib/demo-key.ts";
import { DEMO_LIMITS, createLimiter } from "../../lib/demo-limit.ts";
import { DEMO_PLANS, demoReplyProblem, isDemoPlan } from "../../lib/demo-plans.ts";

const HEX = "ab".repeat(32);

test("the key is read forgivingly: spaces, quotes and a missing 0x are all fine", () => {
  for (const raw of [`0x${HEX}`, ` 0x${HEX} `, `"0x${HEX}"`, `'${HEX}'`, HEX, `0X${HEX}`, `\`0x${HEX}\`\n`]) {
    assert.equal(keyProblem(raw), "", JSON.stringify(raw));
    assert.equal(cleanKey(raw), `0x${HEX}`);
  }
});

test("a missing key and a bad key are told apart, in exactly the status route's words", () => {
  assert.equal(NO_KEY, "no key set");
  assert.equal(BAD_KEY, "the key set is not a 0x private key of 64 hex characters");
  for (const raw of [undefined, "", "   ", '""']) assert.equal(keyProblem(raw), NO_KEY, JSON.stringify(raw));
  for (const raw of ["0x1234", HEX + "0", "0x" + "zz".repeat(32), "my key"]) {
    assert.equal(keyProblem(raw), BAD_KEY, JSON.stringify(raw));
    assert.ok(!BAD_KEY.includes(raw), "the problem never repeats the key");
  }
});

test("one attempt per request every ninety seconds, a hold after a reply was sent, and a ceiling in all", () => {
  const l = createLimiter(DEMO_LIMITS);
  assert.deepEqual(l.attempt("R1", 0), { ok: true });
  const again = l.attempt("R1", 1000);
  assert.equal(again.ok, false);
  assert.equal(again.retryAfter, 89);
  assert.deepEqual(l.attempt("R1", DEMO_LIMITS.perKeyMs), { ok: true });
  l.hold("R1", DEMO_LIMITS.sentHoldMs, DEMO_LIMITS.perKeyMs);
  assert.equal(l.attempt("R1", DEMO_LIMITS.perKeyMs * 2).ok, false);
  const g = createLimiter(DEMO_LIMITS);
  for (let k = 0; k < DEMO_LIMITS.globalMax; k++) assert.equal(g.attempt("R" + k, k).ok, true);
  assert.equal(g.attempt("R99", 100).ok, false, "the ceiling holds across requests");
  assert.equal(g.attempt("R99", DEMO_LIMITS.globalWindowMs + 1).ok, true, "and lifts once the minute has passed");
});

test("the demo provider replies only to a fresh, open request inside the window on one of its own three plans", () => {
  const demo = "0xd7e0a3b5c19f42e6a8b0c3d5e7f91a2b4c6d8e0f";
  const plan = { name: DEMO_PLANS[0].name, provider: demo };
  const req = { id: "R7", status: "open", replies: 0, deadline: 1000 };
  assert.equal(isDemoPlan(plan, demo.toUpperCase().replace("0X", "0x")), true);
  assert.equal(demoReplyProblem(req, plan, demo, 999), "");
  assert.match(demoReplyProblem(req, { ...plan, provider: "0x" + "1".repeat(40) }, demo, 0), /not on one of the demo provider's three plans/);
  assert.match(demoReplyProblem(req, { ...plan, name: "Ironside Gym" }, demo, 0), /not on one of the demo provider's three plans/);
  assert.match(demoReplyProblem({ ...req, status: "stalled" }, plan, demo, 0), /R7 is stalled; the demo provider replies only to an open request/);
  assert.match(demoReplyProblem({ ...req, replies: 1 }, plan, demo, 0), /already replied to R7/);
  assert.match(demoReplyProblem(req, plan, demo, 1000), /the reply window of R7 closed; lapse\(R7\) gives the member the fee back/);
  assert.match(demoReplyProblem(req, plan, "", 0), /not on one of the demo provider's three plans/);
});
