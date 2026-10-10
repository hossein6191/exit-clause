// The site against the contract it talks to, read from contracts/exit_clause.py in this repository:
// every write builder names a real write method with the right number of arguments and sends value
// only to the payable one; every view the site reads exists; the limits, THE RULE and the two
// questions are the contract's own; and every refusal sentence the in-memory contract raises, every
// sentence the form checks give and every word of the mock's rules() is made of the contract's words.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { calls } from "../../lib/calls.ts";
import * as rules from "../../lib/rules.ts";
import * as mock from "../../lib/chain-mock.ts";

// The contract's source with its escaped quotes read as quotes, and Python's adjacent string literals
// (a sentence split over two lines) joined back into one, so its sentences can be looked up whole.
const raw = readFileSync(new URL("../../../contracts/exit_clause.py", import.meta.url), "utf8");
const contract = raw.replace(/\\"/g, '"').replace(/"\s*\n\s*"/g, "").replace(/"\s*\n\s*\+\s*"/g, "");
const chainSource = readFileSync(new URL("../../lib/chain.ts", import.meta.url), "utf8");
const mockSource = readFileSync(new URL("../../lib/chain-mock.ts", import.meta.url), "utf8");
const rulesSource = readFileSync(new URL("../../lib/rules.ts", import.meta.url), "utf8");

/** { name: { kind, payable, params } } for every public method of the contract. */
function methods() {
  const out = {};
  const re = /@gl\.public\.(write(?:\.payable)?|view)\s*\n\s*def (\w+)\(self(?:,\s*([^)]*))?\)/g;
  for (const m of raw.matchAll(re)) {
    const params = (m[3] ?? "").split(",").map((p) => p.trim()).filter(Boolean);
    out[m[2]] = { kind: m[1].startsWith("view") ? "view" : "write", payable: m[1].endsWith("payable"), params: params.length };
  }
  return out;
}

/** The value of a Python constant written as `NAME = <expr>` at the start of a line. */
const constant = (name) => {
  const m = new RegExp(`^${name}\\s*=\\s*([^#\\n]+)`, "m").exec(raw);
  assert.ok(m, `the contract defines ${name}`);
  return m[1].trim();
};

