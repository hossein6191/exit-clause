// The contract's rules, in TypeScript, with no imports: the limits, THE RULE, the combine table, the
// readers of the caller's arguments, the phases on the clock and the stamps. The in-memory contract
// of mock mode (lib/chain-mock.ts) is built on these, the forms check against them before anything
// is signed, and tests/unit/*.test.mjs runs them from node with no browser.
//
// Every refusal sentence here is the contract's own, word for word (contracts/exit_clause.py), so a
// form, the mock and the chain all say the same thing about the same input.

export const ATTO = 10n ** 18n;

export const MIN_NAME = 3;
export const MAX_NAME = 60;
export const MIN_MESSAGE = 20;
export const MAX_MESSAGE = 400;
export const MIN_REPLY = 20;
export const MAX_REPLY = 600;
export const MAX_REPLIES = 2;
export const MIN_FEE = ATTO / 10n;
export const MAX_FEE = 100n * ATTO;
export const MIN_PERIOD = 300;
export const MAX_PERIOD = 90 * 86400;
export const MIN_WINDOW = 300;
export const MAX_WINDOW = 14 * 86400;
export const PAGE = 20;
export const ID_CHARS = 12;
export const ADDRESS_CHARS = 42;
export const ZERO = "0x0000000000000000000000000000000000000000";

/** THE RULE: a contract constant, the same for every plan, published word for word by rules(). */
export const THE_RULE =
  "A cancellation is honoured when the reply itself confirms it: no phone call, chat, visit or form is required, " +
  "no offer must be answered first, no other condition is attached, and it takes effect no later than the end of " +
  "the current period.";

/** The two questions the network asks about every reply, in the contract's words. */
export const QUESTION_HONOUR =
  "Does this reply honour the cancellation under the rule above: it confirms it, requires no call, chat, visit " +
  "or form, makes no offer the customer must answer first, attaches no other condition, and takes effect no " +
  "later than the end of the current period?";
export const QUESTION_STALL =
  "Does this reply stall the cancellation: ask for a call, chat, visit or form, make it wait on an offer or " +
  "another step, refuse it, or put it off beyond the end of the current period?";

// ---- the words the contract stores ----------------------------------------------------------------

/** The verdict on one reply, written by the contract from the two answers. */
export type Verdict = "honoured" | "stalled" | "unclear";
export const VERDICTS: Verdict[] = ["honoured", "stalled", "unclear"];

export type Answer = "yes" | "no" | "unclear" | "";

/** The contract's _combine: two framings into one verdict. Disagreement is a value. */
export function combine(honourAnswer: Answer, stallAnswer: Answer): Verdict {
  if (honourAnswer === "yes" && stallAnswer === "no") return "honoured";
  if (honourAnswer === "no" && stallAnswer === "yes") return "stalled";
  return "unclear";
}

export type PlanStatus = "open" | "closed";
export const PLAN_STATUSES: PlanStatus[] = ["open", "closed"];

/** live: the period runs, fee held. cancelling: a request is open. cancelled: honoured, fee held to the end. */
export type MembershipStatus = "live" | "cancelling" | "cancelled" | "refunded" | "served";
export const MEMBERSHIP_STATUSES: MembershipStatus[] = ["live", "cancelling", "cancelled", "refunded", "served"];
/** The statuses in which the contract still holds the membership's fee. */
export const HOLDING: MembershipStatus[] = ["live", "cancelling", "cancelled"];

export type RequestStatus = "open" | "honoured" | "stalled" | "lapsed";
export const REQUEST_STATUSES: RequestStatus[] = ["open", "honoured", "stalled", "lapsed"];

/** The contract's membership phase: running, cancelled (honoured, period still running), due (collectable). */
export type MembershipPhase = "running" | "cancelled" | "due" | "unknown" | "cancelling" | "refunded" | "served";
/** The contract's request phase: reply (window open), lapse (window closed, still open), closed. */
export type RequestPhase = "reply" | "lapse" | "closed" | "unknown";

/** The contract's _membership_row phase, on any clock. */
export function membershipPhase(status: MembershipStatus, end: number, now: number): MembershipPhase {
  if (status === "live" || status === "cancelled") {
    if (now < 0) return "unknown";
    if (now < end) return status === "live" ? "running" : "cancelled";
    return "due";
  }
  return status;
}

