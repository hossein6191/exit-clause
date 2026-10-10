// Chain access for Exit Clause: the ONE file that knows the contract's interface.
//
// Every method name, argument order, view shape and outcome word of contracts/exit_clause.py that
// the site depends on is written here and nowhere else. Pages import typed reads, typed call
// builders and mapped outcomes from this module; when the contract's interface changes, this is the
// file to edit, with lib/chain-mock.ts, which stands in for the contract in mock mode and answers in
// the contract's own JSON so the mappers below run in both modes.
//
// Reads go through readContract (gen_call) with the retry policy in lib/rpc.ts: eight tries over
// about forty seconds, because Studio answers "Contract not found" for a healthy contract for about
// a minute after a deploy. A failed read is never "no data" and never proof that a write failed.
// Studio allows 30 gen_call a minute from one browser (the faucet shares them), so every view answer
// is cached for 30 s, two components asking for the same view share one request, and
// invalidateReads() drops the cache once a transaction is final. A read fails once its encoded
// calldata passes 256 bytes, so every view here takes a short id, two numbers or an address.

import * as mock from "./chain-mock";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { getAddress, type Address } from "viem";
import { notify } from "./browser-store";
import { contractAddress } from "./config";
import { RATE_LIMITED, createReadCache, decodeTx, isMissingMethodError, noteFailure, rpc, sleep, waitForCooldown, withRetry, type RawTx } from "./rpc";
import {
  MEMBERSHIP_STATUSES,
  PAGE,
  PLAN_STATUSES,
  REQUEST_STATUSES,
  VERDICTS,
  idNumber,
  membershipPhase,
  requestPhase,
  sentence,
  type MembershipPhase,
  type MembershipStatus,
  type PlanStatus,
  type RequestPhase,
  type RequestStatus,
  type Verdict,
} from "./rules";
import type { Arg, Call, DemoReplyAnswer, DemoStatus, Membership, MyIds, Plan, PlanPage, PlanRow, ReadResult, Reply, Request, Rules, Stats, TxStatus, WriteFn } from "./types";
import { chainName, getChainId, getSigner } from "./wallet";

export { RATE_LIMITED, cooldownRemainingMs } from "./rpc";
export { contractAddress };

export const CHAIN_ID = 61999;
export const RPC_URL = "https://studio.genlayer.com/api";
export const EXPLORER_URL = "https://explorer-studio.genlayer.com";

export const isMock = process.env.NEXT_PUBLIC_MOCK === "1";

export const NETWORK_ERROR = "could not reach the network";
/** Thrown by reads while the site has no contract address. */
export const NO_CONTRACT = "the contract is not deployed yet";
/** What the faucet says when Studio refused sim_fundAccount three times. */
export const FAUCET_REFUSED =
  "Studio refused the faucet request (it allows 30 requests a minute from one browser). Try again in a minute.";

/** True when this site has a contract to read: always in mock mode. */
export const hasContract = (): boolean => isMock || !!contractAddress();

/** The contract the explorer links point at. */
export const contractInUse = (): string => (isMock ? mock.MOCK_CONTRACT : contractAddress());

// ---- low-level view access ------------------------------------------------------------------------

// The SDK's studionet object carries another explorer URL; the RPC and explorer hosts are set here.
export const studio = {
  ...studionet,
  rpcUrls: { ...studionet.rpcUrls, default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "GenLayer Studio Explorer", url: EXPLORER_URL } },
};

const reader = () => createClient({ chain: studio });

type Row = Record<string, unknown>;

const num = (v: unknown, dflt = 0): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : dflt;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && /^-?\d+$/.test(v.trim())) return Number(v);
  return dflt;
};
const str = (v: unknown, dflt = ""): string => (v === undefined || v === null ? dflt : String(v));
const atto = (v: unknown): string => {
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? BigInt(Math.trunc(v)).toString() : "0";
  const s = str(v, "0").trim();
  return /^\d+$/.test(s) ? s : "0";
};
const addr = (v: unknown): string => str(v).toLowerCase();
/** Seconds; the contract writes -1 or 0 when a call had no readable clock. */
const secs = (v: unknown): number => Math.max(0, num(v));
const asRow = (v: unknown): Row => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {});
const rowsOf = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((r): r is Row => !!r && typeof r === "object" && !Array.isArray(r)) : []);
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string").map(String) : []);

