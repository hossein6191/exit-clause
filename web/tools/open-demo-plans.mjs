// Opens the demo provider's three plans (Ironside Gym, Northwind Stream, Lingo Daily Pro) from its key,
// once. One plan takes any number of members, so no copies are needed. Run it by hand after the
// contract is deployed; nothing in the build runs it.
//
//   REGISTER=0x... DEMO_PROVIDER_KEY=0x... node tools/open-demo-plans.mjs
//   DRY=1 REGISTER=0x... node tools/open-demo-plans.mjs          # print the calls, send nothing
//
// The key is a throwaway Studio test key, the same one the site's server holds in DEMO_PROVIDER_KEY;
// it is read from the environment only and never printed. Studio is gasless, so the key needs no GEN.
// A plan this provider already runs open under the same name is skipped. Each open_plan is followed
// to FINALIZED before the next one goes out. Needs Node 22.18 or later (it reads lib/*.ts directly).

import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

import { cleanKey, keyProblem } from "../lib/demo-key.ts";
import { DEMO_PLANS, openArgs } from "../lib/demo-plans.ts";

const RPC = "https://studio.genlayer.com/api";
const EXPLORER = "https://explorer-studio.genlayer.com";
const studio = { ...studionet, rpcUrls: { ...studionet.rpcUrls, default: { http: [RPC] } } };

const REGISTER = (process.env.REGISTER || "").trim();
const DRY = process.env.DRY === "1";

const fail = (message) => {
  console.error(message);
  process.exit(2);
};
if (!/^0x[0-9a-fA-F]{40}$/.test(REGISTER)) fail("REGISTER must be the deployed contract's 0x address.");
const problem = keyProblem(process.env.DEMO_PROVIDER_KEY);
if (!DRY && problem) fail(`DEMO_PROVIDER_KEY: ${problem}.`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpc(method, params) {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const body = await res.json();
      if (body.error) {
        await sleep(res.status === 429 || body.error.code === -32029 ? 20_000 : 5000);
        continue;
      }
      return body.result;
    } catch {
      await sleep(4000);
    }
  }
  throw new Error(`${method} did not answer`);
}

/** Follows a transaction to a final status; returns the contract's JSON return and the vote tally. */
async function follow(hash) {
  for (let i = 0; i < 300; i++) {
    await sleep(4000);
    const tx = await rpc("eth_getTransactionByHash", [hash]);
    const status = String(tx?.status ?? "");
    if (status === "FINALIZED" || status === "CANCELED" || status === "UNDETERMINED") {
      const lr = tx.consensus_data?.leader_receipt;
      const one = Array.isArray(lr) ? lr[0] : lr;
      let text = "";
      try {
        text = Buffer.from(one?.result ?? "", "base64").toString("utf8");
      } catch {
        text = "";
      }
      const start = text.indexOf("{");
      let json = null;
      try {
        json = start >= 0 ? JSON.parse(text.slice(start, text.lastIndexOf("}") + 1)) : null;
      } catch {
        json = null;
      }
      const votes = Object.values(tx.consensus_data?.votes ?? {});
      return { status, json, agree: votes.filter((v) => v === "agree").length, of: votes.length, exec: one?.execution_result ?? "", text };
    }
  }
  return { status: "TIMEOUT", json: null, agree: 0, of: 0, exec: "", text: "" };
}

/** The names this provider already runs open, read from plans(offset, limit). */
async function openNames(client, provider) {
  const names = new Set();
  for (let offset = 0; offset < 2000; offset += 20) {
    let page = null;
    for (let i = 0; i < 8 && !page; i++) {
      try {
        const raw = await client.readContract({ address: REGISTER, functionName: "plans", args: [offset, 20] });
        page = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        await sleep(5000);
      }
    }
    if (!page) throw new Error("could not read plans() from Studio");
    for (const row of page.rows ?? []) if (row.status === "open" && String(row.provider).toLowerCase() === provider) names.add(row.name);
    if (offset + 20 >= Number(page.total ?? 0)) break;
  }
  return names;
}

console.log(`${DRY ? "DRY RUN: " : ""}the three demo plans to ${REGISTER}`);
if (DRY) {
  for (const p of DEMO_PLANS) {
    const a = openArgs(p);
    console.log(`open_plan(${JSON.stringify(a[0])}, "${a[1]}", ${a[2]}, ${a[3]})   # ${p.habit}`);
  }
  process.exit(0);
}

const account = createAccount(cleanKey(process.env.DEMO_PROVIDER_KEY));
const provider = account.address.toLowerCase();
console.log(`demo provider ${account.address}`);
const client = createClient({ chain: studio, account });
const already = await openNames(client, provider);

const made = [];
for (const p of DEMO_PLANS) {
  if (already.has(p.name)) {
    console.log(`SKIP  ${p.name}: this provider already runs it open`);
    continue;
  }
  let hash = "";
  for (let tries = 1; !hash; tries++) {
    try {
      hash = await client.writeContract({ address: REGISTER, functionName: "open_plan", args: openArgs(p), value: 0n });
    } catch (e) {
      if (tries >= 3) {
        console.log(`FAIL  ${p.name}: not sent (${String(e?.shortMessage || e?.message || e).slice(0, 80)})`);
        break;
      }
      await sleep(15_000);
    }
  }
  if (!hash) continue;
  const r = await follow(hash);
  const plan = r.json?.ok === true ? r.json.plan : "";
  console.log(`${plan ? "OK  " : "FAIL"}  ${p.name}: ${plan || r.status + " " + r.exec + " " + r.text.slice(0, 120)}  ${r.agree}/${r.of} agree  ${EXPLORER}/tx/${hash}`);
  if (plan) made.push(plan);
}
console.log(`\n${made.length} plan${made.length === 1 ? "" : "s"} opened${made.length ? ": " + made.join(", ") : ""}`);