/** The contract's _request_row phase, on any clock. */
export function requestPhase(status: RequestStatus, deadline: number, now: number): RequestPhase {
  if (status !== "open") return "closed";
  if (now < 0) return "unknown";
  return now < deadline ? "reply" : "lapse";
}

/** The contract's _over: a membership is over once its fee went back, or its period ended with nothing open. */
export function isOver(status: MembershipStatus, end: number, now: number): boolean {
  if (status === "refunded") return true;
  if (status === "cancelling") return false;
  return now >= end;
}

// ---- reading the caller, as the contract does -----------------------------------------------------

/** The characters Python's str.strip() and str.split() treat as whitespace (str.isspace()). */
const PY_SPACE_CHARS = "\t\n\x0b\x0c\r\x1c\x1d\x1e\x1f \x85\xa0                　";

/** Python's str.strip(): JS trim() also takes U+FEFF and misses \x1c-\x1f and \x85. */
export function pyStrip(text: string): string {
  let a = 0;
  let b = text.length;
  while (a < b && PY_SPACE_CHARS.includes(text[a])) a++;
  while (b > a && PY_SPACE_CHARS.includes(text[b - 1])) b--;
  return text.slice(a, b);
}

/** The contract's _text_problem: "" when the text may be stored, else why not. Printable ASCII on one line. */
export function textProblem(text: string, least: number, most: number, what: string): string {
  // Python counts code points; a JS string's length counts UTF-16 units.
  const n = [...text].length;
  if (n < least || n > most) return `${what} is ${least} to ${most} characters; this one is ${n}`;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 32 || c > 126) return `${what} is printable ASCII on one line`;
  }
  return "";
}

/** The contract's _whole: a non-negative whole number in ASCII digits, or -1. */
export function whole(raw: string): bigint {
  const s = pyStrip(raw);
  if (!s || s.length > 40 || !/^[0-9]+$/.test(s)) return -1n;
  return BigInt(s);
}

/** The contract's _number_arg: an int, or a string of digits; -1 otherwise (a bool is refused by name). */
export function numberArg(raw: unknown): bigint {
  if (typeof raw === "boolean") return -1n;
  if (typeof raw === "bigint") return raw >= 0n ? raw : -1n;
  if (typeof raw === "number") return Number.isSafeInteger(raw) && raw >= 0 ? BigInt(raw) : -1n;
  if (typeof raw === "string") return whole(raw);
  return -1n;
}

/** open_plan's check of the name, after the strip. */
export const nameProblem = (name: string): string => textProblem(pyStrip(name), MIN_NAME, MAX_NAME, "the name");

/** open_plan's check of the fee, in atto. */
export function feeProblem(fee: bigint): string {
  if (fee < MIN_FEE || fee > MAX_FEE) return `the fee is a whole number of atto from ${MIN_FEE} (0.1 GEN) to ${MAX_FEE} (100 GEN), for one period`;
  return "";
}

/** open_plan's check of the period, in seconds. */
export function periodProblem(seconds: number): string {
  if (!(seconds >= MIN_PERIOD && seconds <= MAX_PERIOD)) return `the period is ${MIN_PERIOD} to ${MAX_PERIOD} seconds`;
  return "";
}

/** open_plan's check of the reply window, in seconds. */
export function windowProblem(seconds: number): string {
  if (!(seconds >= MIN_WINDOW && seconds <= MAX_WINDOW)) return `the reply window is ${MIN_WINDOW} to ${MAX_WINDOW} seconds`;
  return "";
}

/** cancel's check of the member's message, after the strip. */
export const messageProblem = (message: string): string => textProblem(pyStrip(message), MIN_MESSAGE, MAX_MESSAGE, "the message");

/** reply's check of the provider's text, after the strip. */
export const replyProblem = (text: string): string => textProblem(pyStrip(text), MIN_REPLY, MAX_REPLY, "the reply");

// ---- what the site sends --------------------------------------------------------------------------

const TYPOGRAPHIC: [string, string][] = [
  ["‘", "'"],
  ["’", "'"],
  ["“", '"'],
  ["”", '"'],
  ["–", "-"],
  ["—", "-"],
  ["…", "..."],
  [" ", " "],
];