/** A view returns a JSON string; parse it. Some decoders already hand back the object. */
function parseView(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

/** How long a view answer is reused. */
export const READ_TTL_MS = 30_000;
const onServer = typeof window === "undefined";
const views = createReadCache<unknown>(onServer ? 0 : READ_TTL_MS);

let moved = 0;
/** How many times the chain has moved under this page (a final transaction, a faucet payment): a stable snapshot. */
export const chainVersion = (): number => moved;

/** Forget every cached view answer, and tell the lists on screen to read again. Called once a transaction is final or the faucet paid. */
export const invalidateReads = () => {
  views.clear();
  moved++;
  notify();
};

/**
 * One view call through the cache. Throws RATE_LIMITED when Studio is rate-limiting this browser,
 * NO_CONTRACT when no contract is set, and the plain network error when Studio never answered.
 */
async function view(fn: string, args: Arg[] = [], opts: { fresh?: boolean } = {}): Promise<unknown> {
  if (isMock) return parseView(await mock.view(fn, args));
  const address = contractAddress();
  if (!address) throw new Error(NO_CONTRACT);
  const key = `${address.toLowerCase()}|${fn}|${JSON.stringify(args)}`;
  if (opts.fresh) views.forget(key);
  try {
    const raw = await views.get(key, () =>
      withRetry(() => reader().readContract({ address: address as Address, functionName: fn, args }), {
        bucket: "gen",
        giveUp: isMissingMethodError,
      }),
    );
    return parseView(raw);
  } catch (e) {
    if (e instanceof Error && e.message === RATE_LIMITED) throw e;
    throw new Error(NETWORK_ERROR);
  }
}

const SOURCE: ReadResult<unknown>["source"] = isMock ? "mock" : "chain";
const result = <T>(data: T): ReadResult<T> => ({ data, source: SOURCE });

// ---- row mappers (every missing field gets a default) -----------------------------------------------

const planStatus = (v: unknown): PlanStatus => (PLAN_STATUSES.includes(str(v) as PlanStatus) ? (str(v) as PlanStatus) : "open");
const memberStatus = (v: unknown): MembershipStatus =>
  MEMBERSHIP_STATUSES.includes(str(v) as MembershipStatus) ? (str(v) as MembershipStatus) : "live";
const requestStatus = (v: unknown): RequestStatus => (REQUEST_STATUSES.includes(str(v) as RequestStatus) ? (str(v) as RequestStatus) : "open");
const verdictOf = (v: unknown): Verdict => (VERDICTS.includes(str(v) as Verdict) ? (str(v) as Verdict) : "unclear");
const M_PHASES: MembershipPhase[] = ["running", "cancelled", "due", "unknown", "cancelling", "refunded", "served"];
const R_PHASES: RequestPhase[] = ["reply", "lapse", "closed", "unknown"];
const mPhase = (v: unknown): MembershipPhase => (M_PHASES.includes(str(v) as MembershipPhase) ? (str(v) as MembershipPhase) : "unknown");
const rPhase = (v: unknown): RequestPhase => (R_PHASES.includes(str(v) as RequestPhase) ? (str(v) as RequestPhase) : "unknown");

export function mapPlanRow(r: Row, id = ""): PlanRow {
  return {
    id: str(r.plan ?? id),
    name: str(r.name),
    provider: addr(r.provider),
    status: planStatus(r.status),
    feeAtto: atto(r.fee),
    period: secs(r.period),
    replyWindow: secs(r.reply_window),
    openedAt: secs(r.opened_at),
    closedAt: secs(r.closed_at),
    members: num(r.members),
    live: num(r.live),
    heldAtto: atto(r.held),
  };
}

export function mapPlan(r: Row, id = ""): Plan {
  return { ...mapPlanRow(r, id), memberships: ids(r.memberships_list), now: secs(r.now) };
}

export function mapMembership(r: Row, id = ""): Membership {
  return {
    id: str(r.membership ?? id),
    plan: str(r.plan),
    planName: str(r.plan_name),
    provider: addr(r.provider),
    member: addr(r.member),
    feeAtto: atto(r.fee),
    start: secs(r.start),
    end: secs(r.end),
    status: memberStatus(r.status),
    phase: mPhase(r.phase),
    collectable: r.collectable === true,
    heldAtto: atto(r.held),
    refundedAtto: atto(r.refunded),
    collectedAtto: atto(r.collected),
    request: str(r.request),
    closedAt: secs(r.closed_at),
    now: secs(r.now),
  };
}

export function mapRequest(r: Row, id = ""): Request {
  const replies: Reply[] = rowsOf(r.replies).map((x) => ({ text: str(x.text), verdict: verdictOf(x.verdict), at: secs(x.at) }));
  return {
    id: str(r.request ?? id),
    membership: str(r.membership),
    plan: str(r.plan),
    planName: str(r.plan_name),
    member: addr(r.member),
    provider: addr(r.provider),
    message: str(r.message),
    status: requestStatus(r.status),
    phase: rPhase(r.phase),
    sentAt: secs(r.sent_at),
    deadline: secs(r.deadline),
    end: secs(r.end),
    replies,
    repliesLeft: num(r.replies_left),
    feeAtto: atto(r.fee),
    heldAtto: atto(r.held),
    refundedAtto: atto(r.refunded),
    closedAt: secs(r.closed_at),
    closedBy: addr(r.closed_by),
    now: secs(r.now),
  };
}

export function mapStats(r: Row): Stats {
  return {
    plans: num(r.plans),
    closedPlans: num(r.closed_plans),
    memberships: num(r.memberships),
    requests: num(r.requests),
    openRequests: num(r.open_requests),
    honoured: num(r.honoured),
    stalled: num(r.stalled),
    lapsed: num(r.lapsed),
    replies: num(r.replies),
    unclearReplies: num(r.unclear_replies),
    refunds: num(r.refunds),
    refundedAtto: atto(r.refunded),
    collections: num(r.collections),
    collectedAtto: atto(r.collected),
    heldAtto: atto(r.held),
    refusedJoins: num(r.refused_joins),
    returnedAtto: atto(r.returned),
  };
}

/** The membership's phase on the browser's clock: the contract's own rule, so a countdown that runs out moves the page on. */
export const membershipPhaseNow = (m: { status: MembershipStatus; end: number }, nowSeconds: number): MembershipPhase =>
  membershipPhase(m.status, m.end, nowSeconds);

/** The request's phase on the browser's clock. */
export const requestPhaseNow = (r: { status: RequestStatus; deadline: number }, nowSeconds: number): RequestPhase =>
  requestPhase(r.status, r.deadline, nowSeconds);

// ---- reads: one function per view ---------------------------------------------------------------------

/** plan(id): null when the contract holds no such plan. */
export async function readPlan(id: string, opts: { fresh?: boolean } = {}): Promise<ReadResult<Plan | null>> {
  const value = asRow(await view("plan", [id], opts));
  if ("error" in value || !value.plan) return result(null);
  return result(mapPlan(value, id));
}

/** membership(id): null when there is no such membership. */
export async function readMembership(id: string, opts: { fresh?: boolean } = {}): Promise<ReadResult<Membership | null>> {
  const value = asRow(await view("membership", [id], opts));
  if ("error" in value || !value.membership) return result(null);
  return result(mapMembership(value, id));
}

/** request(id): null when there is no such request. */
export async function readRequest(id: string, opts: { fresh?: boolean } = {}): Promise<ReadResult<Request | null>> {
  const value = asRow(await view("request", [id], opts));
  if ("error" in value || !value.request) return result(null);
  return result(mapRequest(value, id));
}

/** plans(offset, limit): one page, oldest first; at most 20 rows whatever is asked. The two numbers travel as integers. */
export async function readPlanPage(offset: number, limit: number = PAGE, opts: { fresh?: boolean } = {}): Promise<ReadResult<PlanPage>> {
  const value = asRow(await view("plans", [Math.max(0, Math.trunc(offset)), Math.max(1, Math.trunc(limit))], opts));
  if (!Array.isArray(value.rows)) throw new Error(NETWORK_ERROR);
  return result({
    total: num(value.total),
    offset: num(value.offset),
    limit: num(value.limit, PAGE),
    rows: rowsOf(value.rows).map((r) => mapPlanRow(r)).filter((p) => p.id),
    now: secs(value.now),
  });
}

/**
 * Many pages of plans, newest first. Reads the first page (which says how many there are), then the
 * newest pages down to `maxPages` in all; `partial` says some pages in the middle were not read.
 */
export async function readPlansWindow(maxPages = 4, opts: { fresh?: boolean } = {}): Promise<ReadResult<{ total: number; rows: PlanRow[]; partial: boolean; now: number }>> {
  const first = (await readPlanPage(0, PAGE, opts)).data;
  const pages = Math.ceil(first.total / PAGE);
  const offsets: number[] = [];
  for (let p = pages - 1; p >= 1 && offsets.length < maxPages - 1; p--) offsets.push(p * PAGE);
  const rows = [...first.rows];
  for (const off of offsets) rows.push(...(await readPlanPage(off, PAGE, opts)).data.rows);
  const unique = new Map(rows.map((r) => [r.id, r]));
  const sorted = [...unique.values()].sort((a, b) => idNumber(b.id) - idNumber(a.id));
  return result({ total: first.total, rows: sorted, partial: pages > maxPages, now: first.now });
}

/** memberships_of(address) and requests_of(address) together: every id an address is part of, oldest first. */
export async function readMine(address: string, opts: { fresh?: boolean } = {}): Promise<ReadResult<MyIds>> {
  const a = address.toLowerCase();
  const m = asRow(await view("memberships_of", [a], opts));
  const r = asRow(await view("requests_of", [a], opts));
  return result({ address: a, memberships: ids(m.memberships), provides: ids(m.provides), sent: ids(r.sent), received: ids(r.received) });
}

/** memberships_of(address) alone: the memberships it holds and the plans it provides. */
export async function readMembershipsOf(address: string, opts: { fresh?: boolean } = {}): Promise<ReadResult<{ memberships: string[]; provides: string[] }>> {
  const m = asRow(await view("memberships_of", [address.toLowerCase()], opts));
  return result({ memberships: ids(m.memberships), provides: ids(m.provides) });
}

/** stats(): the contract's totals. */
export async function readStats(opts: { fresh?: boolean } = {}): Promise<ReadResult<Stats>> {
  return result(mapStats(asRow(await view("stats", [], opts))));
}

/** rules(): the contract's own words for what it agrees on, who may do what and where the money goes. */
export async function readRules(): Promise<ReadResult<Rules>> {
  return result(asRow(await view("rules", [])));
}

// ---- writes: one builder per method (lib/calls.ts) ------------------------------------------------------

export { calls } from "./calls";

/** True for the one call the validators judge with their models: the rail then shows their votes and says what they read. */
export const isJudged = (fn: WriteFn) => fn === "reply";

const WRONG_CHAIN = (chainId: number | null) =>
  `Your wallet is on ${chainName(chainId)}. Switch it to GenLayer Studio (chain 61999) before signing.`;

/** Sends a call through the connected EIP-1193 provider. Resolves to the transaction hash. */
export async function write(call: Call): Promise<string> {
  if (isMock) return mock.write(call);
  const address = contractAddress();
  if (!address) throw new Error("The contract is not deployed yet, so there is nothing to sign.");
  const signer = getSigner();
  if (!signer) throw new Error("Connect a wallet first.");
  // Studio is gasless and the SDK skips its own chain check for it, so the refusal to sign on
  // another chain lives here, and it says which chain the wallet is on.
  const chainId = await getChainId(signer.provider);
  if (chainId !== CHAIN_ID) throw new Error(WRONG_CHAIN(chainId));
  const client = createClient({ chain: studio, account: signer.address as Address, provider: signer.provider });
  const hash = await client.writeContract({
    address: address as Address,
    functionName: call.fn,
    args: call.args,
    value: call.value ?? 0n,
  });
  if (typeof hash !== "string" || !hash.startsWith("0x")) throw new Error("The wallet returned no transaction hash.");
  return hash;
}

// ---- outcomes: what a finished call's JSON return means ---------------------------------------------

/**
 * True when the leader's return is what the chain stored. A round with no majority, a cancelled tx
 * or one the validators did not accept still carries the leader's JSON, but nothing of it was kept.
 */
export const stored = (s: TxStatus | null): s is TxStatus => !!s && !s.undetermined && s.applied !== false && s.status !== "CANCELED";

/** The contract's reason for refusing a call, as a sentence; "" when the call was not refused. */
export function refusalReason(s: TxStatus | null): string {
  if (!s) return "";
  const r = s.result;
  if (r && r.ok === false) return sentence(str(r.reason));
  if (s.exec === "ERROR") {
    const m = /\[EXPECTED\]\s*([^"}\n]+)/.exec(s.message || "");
    return sentence(m ? m[1] : s.message || "");
  }
  return "";
}

/** True when the transaction finished and the contract did what was asked. */
export function succeeded(s: TxStatus | null): boolean {
  return !!s && s.status === "FINALIZED" && stored(s) && s.exec !== "ERROR" && s.result?.ok !== false;
}

/** A plain sentence for a tx that finished without doing what was asked; "" when it did. */
export function failureOf(s: TxStatus | null): string {
  if (!s) return "";
  if (s.undetermined) return "The validators did not reach a majority, so nothing was stored. Sending the same call again is safe.";
  if (s.status === "CANCELED") return "The network cancelled the transaction. Nothing was stored.";
  const reason = refusalReason(s);
  if (reason) return reason;
  if (s.applied === false) return "The validators did not accept this transaction. Nothing was stored.";
  return "";
}

const ok = (s: TxStatus | null): s is TxStatus & { result: Row } => stored(s) && s.result?.ok === true;

/** open_plan()'s return: the new plan's id, or "". */
export const openedPlan = (s: TxStatus | null): string => (ok(s) && /^P\d+$/.test(str(s.result.plan)) ? str(s.result.plan) : "");

/** join()'s return: joined (with the membership id), or refused with what came back. */
export function joinOutcome(s: TxStatus | null): { kind: "joined"; membership: string } | { kind: "refused"; reason: string; returnedAtto: string } | { kind: "unknown" } {
  if (!stored(s) || !s.result) return { kind: "unknown" };
  if (s.result.ok === true) return { kind: "joined", membership: str(s.result.membership) };
  if (s.result.ok === false) return { kind: "refused", reason: sentence(str(s.result.reason)), returnedAtto: atto(s.result.returned) };
  return { kind: "unknown" };
}

/** cancel()'s return: the new request's id, or "". */
export const sentRequest = (s: TxStatus | null): string => (ok(s) && /^R\d+$/.test(str(s.result.request)) ? str(s.result.request) : "");

/** reply()'s return: the agreed word and what went back to the member in the same call. */
export function replyOutcome(s: TxStatus | null): { verdict: Verdict; status: RequestStatus; refundedAtto: string } | null {
  if (!ok(s) || !VERDICTS.includes(str(s.result.verdict) as Verdict)) return null;
  return { verdict: str(s.result.verdict) as Verdict, status: requestStatus(s.result.status), refundedAtto: atto(s.result.refunded) };
}

/** True when GEN moves to or from somebody because of this call, so balances are watched afterwards. */
export function movesMoney(s: TxStatus): boolean {
  const r = s.result;
  if (!r) return false;
  if (r.ok === false) return atto(r.returned) !== "0";
  if (r.ok !== true) return false;
  if (str(r.status) === "live" && r.membership) return true; // a join
  if (atto(r.refunded) !== "0") return true; // a stall or a lapse
  return str(r.status) === "served"; // a collect
}

// ---- the demo provider ------------------------------------------------------------------------------

let demoCache: { at: number; value: DemoStatus } | null = null;

/** Whether the demo provider can sign now, and its address. Asked of the site's own server; cached a minute. */
export async function readDemoStatus(): Promise<DemoStatus> {
  if (isMock) return mock.demoStatus();
  if (demoCache && Date.now() - demoCache.at < 60_000) return demoCache.value;
  try {
    const res = await fetch("/api/demo/status", { cache: "no-store" });
    const body = (await res.json()) as Partial<DemoStatus>;
    const value: DemoStatus = { online: body.online === true, provider: addr(body.provider), reason: str(body.reason) };
    demoCache = { at: Date.now(), value };
    return value;
  } catch {
    return { online: false, provider: "", reason: "the site's server did not answer" };
  }
}

/** Asks the demo provider to send its plan's scripted reply to a cancellation. Resolves to its hash or the reason it did not. */
export async function requestDemoReply(request: string): Promise<DemoReplyAnswer> {
  if (isMock) return mock.demoReply(request);
  try {
    const res = await fetch("/api/demo/reply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ request }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    if (body.ok === true && typeof body.hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(body.hash)) return { ok: true, hash: body.hash };
    return { ok: false, reason: sentence(str(body.reason, "the demo provider did not answer")), retryAfter: num(body.retryAfter) || undefined };
  } catch {
    return { ok: false, reason: "The site's server did not answer. Try again in a minute." };
  }
}

// ---- transactions, balances, the faucet -------------------------------------------------------------

/** One poll of a transaction. Pages call this every 3 s until it is final. */
export async function txStatus(hash: string): Promise<TxStatus> {
  if (isMock) return mock.txStatus(hash);
  // Two quick tries: the caller polls anyway. eth_* has its own bucket and its own retry budget,
  // so neither a gen_call cooldown nor the gen_call retry loops ever stall the rail.
  const tx = await withRetry(() => rpc<RawTx | null>("eth_getTransactionByHash", [hash]), { tries: 2, bucket: "eth", ownBudget: true });
  return decodeTx(tx);
}

/** Balance in atto of an address (eth_getBalance). */
export async function balanceOf(address: string): Promise<bigint> {
  if (isMock) return mock.balanceOf(address);
  const hex = await withRetry(() => rpc<string>("eth_getBalance", [address, "latest"]), { tries: 3, bucket: "eth", ownBudget: true });
  return BigInt(hex || "0x0");
}

const FAUCET_PAUSE_MS = 10_000;
const FAUCET_TRIES = 3;
const FAUCET_WAIT_MS = 60_000;

/**
 * Faucet: sim_fundAccount with 10 GEN, up to three tries ten seconds apart, each after the gen_call
 * cooldown. Resolves when the balance moved. `stillWanted` is asked between balance polls: once it
 * says no (the wallet switched accounts) the wait ends with an error nobody shows.
 */
export async function faucet(address: string, opts: { stillWanted?: () => boolean } = {}): Promise<bigint> {
  if (isMock) return mock.faucet(address);
  // Studio credits only a checksummed address: the lowercase spelling is accepted and never paid.
  let account: string;
  try {
    account = getAddress(address);
  } catch {
    throw new Error("That is not a valid 0x address, so the faucet was not asked.");
  }
  let before: bigint;
  try {
    before = await balanceOf(account);
  } catch {
    throw new Error("Could not read this wallet's balance from Studio, so the faucet was not asked. Try again in a few seconds.");
  }
  let sent = false;
  for (let i = 0; i < FAUCET_TRIES && !sent; i++) {
    await waitForCooldown("gen");
    try {
      // `amount` is wei as a JS number; a decimal string makes the node compare str with int.
      await rpc("sim_fundAccount", { account_address: account, amount: 10e18 });
      sent = true;
    } catch (e) {
      noteFailure(e, Date.now(), "gen");
      if (i === FAUCET_TRIES - 1) throw new Error(FAUCET_REFUSED);
      await sleep(FAUCET_PAUSE_MS);
    }
  }
  const started = Date.now();
  while (Date.now() - started < FAUCET_WAIT_MS) {
    await sleep(2000);
    if (opts.stillWanted && !opts.stillWanted()) throw new Error("The faucet wait ended: the wallet switched accounts.");
    try {
      const now = await balanceOf(account);
      if (now !== before) return now;
    } catch {
      /* a dropped poll is not a failed faucet; keep polling */
    }
  }
  throw new Error("The faucet did not credit the account within 60 s. Try again.");
}

export const txUrl = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const addressUrl = (address: string) => `${EXPLORER_URL}/address/${address}`;
export const planPath = (id: string) => `/plan/${id}`;
export const requestPath = (id: string) => `/request/${id}`;