/** A parenthesised Python string constant, joined. */
const pyString = (name) => {
  const start = raw.indexOf(`\n${name} = (`);
  assert.ok(start >= 0, `the contract defines ${name}`);
  const body = raw.slice(start, raw.indexOf("\n)", start));
  return [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join("");
};

test("every write builder names a write method of the contract, with its arguments and its value", () => {
  const all = methods();
  const built = [
    calls.openPlan("Ironside Gym", 10n ** 17n, 300, 300),
    calls.closePlan("P1"),
    calls.reply("R1", "x".repeat(20)),
    calls.join("P1", 10n ** 17n),
    calls.cancel("M1", "x".repeat(20)),
    calls.lapse("R1"),
    calls.collect("M1"),
  ];
  const writes = Object.entries(all).filter(([, m]) => m.kind === "write").map(([n]) => n).sort();
  assert.deepEqual([...new Set(built.map((c) => c.fn))].sort(), writes, "the site can send every write and nothing else");
  for (const c of built) {
    const m = all[c.fn];
    assert.equal(c.args.length, m.params, `${c.fn} takes ${m.params} arguments`);
    assert.equal(c.value !== undefined, m.payable, `${c.fn} sends value only when payable`);
  }
  const open = calls.openPlan("Name", 5n * 10n ** 17n, 900.7, 600);
  assert.equal(open.args[1], "500000000000000000", "the fee travels as a string of digits");
  assert.equal(open.args[2], 900, "the period travels as an integer");
  assert.equal(typeof open.args[3], "number");
});

test("every view the site reads is a view of the contract, and the site reads every view", () => {
  const all = methods();
  const read = [...chainSource.matchAll(/view\("(\w+)"/g)].map((m) => m[1]);
  assert.ok(read.length >= 8);
  for (const name of read) assert.equal(all[name]?.kind, "view", `${name} is a view`);
  for (const [name, m] of Object.entries(all)) if (m.kind === "view") assert.ok(read.includes(name), `the site reads ${name}`);
});

test("the limits, THE RULE and the two questions are the contract's own", () => {
  const nums = { MIN_NAME: 3, MAX_NAME: 60, MIN_MESSAGE: 20, MAX_MESSAGE: 400, MIN_REPLY: 20, MAX_REPLY: 600, MAX_REPLIES: 2, MIN_PERIOD: 300, MIN_WINDOW: 300, PAGE: 20, ID_CHARS: 12, ADDRESS_CHARS: 42 };
  for (const [name, value] of Object.entries(nums)) {
    assert.equal(Number(constant(name)), value, `${name} in the contract`);
    assert.equal(rules[name], value, `${name} in lib/rules.ts`);
  }
  assert.equal(constant("MAX_PERIOD"), "90 * 86400");
  assert.equal(rules.MAX_PERIOD, 90 * 86400);
  assert.equal(constant("MAX_WINDOW"), "14 * 86400");
  assert.equal(rules.MAX_WINDOW, 14 * 86400);
  assert.equal(constant("MIN_FEE"), "ATTO // 10");
  assert.equal(rules.MIN_FEE, 10n ** 17n);
  assert.equal(constant("MAX_FEE"), "100 * ATTO");
  assert.equal(rules.MAX_FEE, 100n * 10n ** 18n);
  assert.equal(rules.THE_RULE, pyString("THE_RULE"));
  assert.equal(rules.QUESTION_HONOUR, pyString("QUESTION_HONOUR"));
  assert.equal(rules.QUESTION_STALL, pyString("QUESTION_STALL"));
});

/** Every literal piece (between ${...} holes) of a template, long enough to mean something. */
const pieces = (template) =>
  template
    .split(/\$\{[^}]*\}/)
    .map((p) => p.trim().replace(/^[;:,.]\s*/, ""))
    .filter((p) => p.length >= 8);

test("every refusal the in-memory contract raises is in the contract's own words", () => {
  const raised = [...mockSource.matchAll(/fail\((`[^`]*`|"[^"]*")/g)].map((m) => m[1].slice(1, -1));
  assert.ok(raised.length >= 25, `found ${raised.length} refusals`);
  for (const r of raised) for (const p of pieces(r)) assert.ok(contract.includes(p), `the contract says "${p}"`);
  const refusedJoins = [...mockSource.matchAll(/problem = (`[^`]*`|"[^"]*")/g)].map((m) => m[1].slice(1, -1));
  assert.ok(refusedJoins.length >= 7, `found ${refusedJoins.length} join refusals`);
  for (const r of refusedJoins) for (const p of pieces(r)) assert.ok(contract.includes(p), `the contract says "${p}"`);
});

test("every sentence the form checks in lib/rules.ts give is in the contract's own words", () => {
  const start = rulesSource.indexOf("// ---- reading the caller");
  const end = rulesSource.indexOf("// ---- what the site sends");
  const said = [...rulesSource.slice(start, end).matchAll(/`([^`]*)`/g)].map((m) => m[1]);
  assert.ok(said.length >= 5, `found ${said.length} sentences`);
  for (const r of said) for (const p of pieces(r)) assert.ok(contract.includes(p), `the contract says "${p}"`);
});

test("the in-memory rules() is the contract's rules(), word for word", async () => {
  const mine = JSON.parse(await mock.view("rules", []));
  const strings = [];
  const walk = (v) => {
    if (typeof v === "string") strings.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(mine);
  assert.ok(strings.length >= 25);
  // THE RULE, the two questions and the reading note are compared whole above and here; the rest of
  // each string is cut at those constants and at every number, and each piece must be the contract's.
  const reading = pyString("READING");
  assert.equal(mine.reading, reading);
  const whole = [rules.THE_RULE, rules.QUESTION_HONOUR, rules.QUESTION_STALL, reading];
  for (const s of strings) {
    let rest = s;
    for (const c of whole) rest = rest.split(c).join("\u0000");
    for (const piece of rest.split(/\u0000|\d+/)) {
      const p = piece.trim();
      if (p.length < 8) continue;
      assert.ok(contract.includes(p), `the contract says "${p.slice(0, 80)}"`);
    }
  }
  const keys = [...raw.slice(raw.indexOf("def rules(self)"), raw.indexOf("# ------", raw.indexOf("def rules(self)"))).matchAll(/^ {12}"(\w+)":/gm)].map((m) => m[1]);
  assert.deepEqual(Object.keys(mine).sort(), [...new Set(keys)].sort(), "the same top-level keys");
});
