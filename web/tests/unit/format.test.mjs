// Display helpers, from node.

import test from "node:test";
import assert from "node:assert/strict";

import { clockTime, gen, genText, span, toAtto, windowLabel } from "../../lib/format.ts";

test("amounts, spans and windows print the way the pages show them", () => {
  assert.equal(gen("500000000000000000"), "0.5 GEN");
  assert.equal(gen(10n ** 18n * 3n), "3 GEN");
  assert.equal(gen(""), "0 GEN");
  assert.equal(toAtto("0.25"), 250000000000000000n);
  assert.equal(genText("250000000000000000"), "0.25");
  assert.throws(() => toAtto("1e3"));
  assert.equal(span(0), "0 s");
  assert.equal(span(612), "10 min 12 s");
  assert.equal(span(90061), "1 d 1 h");
  assert.equal(windowLabel(900), "15 minutes");
  assert.equal(windowLabel(86400), "1 day");
  assert.equal(windowLabel(30 * 86400), "30 days");
  assert.equal(clockTime(0), "");
  assert.match(clockTime(1_800_000_000, 1_800_000_000), /^\d\d:\d\d$/);
  assert.match(clockTime(1_800_000_000, 1_800_000_000 + 3 * 86400), /^\d{1,2} \w{3}, \d\d:\d\d$/);
});
