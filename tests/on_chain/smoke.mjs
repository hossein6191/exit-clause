/* Exit Clause against GenLayer Studio (chain 61999), with throwaway accounts. Deploys its own copy.
 *
 *   npm ci                                        # genlayer-js 1.1.8 and viem 2.56.8, pinned by package-lock.json
 *   node tests/on_chain/smoke.mjs                 # the whole run, about forty-five minutes
 *   RESUME=1 node tests/on_chain/smoke.mjs        # continue a run that was cut off, from the saved state
 *   STATE=/some/dir/run.json RESUME=1 node ...    # the state file: keys, contract address, every step made
 *   FRESH=1 node tests/on_chain/smoke.mjs         # start over even though a saved run exists
 *
 * Four accounts the script generates and funds itself play the whole story: P is the provider of two plans,
 * A and B are members, and S is a stranger. The brands are fictional. P1's period is PERIOD_SECONDS (30
 * minutes) and its reply window LONG_SECONDS (25 minutes), so every step that must land inside them does on a
 * slow Studio; P2's reply window is SHORT_SECONDS (5 minutes, the contract's least), because nobody replies
 * inside it and the run waits for it to close. The run is as long as P1's period: it ends once A's period
 * is over and its fee can be collected.
 *
 * Phases:
 *   A  deploy; P opens P1, "Ironside Gym, monthly": a fee of 0.5 GEN for a period of 30 minutes and a reply
 *      window of 25 minutes. P opens P2, "Northwind Stream, premium": 0.3 GEN, the same period, and a reply
 *      window of 5 minutes.
 *   B  A joins P1 with exactly the fee, which the contract holds. Then four lanes at once: P tries to collect
 *      A's fee straight away and is refused, because the period runs; S tries to join P1 with 0.25 GEN, which
 *      comes back in the same transaction, then tries to cancel A's membership and is refused; A joins P2 and
 *      cancels it at once, so P2's short window runs while everything else happens, then asks to cancel P1;
 *      B joins P1 and asks to cancel it.
 *   C  S tries to reply to A's cancellation and is refused. P replies to A: "Your membership is cancelled and
 *      ends when this month ends. No further payments will be taken." One consensus round, two askings:
 *      honoured, and nothing moves; A's fee stays held for P until the period ends. P replies to B: "We're
 *      sorry to see you go! To cancel, please call our member line ..." One round: stalled, and B's 0.5 GEN
 *      comes back in the same transaction. P sends A's settled request a further reply and is refused.
 *   D  P never replies to A's Northwind request; once the window closes S lapses it and A's 0.3 GEN comes
 *      back by rule, with no model asked. Once A's gym period ends, S collects it and P receives 0.5 GEN.
 *   E  the deployed code is read back and compared with contracts/exit_clause.py byte for byte; the views
 *      are checked against what the run did; the contract holds nothing; every account ends where the money
 *      table says.
 *
 * Every refusal is a signed transaction. Balances are read before and after every step that moves
 * money. Transactions are polled with eth_getTransactionByHash, never with views (gen_call is limited
 * to 30 a minute per client, shared with sim_fundAccount). A round the validators do not carry stores
 * nothing; it is sent again and both transactions are kept. Every step is saved as it is made, so a run
 * cut off by a closed laptop continues with RESUME=1 without sending anything twice. A run cut off
 * inside a window may find that window closed when it continues; the checks then say so.
 */
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { generatePrivateKey } from "viem/accounts";
import { getAddress } from "viem";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RPC = "https://studio.genlayer.com/api";
const EXPLORER = "https://explorer-studio.genlayer.com";
const STATE = process.env.STATE || join(tmpdir(), "exit-clause-smoke-state.json");
const RECORD = process.env.RECORD || STATE.replace(/\.json$/, "") + "-record.json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);
const rpc = async (m, p) => {
  let last;
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) });
      const j = await r.json();
      if (j.error && (j.error.code === -32029 || r.status === 429)) { await sleep(((j.error.data?.retry_after_seconds) || 20) * 1000); continue; }
      if (j.error) { last = new Error(m + ": " + JSON.stringify(j.error).slice(0, 200)); await sleep(6000); continue; }
      return j.result;
    } catch (e) { last = e; await sleep(4000); }   // the connection itself failed, or the answer was not JSON
  }
  throw last;
};
let pass = 0, fail = 0;
const ok = (n, c, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  - " + d : ""}`); return !!c; };
const note = (s) => console.log(`      .. ${s}`);
const GEN = 10n ** 18n;
const tally = (v) => `${v.agree} agree, ${v.disagree} disagree, ${v.idle} idle`;
const sha = (text) => createHash("sha256").update(text).digest("hex");

// ---------- state: keys, the contract address and every step already made survive a cut-off run ----------
if (existsSync(STATE) && !process.env.RESUME && !process.env.FRESH) {
  console.log(`A saved run exists at ${STATE}.\nRESUME=1 continues it; FRESH=1 starts over; STATE=<path> keeps another.`);
  process.exit(2);
}
const st = existsSync(STATE) && process.env.RESUME && !process.env.FRESH ? JSON.parse(readFileSync(STATE, "utf8")) : {};
st.keys = st.keys || {}; st.steps = st.steps || {}; st.views = st.views || {}; st.order = st.order || [];
const save = () => {
  writeFileSync(STATE, JSON.stringify(st, null, 1));
  const { keys, ...shown } = st;       // the record carries no key
  writeFileSync(RECORD, JSON.stringify(shown, null, 1));
};
const ROLES = { p: "the provider of two plans", a: "member A", b: "member B", s: "a stranger" };
for (const k of Object.keys(ROLES)) st.keys[k] = st.keys[k] || generatePrivateKey();
const acct = {}, client = {};
for (const k of Object.keys(ROLES)) { acct[k] = createAccount(st.keys[k]); client[k] = createClient({ chain: studionet, account: acct[k] }); }
const rd = createClient({ chain: studionet });
st.accounts = Object.fromEntries(Object.keys(ROLES).map((k) => [k, getAddress(acct[k].address)]));
save();
const low = (k) => acct[k].address.toLowerCase();

const balance = async (a) => BigInt(await rpc("eth_getBalance", [a, "latest"]) || "0x0");
const nonceOf = async (a) => Number(BigInt(await rpc("eth_getTransactionCount", [a, "latest"]) || "0x0"));
const fundOnce = async (k, whole) => {
  st.funded = st.funded || {};
  if (st.funded[k]) return;
  await rpc("sim_fundAccount", { account_address: getAddress(acct[k].address), amount: whole * 1e18 });   // checksummed
  for (let i = 0; i < 20 && (await balance(acct[k].address)) === 0n; i++) await sleep(3000);
  st.funded[k] = String(await balance(acct[k].address)); save();
};

// ---------- transactions ----------
const errText = (e) => String(e?.details || e?.shortMessage || e?.cause?.message || e?.message || e);
// A request the network refused or never received is made again. When the failure is ambiguous the
// sender's nonce says whether the transaction landed after all, and its hash is read back, so nothing
// is ever sent twice.
const sendRaw = async (who, what, make) => {
  const addr = acct[who].address;
  for (let i = 0; ; i++) {
    const n0 = await nonceOf(addr);
    try { return await make(); } catch (e) {
      const text = errText(e);
      if (i >= 8) throw e;
      console.log(`      ${what} was not taken (${text.slice(0, 70)}); looking again in 20s`);
      await sleep(20000);
      if ((await nonceOf(addr)) > n0) {
        const list = await rpc("sim_getTransactionsForAddress", [addr]);
        const hit = (list || []).find((t) => String(t.from_address).toLowerCase() === addr.toLowerCase() && Number(t.nonce) === n0);
        if (hit?.hash) return hit.hash;
        throw new Error(what + " landed but its hash could not be read back");
      }
    }
  }
};
const countVotes = (t) => { let a = 0, d = 0, idl = 0; for (const k in (t.consensus_data?.votes || {})) { const v = t.consensus_data.votes[k]; if (v === "agree") a++; else if (v === "disagree") d++; else idl++; } return { agree: a, disagree: d, idle: idl }; };
const wait = async (tx) => {
  let stuck = 0;
  for (let i = 0; i < 900; i++) {
    await sleep(4000);
    const t = await rpc("eth_getTransactionByHash", [tx]);
    if (t?.status === "FINALIZED") {
      const lr = t.consensus_data?.leader_receipt, one = Array.isArray(lr) ? lr[0] : lr;
      let msg = "";
      try { msg = Buffer.from(one.result, "base64").toString("utf8").replace(/[^\x20-\x7e]/g, " ").trim(); } catch (e) {}
      const v = countVotes(t);
      return { tx, msg, exec: one?.execution_result || "", votes: v, applied: v.agree * 2 > v.agree + v.disagree + v.idle, address: t.data?.contract_address || t.to_address || "" };
    }
    // a round no majority carried is final as it stands once it has been left alone for ten minutes
    if (t?.status === "UNDETERMINED" && (stuck = stuck + 1) > 150) return { tx, msg: "UNDETERMINED", exec: "", votes: countVotes(t), applied: false, address: "" };
    if (t?.status === "CANCELED") return { tx, msg: "CANCELED", exec: "", votes: { agree: 0, disagree: 0, idle: 0 }, applied: false, address: "" };
    if (i > 0 && i % 75 === 0) console.log(`      [${stamp()}] still ${t?.status || "unknown"} after ${Math.round(i * 4 / 60)} minutes: ${tx}`);
  }
  return { tx, msg: "TIMEOUT", exec: "", votes: { agree: 0, disagree: 0, idle: 0 }, applied: false, address: "" };
};
const jsonOf = (msg) => { const b = String(msg).indexOf("{"); if (b === -1) return null; try { return JSON.parse(String(msg).slice(b)); } catch (e) { return null; } };
const settleBalance = async (a, before, want) => { for (let i = 0; i < 45; i++) { const b = await balance(a); if (b - before === want) return b; await sleep(4000); } return await balance(a); };

// One step of the run: a signed transaction, its tally, what it returned, and the balances it moved.
// opt.value is what is sent with it; opt.watch names the accounts whose balances are read before and
// after; opt.expect is the change each should show once every transfer has landed, a table or a
// function of what the call returned. A step already in the saved state is not sent again.
const call = async (id, who, fn, args = [], opt = {}) => {
  if (!st.steps[id]) { st.steps[id] = { id, who, fn, args: args.map(String), value: String(opt.value || 0n), tries: [] }; st.order.push(id); }
  const rec = st.steps[id];
  if (!rec.done) {
    const watch = opt.watch || [];
    if (!rec.before) { rec.before = {}; for (const k of watch) rec.before[k] = String(await balance(acct[k].address)); save(); }
    let r;
    for (;;) {
      if (!rec.pending) {
        rec.pending = await sendRaw(who, fn, () => client[who].writeContract({ address: st.contract, functionName: fn, args, ...(opt.value ? { value: opt.value } : {}) }));
        save();
      }
      r = await wait(rec.pending);
      rec.tries.push({ tx: r.tx, votes: r.votes, exec: r.exec, applied: r.applied, msg: r.msg, at: stamp() });
      rec.pending = null; save();
      console.log(`      [${stamp()}] ${who.toUpperCase()} ${fn}(${args.map((x) => String(x).slice(0, 18)).join(", ")})${opt.value ? " +" + Number(opt.value) / 1e18 + " GEN" : ""}  ${r.tx}  ${tally(r.votes)}  ${r.exec}`);
      if (r.msg === "TIMEOUT" || rec.tries.length >= 4) break;
      if (!r.applied) { console.log("      the validators did not carry that round (" + tally(r.votes) + "), so nothing was stored; sending it again"); continue; }
      break;
    }
    const expect = typeof opt.expect === "function" ? opt.expect(jsonOf(r.msg)) : opt.expect;
    rec.after = {}; rec.delta = {};
    for (const k of watch) {
      const before = BigInt(rec.before[k]);
      const want = expect && expect[k] !== undefined ? BigInt(expect[k]) : null;
      const now = want === null ? await balance(acct[k].address) : await settleBalance(acct[k].address, before, want);
      rec.after[k] = String(now); rec.delta[k] = String(now - before);
    }
    rec.done = true; save();
  }
  const last = rec.tries[rec.tries.length - 1];
  return { ...last, j: jsonOf(last.msg), tries: rec.tries, delta: rec.delta || {} };
};
const refused = (r, words) => r.exec === "ERROR" && r.msg.includes(words);
const moved = (r, k, want) => r.delta[k] === String(want);
const votes = (r) => r.tries.map((t) => tally(t.votes)).join(", then ");

const deploy = async (id, who, path) => {
  if (!st.steps[id]) { st.steps[id] = { id, who, fn: "deploy " + path.split("/").pop(), args: [], value: "0", tries: [] }; st.order.push(id); }
  const rec = st.steps[id];
  if (!rec.done) {
    const code = readFileSync(new URL(path, import.meta.url));
    for (;;) {
      if (!rec.pending) { rec.pending = await sendRaw(who, "deploy", () => client[who].deployContract({ code, args: [], leaderOnly: false })); save(); }
      const r = await wait(rec.pending);
      rec.tries.push({ tx: r.tx, votes: r.votes, exec: r.exec, applied: r.applied, msg: r.msg.slice(0, 300), at: stamp() });
      rec.address = r.address; rec.pending = null; save();
      console.log(`      [${stamp()}] ${who.toUpperCase()} deploy ${path.split("/").pop()}  ${r.tx}  ${tally(r.votes)}  ${r.exec}  ${r.address}`);
      if (r.applied || r.msg === "TIMEOUT" || rec.tries.length >= 3) break;
    }
    rec.done = true; save();
  }
  return rec.address;
};

// ---------- reads: paced, and made again on a 429 or on "Contract not found" instead of failing ----------
let lastRead = 0;
const read = async (fn, args = []) => {
  for (let i = 0; i < 30; i++) {
    const gap = 3500 - (Date.now() - lastRead);
    if (gap > 0) await sleep(gap);
    lastRead = Date.now();
    try { return JSON.parse(String(await rd.readContract({ address: st.contract, functionName: fn, args }))); } catch (e) {
      if (i === 29) return { error: "VIEW ERROR " + fn + ": " + errText(e).slice(0, 100) };
      await sleep(/rate|429|limit/i.test(errText(e)) ? 25000 : 10000);
    }
  }
};
// a view read once for a check is kept with the run, so a continued run checks what was seen then
const seen = async (id, fn, args = []) => { if (!st.views[id]) { st.views[id] = { fn, args, at: stamp(), out: await read(fn, args) }; save(); } return st.views[id].out; };

// wait on the chain's own clock until a view's instant has passed: a request's deadline or a membership's end
const until = async (fn, id, field) => {
  for (;;) {
    const r = await read(fn, [id]);
    if (!(Number(r[field]) > 0)) { note(`${fn} ${id} could not be read (${r.error || "no " + field}); reading again`); await sleep(15000); continue; }
    const now = Number(r.now) > 0 ? Number(r.now) : Math.floor(Date.now() / 1000);
    const left = Number(r[field]) - now;
    if (left <= -10) return r;
    console.log(`      [${stamp()}] waiting ${left + 10}s for the ${field} of ${id}`);
    await sleep(Math.min(left + 10, 120) * 1000);
  }
};

// ---------- the demonstration text: concrete, and one thing changed per demonstration ----------
// Windows are long enough for a slow Studio: on 6 Oct 2026 a transaction took up to seven minutes to land.
const PERIOD = Number(process.env.PERIOD_SECONDS || 1800);
const LONG = Number(process.env.LONG_SECONDS || 1500), SHORT = Number(process.env.SHORT_SECONDS || 300);
const FEE = GEN / 2n;                 // P1, the gym: one period
const FEE2 = 3n * GEN / 10n;          // P2, the streaming plan
const WRONG = GEN / 4n;
const RULE = "A cancellation is honoured when the reply itself confirms it: no phone call, chat, visit or form is required, no offer must be answered first, no other condition is attached, and it takes effect no later than the end of the current period.";
const GYM = "Ironside Gym, monthly", STREAM = "Northwind Stream, premium";
const MSG_A = "Please cancel my Ironside Gym membership at the end of this month. Thank you.";
const MSG_B = "I would like to cancel my membership, please. I am moving to another city next month.";
const MSG_STREAM = "Please cancel my Northwind Stream premium plan. I will not need it after this month.";
const CONFIRM = "Your membership is cancelled and ends when this month ends. No further payments will be taken.";
const STALL = "We're sorry to see you go! To cancel, please call our member line on weekdays between 9 and 5 so we can confirm your identity.";

await fundOnce("p", 5); await fundOnce("a", 5); await fundOnce("b", 5); await fundOnce("s", 5);
if (!st.start) { st.start = {}; for (const k of Object.keys(ROLES)) st.start[k] = String(await balance(acct[k].address)); st.started = new Date().toISOString(); save(); }
console.log(`[${stamp()}] ${Object.keys(ROLES).map((k) => k.toUpperCase() + " " + st.accounts[k] + "  " + ROLES[k]).join("\n           ")}\n           state ${STATE}`);

// ================================================================ phase A
console.log(`\n[${stamp()}] ---- phase A: deploy, and two plans opened`);
st.contract = st.contract || await deploy("deploy", "p", "../../contracts/exit_clause.py");
save();
console.log(`      Exit Clause at ${st.contract}`);
const o1 = await call("openGym", "p", "open_plan", [GYM, String(FEE), PERIOD, LONG]);
ok("the provider opens P1, Ironside Gym: 0.5 GEN for a 30-minute period, a 25-minute reply window", o1.j?.ok === true && o1.j?.plan === "P1" && o1.j?.fee === String(FEE) && o1.j?.period === PERIOD && o1.j?.reply_window === LONG, `${votes(o1)}  ${o1.msg.slice(0, 120)}`);
const gym = o1.j?.plan || "P1";
const o2 = await call("openStream", "p", "open_plan", [STREAM, String(FEE2), PERIOD, SHORT]);
ok("the provider opens P2, Northwind Stream: 0.3 GEN, the same period, a 5-minute reply window", o2.j?.ok === true && /^P\d+$/.test(String(o2.j?.plan)) && o2.j?.reply_window === SHORT, `${votes(o2)}  ${o2.msg.slice(0, 120)}`);
const stream = o2.j?.plan || "P2";

// ================================================================ phase B
console.log(`\n[${stamp()}] ---- phase B: joins, a refunded join, an early collect, the cancellations, a stranger's cancel`);
const ja = await call("joinGymA", "a", "join", [gym], { value: FEE, watch: ["a"], expect: { a: -FEE } });
ok("A joins P1 with exactly the fee, and the contract holds it: nothing reaches the provider yet", ja.j?.ok === true && ja.j?.status === "live" && ja.j?.held === String(FEE) && moved(ja, "a", -FEE), `${votes(ja)}  ${ja.msg.slice(0, 110)}`);
const mA = ja.j?.membership || "";
// Four accounts, four lanes. The provider's early collect goes first, while A's period has just begun; A
// cancels P2 before P1, so P2's short window starts as early as it can.
const [early, sLane, aLane, bLane] = await Promise.all([
  call("collectEarly", "p", "collect", [mA], { watch: ["p"], expect: { p: 0n } }),
  (async () => {
    const wrong = await call("joinWrongFee", "s", "join", [gym], { value: WRONG, watch: ["s"], expect: { s: 0n } });
    const sc = await call("cancelStranger", "s", "cancel", [mA, MSG_B]);
    return { wrong, sc };
  })(),
  (async () => {
    const js = await call("joinStreamA", "a", "join", [stream], { value: FEE2, watch: ["a"], expect: { a: -FEE2 } });
    const cs = await call("cancelStreamA", "a", "cancel", [js.j?.membership || "", MSG_STREAM]);
    const ca = await call("cancelGymA", "a", "cancel", [mA, MSG_A]);
    return { js, cs, ca };
  })(),
  (async () => {
    const jb = await call("joinGymB", "b", "join", [gym], { value: FEE, watch: ["b"], expect: { b: -FEE } });
    const cb = await call("cancelGymB", "b", "cancel", [jb.j?.membership || "", MSG_B]);
    return { jb, cb };
  })(),
]);
ok(`the provider may not collect A's fee while the period of ${mA} runs`, refused(early, "the period of " + mA + " runs for another") && moved(early, "p", 0n), `${votes(early)}  ${early.msg.slice(0, 110)}`);
const { wrong, sc } = sLane, { js, cs, ca } = aLane, { jb, cb } = bLane;
ok("a join sent with 0.25 GEN instead of the fee is refused, and the 0.25 GEN comes back in the same transaction", wrong.exec !== "ERROR" && wrong.j?.ok === false && String(wrong.j?.reason).includes("send exactly the fee") && wrong.j?.returned === String(WRONG) && moved(wrong, "s", 0n), `${votes(wrong)}  ${wrong.j?.reason}`);
ok(`a stranger who holds no membership may not cancel A's, ${mA}`, refused(sc, "only the member who holds " + mA + " may cancel it"), `${votes(sc)}  ${sc.msg.slice(0, 110)}`);
ok("A joins P2 with exactly its fee", js.j?.ok === true && js.j?.held === String(FEE2) && moved(js, "a", -FEE2), `${votes(js)}  ${js.msg.slice(0, 100)}`);
ok("A asks to cancel P2 at once, so its 5-minute window runs while everything else happens", cs.j?.ok === true && cs.j?.status === "open", `${votes(cs)}  ${cs.msg.slice(0, 100)}`);
ok("A asks to cancel P1, and the provider's reply window starts on the chain's clock", ca.j?.ok === true && ca.j?.status === "open" && Number(ca.j?.deadline) > 0, `${votes(ca)}  ${ca.msg.slice(0, 100)}`);
ok("B joins P1 with exactly the fee, and the contract holds it for the period", jb.j?.ok === true && jb.j?.status === "live" && jb.j?.held === String(FEE) && moved(jb, "b", -FEE), `${votes(jb)}  ${jb.msg.slice(0, 110)}`);
ok("B asks to cancel P1", cb.j?.ok === true && cb.j?.status === "open", `${votes(cb)}  ${cb.msg.slice(0, 110)}`);
const mS = js.j?.membership || "", mB = jb.j?.membership || "";
const rA = ca.j?.request || "", rB = cb.j?.request || "", rS = cs.j?.request || "";

// ================================================================ phase C
console.log(`\n[${stamp()}] ---- phase C: the replies, each read by the network against the rule`);
{
  const [sr, ra] = await Promise.all([
    call("replyStranger", "s", "reply", [rA, CONFIRM]),
    call("replyA", "p", "reply", [rA, CONFIRM], { watch: ["a", "p"], expect: { a: 0n, p: 0n } }),
  ]);
  ok(`a stranger may not reply to ${rA}`, refused(sr, "only the provider of " + gym + " may reply to " + rA), `${votes(sr)}  ${sr.msg.slice(0, 110)}`);
  ok("the validators carry one word for the provider's reply to A, in one consensus round", ra.applied && ["honoured", "stalled", "unclear"].includes(String(ra.j?.verdict)), `${votes(ra)}  -> ${ra.j?.verdict}`);
  ok("\"cancelled and ends when this month ends\" honours the cancellation: nothing moves, and A's fee stays held for the provider", ra.j?.verdict === "honoured" && ra.j?.status === "honoured" && ra.j?.membership_status === "cancelled" && ra.j?.held === String(FEE) && moved(ra, "a", 0n) && moved(ra, "p", 0n), `${ra.j?.verdict}  ${JSON.stringify(ra.delta)}`);
  const rb = await call("replyB", "p", "reply", [rB, STALL], { watch: ["b", "p"], expect: (j) => ({ b: BigInt(j?.refunded || 0), p: 0n }) });
  ok("\"please call our member line\" stalls the cancellation", rb.j?.verdict === "stalled" && rb.j?.status === "stalled", `${votes(rb)}  -> ${rb.j?.verdict}`);
  ok("in the same transaction B's 0.5 GEN for this period comes back, and the membership ends now", rb.j?.refunded === String(FEE) && rb.j?.membership_status === "refunded" && moved(rb, "b", FEE) && moved(rb, "p", 0n), JSON.stringify(rb.delta));
  const again = await call("replyAgain", "p", "reply", [rA, STALL]);
  ok(`a further reply to ${rA}, now settled, is refused`, refused(again, rA + " is honoured; a reply is taken while the request is open"), `${votes(again)}  ${again.msg.slice(0, 110)}`);
  const v = await seen("requestB", "request", [rB]);
  ok(`request(${rB}) shows B's message, the reply, its agreed word and the fee that came back`, v.status === "stalled" && v.message === MSG_B && JSON.stringify(v.verdicts) === '["stalled"]' && v.replies?.[0]?.text === STALL && v.refunded === String(FEE) && v.held === "0", JSON.stringify({ status: v.status, verdicts: v.verdicts, refunded: v.refunded }));
}

// ================================================================ phase D
console.log(`\n[${stamp()}] ---- phase D: the window nobody answered, and the period that ran out`);
{
  await until("request", rS, "deadline");
  const lp = await call("lapseStream", "s", "lapse", [rS], { watch: ["a"], expect: { a: FEE2 } });
  ok(`P2's provider never replied: after the window a stranger lapses ${rS} and A's 0.3 GEN comes back by rule`, lp.j?.status === "lapsed" && lp.j?.refunded === String(FEE2) && moved(lp, "a", FEE2), `${votes(lp)}  ${lp.msg.slice(0, 110)}`);
  await until("membership", mA, "end");
  const cl = await call("collectGymA", "s", "collect", [mA], { watch: ["p"], expect: { p: FEE } });
  ok(`once A's period is over a stranger collects ${mA}, and the provider receives the 0.5 GEN`, cl.j?.status === "served" && cl.j?.collected === String(FEE) && moved(cl, "p", FEE), `${votes(cl)}  ${JSON.stringify(cl.delta)}`);
}

// ================================================================ phase E
console.log(`\n[${stamp()}] ---- phase E: the code read back, the views, the balances`);
{
  const file = readFileSync(new URL("../../contracts/exit_clause.py", import.meta.url));
  const chain = Buffer.from(String(await rpc("gen_getContractCode", [st.contract])), "base64");
  st.code = { address: st.contract, bytes: chain.length, sha256: sha(chain), file_bytes: file.length, file_sha256: sha(file), identical: Buffer.compare(chain, file) === 0 };
  save();
  ok(`the code deployed at ${st.contract} is byte for byte contracts/exit_clause.py`, st.code.identical, `${chain.length} bytes, sha256 ${st.code.sha256}`);
  const ma = await seen("membershipA", "membership", [mA]);
  ok(`membership(${mA}) reads served: the fee collected for the provider, nothing held`, ma.status === "served" && ma.collected === String(FEE) && ma.held === "0" && ma.request === rA, JSON.stringify({ status: ma.status, collected: ma.collected }));
  const mb = await seen("membershipB", "membership", [mB]);
  ok(`membership(${mB}) reads refunded: the fee went back to B`, mb.status === "refunded" && mb.refunded === String(FEE) && mb.held === "0", JSON.stringify({ status: mb.status, refunded: mb.refunded }));
  const stats = await seen("stats", "stats", []);
  ok("stats(): two plans, three memberships, three requests, one honoured, one stalled, one lapsed, one refused join, nothing held", stats.plans === 2 && stats.memberships === 3 && stats.requests === 3 && stats.open_requests === 0 && stats.honoured === 1 && stats.stalled === 1 && stats.lapsed === 1 && stats.refunds === 2 && stats.refunded === String(FEE + FEE2) && stats.collections === 1 && stats.collected === String(FEE) && stats.held === "0" && stats.refused_joins === 1 && stats.returned === String(WRONG), JSON.stringify(stats));
  const mine = await seen("membershipsOfA", "memberships_of", [st.accounts.a]);
  ok("memberships_of(A) lists A's two memberships, and finds the address in any letter case", JSON.stringify(mine.memberships) === JSON.stringify([mA, mS]) && JSON.stringify(mine.provides) === "[]", JSON.stringify(mine));
  const theirs = await seen("requestsOfP", "requests_of", [st.accounts.p]);
  ok("requests_of(the provider) lists the three cancellations sent to its plans", (theirs.received || []).length === 3 && [rA, rB, rS].every((r) => theirs.received.includes(r)), JSON.stringify(theirs));
  const rules = await seen("rules", "rules", []);
  ok("rules() publishes THE RULE word for word, the comparison and the combine table", rules.rule === RULE && String(rules.compared).includes("exact string equality") && rules.combine?.["yes then no"] === "honoured" && rules.combine?.["no then yes"] === "stalled", String(rules.value));
  ok("the contract's own balance is zero", (await balance(st.contract)) === 0n, String(await balance(st.contract)));
  st.end = {}; for (const k of Object.keys(ROLES)) st.end[k] = String(await balance(acct[k].address));
  st.ended = new Date().toISOString(); save();
  const net = (k) => BigInt(st.end[k]) - BigInt(st.start[k]);
  const want = { p: FEE, a: -FEE, b: 0n, s: 0n };
  ok("every account ends where the money table says: the provider up 0.5 GEN, A down 0.5 GEN, B and the stranger whole", Object.keys(want).every((k) => net(k) === want[k]), Object.keys(want).map((k) => k.toUpperCase() + " " + Number(net(k)) / 1e18).join("  "));
}

st.checks = { pass, fail }; save();
console.log(`\n${pass} passed, ${fail} failed`);
console.log(`Exit Clause: ${st.contract}  ${EXPLORER}/address/${st.contract}`);
console.log("transactions:", st.order.reduce((n, id) => n + st.steps[id].tries.length, 0), "in", st.order.length, "steps; sent a second time:", st.order.filter((id) => st.steps[id].tries.length > 1).join(", ") || "none");
for (const id of st.order) { const s = st.steps[id]; console.log(`${id.padEnd(15)} ${s.tries.map((t) => t.tx + " " + tally(t.votes) + " " + t.exec).join(" | ")}`); }
console.log("record:", RECORD);
process.exit(fail ? 1 : 0);
