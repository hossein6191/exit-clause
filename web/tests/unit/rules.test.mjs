// The contract's rules as lib/rules.ts writes them, run from node with no browser and no network:
// the combine table, the readers of the caller's arguments, the phases on the clock, the stamps and
// the step line of a thread.

import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_REPLIES,
  STAMPS,
  combine,
  feeProblem,
  idNumber,
  isOver,
  membershipPhase,
  messageProblem,
  nameProblem,
  numberArg,
  parseMembershipId,
  parsePlanId,
  parseRequestId,
  periodProblem,
  plain,
  pyStrip,
  replyProblem,
  requestPhase,
  sentence,
  stampOfReply,
  stepsDone,
  textProblem,
  windowProblem,
} from "../../lib/rules.ts";

const GEN = 10n ** 18n;

test("two answers make one word, and only the two clean combinations move anything", () => {
  assert.equal(combine("yes", "no"), "honoured");
  assert.equal(combine("no", "yes"), "stalled");
  for (const a of ["yes", "no", "unclear", ""]) for (const b of ["yes", "no", "unclear", ""]) {
    if ((a === "yes" && b === "no") || (a === "no" && b === "yes")) continue;
    assert.equal(combine(a, b), "unclear", `${a} then ${b}`);
  }
});

test("texts are read as the contract reads them: stripped, counted in code points, printable ASCII", () => {
  assert.equal(pyStrip("  hello \x1c"), "hello");
  assert.equal(textProblem("abc", 3, 5, "the name"), "");
  assert.equal(textProblem("ab", 3, 5, "the name"), "the name is 3 to 5 characters; this one is 2");
  assert.equal(textProblem("café!", 3, 9, "the name"), "the name is printable ASCII on one line");
  assert.equal(textProblem("one\ntwo", 3, 9, "the name"), "the name is printable ASCII on one line");
  assert.equal(nameProblem("  Ok gym  "), "");
  assert.match(messageProblem("too short"), /^the message is 20 to 400 characters; this one is 9$/);
  assert.match(replyProblem("x".repeat(601)), /^the reply is 20 to 600 characters/);
  assert.equal(plain("Don’t\ncall — thanks…"), "Don't call - thanks...");
});

test("numbers are whole and never floats; bools are refused by name", () => {
  assert.equal(numberArg("300"), 300n);
  assert.equal(numberArg(" 42 "), 42n);
  assert.equal(numberArg(7), 7n);
  for (const bad of [true, false, 1.5, -1, "1e3", "0.5", "", null, undefined, {}, []]) assert.equal(numberArg(bad), -1n, String(bad));
});

test("the fee, the period and the window refuse in the contract's words", () => {
  assert.equal(feeProblem(GEN / 10n), "");
  assert.equal(feeProblem(100n * GEN), "");
  assert.match(feeProblem(GEN / 10n - 1n), /^the fee is a whole number of atto from 100000000000000000 \(0\.1 GEN\)/);
  assert.match(feeProblem(100n * GEN + 1n), /\(100 GEN\), for one period$/);
  assert.equal(periodProblem(300), "");
  assert.equal(periodProblem(90 * 86400), "");
  assert.equal(periodProblem(299), "the period is 300 to 7776000 seconds");
  assert.equal(windowProblem(14 * 86400 + 1), "the reply window is 300 to 1209600 seconds");
  assert.equal(windowProblem(Number.NaN), "the reply window is 300 to 1209600 seconds");
});

test("phases follow the contract's views on any clock", () => {
  assert.equal(membershipPhase("live", 100, 50), "running");
  assert.equal(membershipPhase("live", 100, 100), "due");
  assert.equal(membershipPhase("cancelled", 100, 99), "cancelled");
  assert.equal(membershipPhase("cancelled", 100, 101), "due");
  assert.equal(membershipPhase("cancelling", 100, 500), "cancelling");
  assert.equal(membershipPhase("live", 100, -1), "unknown");
  assert.equal(requestPhase("open", 100, 99), "reply");
  assert.equal(requestPhase("open", 100, 100), "lapse");
  assert.equal(requestPhase("stalled", 100, 1), "closed");
  assert.equal(isOver("refunded", 999, 0), true);
  assert.equal(isOver("cancelling", 0, 999), false);
  assert.equal(isOver("live", 100, 100), true);
  assert.equal(isOver("cancelled", 100, 99), false);
});

test("every stamp says the words the owner asked for, and the last unclear reply says it will lapse", () => {
  assert.equal(STAMPS.honoured.text, "HONOURED");
  assert.equal(STAMPS.stalled.text, "STALLED · MONTH REFUNDED");
  assert.equal(STAMPS.unclear.text, "UNCLEAR · MAY REPLY AGAIN");
  assert.equal(STAMPS.lapsed.text, "LAPSED · MONTH REFUNDED");
  assert.equal(stampOfReply("unclear", 0), "unclear");
  assert.equal(stampOfReply("unclear", MAX_REPLIES - 1), "unclear-last");
  assert.equal(stampOfReply("stalled", 1), "stalled");
  assert.equal(STAMPS.honoured.tone, "honoured");
  assert.equal(STAMPS.lapsed.tone, "stalled");
});

test("the step line advances by itself from the thread's own state", () => {
  assert.equal(stepsDone({ requestStatus: "", replies: 0, membershipStatus: "live" }), 1);
  assert.equal(stepsDone({ requestStatus: "open", replies: 0, membershipStatus: "cancelling" }), 2);
  assert.equal(stepsDone({ requestStatus: "open", replies: 1, membershipStatus: "cancelling" }), 3);
  assert.equal(stepsDone({ requestStatus: "honoured", replies: 1, membershipStatus: "cancelled" }), 4);
  assert.equal(stepsDone({ requestStatus: "honoured", replies: 1, membershipStatus: "served" }), 5);
  assert.equal(stepsDone({ requestStatus: "stalled", replies: 1, membershipStatus: "refunded" }), 5);
  assert.equal(stepsDone({ requestStatus: "lapsed", replies: 0, membershipStatus: "refunded" }), 5);
});

test("ids are read from a URL forgivingly and nothing else gets through", () => {
  assert.equal(parsePlanId("P3"), "P3");
  assert.equal(parsePlanId("p12"), "P12");
  assert.equal(parsePlanId("7"), "P7");
  assert.equal(parseRequestId("R4"), "R4");
  assert.equal(parseMembershipId("m9"), "M9");
  for (const bad of ["P0", "R-1", "P3x", "", "%E0%A4%A", "P1234567890"]) assert.equal(parsePlanId(bad), "", bad);
  assert.equal(idNumber("R12"), 12);
  assert.equal(sentence("[EXPECTED] no plan P9"), "No plan P9.");
});