/**
 * A text as a form sends it: typographic quotes, dashes and the ellipsis made plain, and every run
 * of whitespace, line breaks included, turned into one space. The contract itself only strips the
 * ends; this is what keeps a pasted message on one line of printable ASCII.
 */
export function plain(text: string): string {
  let t = String(text ?? "");
  for (const [fancy, plainChar] of TYPOGRAPHIC) t = t.split(fancy).join(plainChar);
  return t
    .split(/[\s\x1c-\x1f\x85]+/)
    .filter(Boolean)
    .join(" ");
}

/** A contract sentence as a sentence: capital first letter, full stop at the end. */
export function sentence(text: string): string {
  const t = String(text ?? "").replace(/^\s*\[(EXPECTED|TRANSIENT)\]\s*/i, "").trim();
  if (!t) return "";
  const s = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?)]$/.test(s) ? s : s + ".";
}

/** "P3" from "P3", "p3" or "3" (for prefix "P"); "" for anything else. */
export function parseId(prefix: "P" | "M" | "R", raw: string): string {
  let text = "";
  try {
    text = decodeURIComponent(String(raw ?? "")).trim();
  } catch {
    return "";
  }
  const m = new RegExp(`^${prefix}?([1-9]\\d{0,8})$`, "i").exec(text);
  return m ? prefix + m[1] : "";
}
export const parsePlanId = (raw: string) => parseId("P", raw);
export const parseMembershipId = (raw: string) => parseId("M", raw);
export const parseRequestId = (raw: string) => parseId("R", raw);

/** The number inside an id: 3 for "P3"; 0 when there is none. */
export const idNumber = (id: string): number => Number(/^[PMR]([1-9]\d{0,8})$/.exec(id)?.[1] ?? 0);

// ---- the stamp on a reply, and the step line of a thread ------------------------------------------

export type StampKind = "honoured" | "stalled" | "unclear" | "unclear-last" | "lapsed";
export type Tone = "honoured" | "stalled" | "unclear";

/** The words of each stamp and its ink. */
export const STAMPS: Record<StampKind, { text: string; tone: Tone; meaning: string }> = {
  honoured: { text: "HONOURED", tone: "honoured", meaning: "The reply confirms the cancellation. The fee stays held for the provider until the period ends." },
  stalled: { text: "STALLED · MONTH REFUNDED", tone: "stalled", meaning: "The reply puts the member off. This period's fee went back to the member in the same transaction." },
  unclear: { text: "UNCLEAR · MAY REPLY AGAIN", tone: "unclear", meaning: "Nothing moved. The provider may reply once more before the deadline." },
  "unclear-last": { text: "UNCLEAR · LAPSES AT DEADLINE", tone: "unclear", meaning: "Nothing moved, and that was the last reply. Once the window closes, anyone may lapse it and the fee goes back." },
  lapsed: { text: "LAPSED · MONTH REFUNDED", tone: "stalled", meaning: "No honoured or stalled reply before the deadline. The fee went back to the member by rule, with no model asked." },
};

/** The stamp on reply number `index` (from 0) of a request, from its stored word. */
export function stampOfReply(verdict: Verdict, index: number): StampKind {
  if (verdict === "unclear") return index + 1 >= MAX_REPLIES ? "unclear-last" : "unclear";
  return verdict;
}

export const STEPS = ["Joined", "Cancellation sent", "Reply", "Stamped", "Closed"] as const;

/**
 * How far a thread has gone: the number of steps done, from 1 (joined) to 5 (closed). A step is done
 * once everything before it is; "Reply" counts a lapse, which ends the wait for one.
 */
export function stepsDone(t: { requestStatus: RequestStatus | ""; replies: number; membershipStatus: MembershipStatus }): number {
  const done = [
    true,
    t.requestStatus !== "",
    t.replies > 0 || t.requestStatus === "lapsed",
    t.requestStatus !== "" && t.requestStatus !== "open",
    t.membershipStatus === "refunded" || t.membershipStatus === "served",
  ];
  let n = 0;
  while (n < done.length && done[n]) n++;
  return n;
}
