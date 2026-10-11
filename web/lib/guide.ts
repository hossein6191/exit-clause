// What a visitor is told whenever they wait, in five plain lines: what is happening now and who it
// waits for, how long that takes or the exact time, what is needed from them, whether they can close
// the page, and where the money is right now. The same words for every in-between state of the site:
// a wallet prompt, a transaction on its way, the validators reading a reply, the period or the reply
// window running, the other side's move, and the end of a thread.
//
// Pure, with no React: the state, the viewer's role and the clock in, the words out. The waiting panel
// (components/wait-panel.tsx) renders a guide; the rows of /mine, the provider desk and the thread
// list print the one-line form. tests/unit/guide.test.mjs runs every state for every role. Nothing
// here may promise what contracts/exit_clause.py does not do.

import { clockTime, gen, span, windowLabel } from "./format.ts";
import type { MembershipStatus, RequestStatus } from "./rules.ts";
import type { WriteFn } from "./types.ts";

/** Who is looking: the member who holds the membership, the provider of its plan, or anyone else. */
export type Role = "member" | "provider" | "visitor";

/** Whose move it is now. "done" is a closed thread: nobody's. */
export type Waiter = "you" | "provider" | "member" | "validators" | "demo" | "clock" | "anyone" | "nobody" | "done";

export type GuideTone = "busy" | "clock" | "late" | "ready" | "done";

export type Guide = {
  /** a stable name for the state, written on the panel for tests and tools */
  id: string;
  tone: GuideTone;
  waitsFor: Waiter;
  /** the small capitals above the line: who it waits for */
  kicker: string;
  /** 1. what is happening now */
  now: string;
  /** 2. how long it usually takes, or the exact time */
  time: string;
  /** 3. what is needed from the viewer right now */
  need: string;
  /** 4. whether the viewer can close the page, and where the thing stays */
  leave: string;
  canLeave: boolean;
  /** 5. where the money is right now, with the amount */
  money: string;
  /** one more sentence when the state needs it, e.g. why the demo provider could not reply */
  note?: string;
  /** seconds left on the contract's clock, for a countdown */
  left?: number;
  leftLabel?: string;
};

export const KICKERS: Record<Waiter, string> = {
  you: "Waiting for you",
  provider: "Waiting for the provider",
  member: "Waiting for the member",
  validators: "Waiting for the validators",
  demo: "Waiting for the demo provider",
  clock: "Waiting for the clock",
  anyone: "Open to anyone",
  nobody: "Nothing is waiting on you",
  done: "Closed · nothing left to do",
};

export const NOTHING_NEEDED = "Nothing is needed from you.";
export const NOTHING_LEFT = "Nothing is left to do here.";

type Lines = Omit<Guide, "kicker"> & { kicker?: string };
const make = (g: Lines): Guide => ({ ...g, kicker: g.kicker ?? KICKERS[g.waitsFor] });

/** The words that change with who is looking. */
function words(role: Role) {
  return {
    /** "you" or "the member" */
    member: role === "member" ? "you" : "the member",
    /** "your" or "the member's" */
    memberPoss: role === "member" ? "your" : "the member's",
    /** where the money of a refund lands */
    memberWallet: role === "member" ? "your wallet" : "the member",
    provider: role === "provider" ? "you" : "the provider",
  };
}

/** "You can close this page; R4 stays under My memberships" (no full stop). */
function keep(id: string, role: Role): string {
  if (role === "member") return `You can close this page; ${id} stays under My memberships`;
  if (role === "provider") return `You can close this page; ${id} stays on your Provider desk`;
  return "You can close this page and come back to this address later";
}

const ABOUT_30 = (mock?: boolean) => (mock ? "A few seconds in this demo build; about 30 seconds on Studio." : "About 30 seconds.");
const ONE_TO_TWO = (mock?: boolean) => (mock ? "A few seconds in this demo build; 1 to 2 minutes on Studio." : "Usually 1 to 2 minutes.");

// ---- the wallet prompt --------------------------------------------------------------------------------

export type SignInput = {
  fn: WriteFn;
  /** what the call does, e.g. "Joining P3 for 0.25 GEN" */
  label: string;
  feeAtto: string;
  /** the membership's held fee, for a collect */
  heldAtto?: string;
  mock?: boolean;
};

/** Where the money is while a signature is waiting: nothing has moved yet. */
function moneyBeforeSigning(fn: WriteFn, fee: string, held: string): string {
  switch (fn) {
    case "join":
      return `${fee} is still in your wallet; it leaves only when you confirm.`;
    case "cancel":
      return `Your ${fee} stays held by the contract; a cancellation sends no GEN.`;
    case "reply":
      return `The member's ${fee} stays held by the contract while the reply is judged.`;
    case "lapse":
      return `${fee} is held by the contract; the lapse sends it back to the member.`;
    case "collect":
      return `${held} is held by the contract; collecting sends it to the provider.`;
    case "close_plan":
      return "Closing sends no GEN; fees already held stay held to each period's end.";
    case "open_plan":
      return "Opening a plan sends no GEN; nothing is held until a member joins.";
  }
}

/** A transaction is waiting for the visitor's signature (in mock mode: being sent, a moment). */
export function signGuide(s: SignInput): Guide {
  const fee = gen(s.feeAtto);
  const held = gen(s.heldAtto && s.heldAtto !== "0" ? s.heldAtto : s.feeAtto);
  const money = moneyBeforeSigning(s.fn, fee, held);
  if (s.mock)
    return make({
      id: "sign",
      tone: "busy",
      waitsFor: "validators",
      kicker: "Sending",
      now: `${s.label}…`,
      time: "A moment in this demo build.",
      need: NOTHING_NEEDED,
      leave: "Stay on this page for a moment.",
      canLeave: false,
      money,
    });
  return make({
    id: "sign",
    tone: "busy",
    waitsFor: "you",
    kicker: "Your wallet",
    now: `Your wallet is asking you to confirm: ${s.label}`,
    time: "Until you confirm or reject it in the wallet.",
    need: "Confirm it in your wallet, or reject it and nothing is sent.",
    leave: "Stay on this page until you have answered the wallet; this page then follows the transaction for you.",
    canLeave: false,
    money,
  });
}

// ---- a transaction on its way, outside a thread -------------------------------------------------------

export type SendingInput = {
  fn: WriteFn;
  role: Role;
  planName: string;
  planId: string;
  /** the membership a collect is for */
  target?: string;
  feeAtto: string;
  heldAtto?: string;
  /** seconds in one period, for a join */
  period?: number;
  /** the plan's reply window, for a cancellation */
  replyWindow?: number;
  /** a demo plan: its provider replies by itself once the thread is opened */
  demo?: boolean;
  mock?: boolean;
};

/** A join, a cancellation, a collect, opening or closing a plan: sent, not final yet. */
export function sendingGuide(s: SendingInput): Guide {
  const fee = gen(s.feeAtto);
  const held = gen(s.heldAtto && s.heldAtto !== "0" ? s.heldAtto : s.feeAtto);
  const base = { tone: "busy" as const, waitsFor: "validators" as const, time: ABOUT_30(s.mock), need: NOTHING_NEEDED };
  switch (s.fn) {
    case "join":
      return make({
        ...base,
        id: "join",
        now: `Joining ${s.planName}: the validators are checking the transaction`,
        leave: "You can close this page; once it lands, the membership stays under My memberships. Stay here and it appears below by itself.",
        canLeave: true,
        money: `${fee} goes with this transaction. Once it lands the contract holds it for ${windowLabel(s.period ?? 0)}; a refused join sends all of it back in the same transaction.`,
      });
    case "cancel":
      return make({
        ...base,
        id: "cancel",
        now: "Your cancellation is being sent",
        leave: s.demo
          ? "Stay on this page: when it lands, its thread opens and asks the demo provider to reply. If you close it, the reply is asked for when you next open the thread from My memberships."
          : `You can close this page; the cancellation still lands and its thread stays under My memberships. The provider then has ${windowLabel(s.replyWindow ?? 0)} to reply. Stay here and the thread opens by itself.`,
        canLeave: !s.demo,
        money: `Your ${fee} stays held by the contract; a cancellation moves no GEN.`,
      });
    case "collect":
      return make({
        ...base,
        id: "collect",
        now: `Collecting ${s.target ? s.target + " " : ""}for the provider`,
        leave: "You can close this page; the collection lands whether or not this page is open.",
        canLeave: true,
        money: `${held} is on its way from the contract to ${s.role === "provider" ? "you" : "the provider"}.`,
      });
    case "close_plan":
      return make({
        ...base,
        id: "close_plan",
        now: `Closing ${s.planId} to new members`,
        leave: "You can close this page; the plan closes whether or not this page is open.",
        canLeave: true,
        money: "No GEN moves: memberships already running keep their held fees to their own end.",
      });
    case "open_plan":
      return make({
        ...base,
        id: "open_plan",
        now: `Opening ${s.planName || "your plan"}`,
        leave: "You can close this page; once it lands, the plan stays on your Provider desk.",
        canLeave: true,
        money: "Opening a plan sends no GEN; nothing is held until a member joins.",
      });
    default:
      return make({
        ...base,
        id: s.fn,
        now: "Your transaction is on its way",
        leave: "You can close this page; the transaction lands whether or not this page is open.",
        canLeave: true,
        money: `The ${fee} fee stays held by the contract until the transaction lands.`,
      });
  }
}

/** A final transaction whose effect is not on screen yet: a few seconds. */
export function updatingGuide(what: string): Guide {
  return make({
    id: "updating",
    tone: "busy",
    waitsFor: "nobody",
    kicker: "Final",
    now: what,
    time: "A few seconds.",
    need: NOTHING_NEEDED,
    leave: "You can close this page; the transaction is final. Stay a few seconds to see it here.",
    canLeave: true,
    money: "The transaction is final; this page shows where the money went in a moment.",
  });
}

// ---- one cancellation, on the clock ---------------------------------------------------------------------

export type DemoState = "asking" | "writing" | "late" | "failed" | "idle" | "silent" | "not-stored";

export type ThreadInput = {
  role: Role;
  /** the contract's clock, seconds */
  now: number;
  /** "R4" */
  id: string;
  /** "M7" */
  membership: string;
  status: RequestStatus;
  deadline: number;
  /** replies so far */
  replies: number;
  repliesLeft: number;
  memberStatus: MembershipStatus;
  /** the membership's period end */
  end: number;
  feeAtto: string;
  /** what the contract still holds of the membership's fee */
  heldAtto: string;
  refundedAtto: string;
  collectedAtto?: string;
  closedAt?: number;
  /** a demo plan whose demo provider is online: it replies once, by itself */
  demo?: boolean;
  /** the demo provider's side of an open thread, as this browser knows it */
  demoState?: DemoState;
  demoReason?: string;
  /** a reply of this thread is being read by the validators right now */
  judging?: "busy" | "late";
  /** a lapse or a collect of this thread is on its way */
  sending?: "lapse" | "collect";
  mock?: boolean;
};

/** The membership status a request implies when the membership itself was not read. */
export function memberStatusOf(r: { status: RequestStatus; heldAtto: string }): MembershipStatus {
  if (r.status === "open") return "cancelling";
  if (r.status === "honoured") return r.heldAtto !== "0" ? "cancelled" : "served";
  return "refunded";
}

/** Where the fee of an open request is, and where each ending sends it. */
function moneyOpen(t: ThreadInput): string {
  const fee = gen(t.feeAtto);
  const at = clockTime(t.end, t.now);
  if (t.role === "member")
    return `Your ${fee} is held by the contract. A stalled reply or a lapse sends it back to you; an honoured reply keeps it for the provider until the period ends at ${at}.`;
  if (t.role === "provider")
    return `The member's ${fee} is held by the contract. An honoured reply keeps it for you until the period ends at ${at}; a stalled reply or a lapse sends it back to the member.`;
  return `The member's ${fee} is held by the contract. An honoured reply keeps it for the provider until the period ends at ${at}; a stalled reply or a lapse sends it back to the member.`;
}

/** Where the fee is while a reply is read: the stamp decides in the same transaction. */
function moneyJudging(t: ThreadInput): string {
  const fee = gen(t.feeAtto);
  const at = clockTime(t.end, t.now);
  if (t.role === "member") return `Your ${fee} is held by the contract. Stalled: it comes back to you in the same transaction. Honoured: it stays held for the provider until ${at}.`;
  if (t.role === "provider") return `The member's ${fee} is held by the contract. Honoured: it stays held for you until ${at}. Stalled: it goes back to the member at once.`;
  return `The member's ${fee} is held by the contract. Honoured: it stays held for the provider until ${at}. Stalled: it goes back to the member at once.`;
}

/** Every state of one cancellation thread, for the member, the provider or anyone else. */
export function threadGuide(t: ThreadInput): Guide {
  const w = words(t.role);
  const fee = gen(t.feeAtto);
  const held = gen(t.heldAtto !== "0" ? t.heldAtto : t.feeAtto);
  const at = (x: number) => clockTime(x, t.now);
  const left = (x: number) => span(x - t.now);
  const stays = keep(t.id, t.role);
  const windowShut = `If no honoured or stalled reply comes, the window closes at ${at(t.deadline)} (in ${left(t.deadline)}); then Lapse sends ${fee} back to ${w.member}.`;
  const lapseLater = t.role === "visitor" ? `${stays}.` : `${stays}; if no reply comes, the Lapse button waits for you there from ${at(t.deadline)}.`;

  if (t.sending === "lapse")
    return make({
      id: "lapse",
      tone: "busy",
      waitsFor: "validators",
      now: `Lapsing ${t.id}: the fee goes back to ${w.member} by rule`,
      time: `${ABOUT_30(t.mock)} No model is asked.`,
      need: NOTHING_NEEDED,
      leave: `${stays}; the lapse lands whether or not this page is open.`,
      canLeave: true,
      money: `${fee} is on its way from the contract back to ${w.memberWallet}.`,
    });
  if (t.sending === "collect")
    return make({
      id: "collect",
      tone: "busy",
      waitsFor: "validators",
      now: `Collecting ${held} for the provider`,
      time: ABOUT_30(t.mock),
      need: NOTHING_NEEDED,
      leave: `${stays}; the collection lands whether or not this page is open.`,
      canLeave: true,
      money: `${held} is on its way from the contract to ${w.provider}.`,
    });
  if (t.judging)
    return make({
      id: t.judging === "late" ? "judging-late" : "judging",
      tone: t.judging === "late" ? "late" : "busy",
      waitsFor: "validators",
      now: t.judging === "late" ? "The validators are still reading the reply" : "The validators are reading the reply against the rule",
      time: t.judging === "late" ? "Over 3 minutes so far. Studio is slow at times; the stamp still lands here by itself." : ONE_TO_TWO(t.mock),
      need: t.judging === "late" ? `${NOTHING_NEEDED} You may ask the demo provider again; it never sends a second reply.` : NOTHING_NEEDED,
      leave: `${stays}; the stamp lands on the thread whether or not this page is open.`,
      canLeave: true,
      money: moneyJudging(t),
    });

  if (t.status === "open") {
    const replyPhase = t.now < t.deadline;
    if (replyPhase && t.demoState) {
      switch (t.demoState) {
        case "asking":
        case "writing":
          return make({
            id: "demo-writing",
            tone: "busy",
            waitsFor: "demo",
            now: "The demo provider is writing its reply",
            time: t.mock
              ? "A few seconds here; 1 to 2 minutes on Studio, where the validators read it against the rule."
              : "Usually 1 to 2 minutes: the reply is a transaction the validators read against the rule.",
            need: NOTHING_NEEDED,
            leave:
              t.demoState === "asking"
                ? "Stay a few seconds while the demo provider sends its reply; after that you can close this page."
                : `${stays}; the reply is on its way and its stamp lands on the thread whether or not this page is open.`,
            canLeave: t.demoState === "writing",
            money: moneyJudging(t),
          });
        case "late":
          return make({
            id: "demo-late",
            tone: "late",
            waitsFor: "demo",
            now: "The demo provider has not answered in 3 minutes",
            time: windowShut,
            need: "Press Ask the demo provider again; if its reply is already on the way, it does not send a second one.",
            leave: `${lapseLater}`,
            canLeave: true,
            money: moneyOpen(t),
          });
        case "failed":
          return make({
            id: "demo-failed",
            tone: "late",
            waitsFor: "you",
            kicker: "No reply yet",
            now: "The demo provider could not reply yet",
            note: t.demoReason,
            time: windowShut,
            need: "Press Ask the demo provider again.",
            leave: lapseLater,
            canLeave: true,
            money: moneyOpen(t),
          });
        case "not-stored":
          return make({
            id: "not-stored",
            tone: "late",
            waitsFor: "you",
            kicker: "Nothing stored",
            now: "The reply was not stored: the validators did not settle it, so the window is still open",
            time: windowShut,
            need: "Press Ask the demo provider again.",
            leave: lapseLater,
            canLeave: true,
            money: `Nothing moved. ${moneyOpen(t)}`,
          });
        case "idle":
          return make({
            id: "demo-idle",
            tone: "clock",
            waitsFor: "you",
            now: "Nobody has asked the demo provider to reply yet",
            time: `It replies within 1 to 2 minutes once asked. The reply window closes at ${at(t.deadline)}.`,
            need: "Press Ask the demo provider to reply.",
            leave: `${stays}. If nobody asks, the window closes at ${at(t.deadline)} and anyone may lapse it: ${fee} goes back to ${w.member}.`,
            canLeave: true,
            money: moneyOpen(t),
            left: t.deadline - t.now,
            leftLabel: "until the window closes",
          });
        case "silent":
          return make({
            id: "demo-silent",
            tone: "clock",
            waitsFor: "clock",
            kicker: "Watching the window run out",
            now: "The demo provider stays silent, as you asked",
            time: `Lapse opens at ${at(t.deadline)}, in ${left(t.deadline)}.`,
            need:
              t.role === "member"
                ? `Nothing until ${at(t.deadline)}. Then press Lapse and ${fee} comes back to you.`
                : `Nothing until ${at(t.deadline)}. Then anyone may press Lapse; the fee goes back to the member.`,
            leave: lapseLater,
            canLeave: true,
            money: moneyOpen(t),
            left: t.deadline - t.now,
            leftLabel: "until lapse opens",
          });
      }
    }
    if (replyPhase && t.replies === 0) {
      if (t.role === "provider")
        return make({
          id: "reply-due",
          tone: "clock",
          waitsFor: "you",
          now: "A member asked to cancel: your reply is due",
          time: `You have until ${at(t.deadline)} (${left(t.deadline)} left); the validators then read your reply in 1 to 2 minutes.`,
          need: "Write your reply below and press Send reply. The validators decide the stamp; a reply that simply confirms the cancellation, with no call, offer or condition, is what the rule calls honoured.",
          leave: `${stays} until ${at(t.deadline)}. Without an honoured or stalled reply by then, anyone may lapse it and the fee goes back to the member.`,
          canLeave: true,
          money: moneyOpen(t),
          left: t.deadline - t.now,
          leftLabel: "to reply",
        });
      return make({
        id: "provider-clock",
        tone: "clock",
        waitsFor: "provider",
        now: "Waiting for the provider's reply",
        time: `The provider has until ${at(t.deadline)} (${left(t.deadline)} left).`,
        need: t.role === "member" ? NOTHING_NEEDED : "Nothing; only the provider may reply.",
        leave: t.role === "member" ? `${stays}. If no honoured or stalled reply comes by ${at(t.deadline)}, the Lapse button waits for you there.` : `${stays}.`,
        canLeave: true,
        money: moneyOpen(t),
        left: t.deadline - t.now,
        leftLabel: "until lapse opens",
      });
    }
    if (replyPhase) {
      const noMore = t.demo || t.repliesLeft <= 0;
      if (noMore)
        return make({
          id: "unclear-clock",
          tone: "clock",
          waitsFor: "clock",
          kicker: "Stamped unclear",
          now: t.demo
            ? "Stamped unclear: nothing moved, and the demo provider does not reply again"
            : "Stamped unclear again: nothing moved, and the provider has no reply left",
          time: `Lapse opens at ${at(t.deadline)}, in ${left(t.deadline)}.`,
          need:
            t.role === "member"
              ? `Nothing until ${at(t.deadline)}. Then press Lapse and ${fee} comes back to you.`
              : t.role === "provider"
                ? `Nothing you can send: no reply is left. After ${at(t.deadline)} anyone may lapse it and the fee goes back to the member.`
                : `Nothing until ${at(t.deadline)}. Then anyone may press Lapse; the fee goes back to the member.`,
          leave: t.role === "member" ? `${stays}, and the Lapse button waits for you there from ${at(t.deadline)}.` : `${stays}.`,
          canLeave: true,
          money: moneyOpen(t),
          left: t.deadline - t.now,
          leftLabel: "until lapse opens",
        });
      if (t.role === "provider")
        return make({
          id: "reply-again",
          tone: "clock",
          waitsFor: "you",
          kicker: "Stamped unclear",
          now: "Your reply was stamped unclear: you may reply once more",
          time: `Until ${at(t.deadline)} (${left(t.deadline)} left).`,
          need: "Write a clearer reply below and press Send reply: confirm the cancellation, with no call, no offer and no condition.",
          leave: `${stays} until ${at(t.deadline)}. Without an honoured or stalled reply by then, anyone may lapse it and the fee goes back to the member.`,
          canLeave: true,
          money: moneyOpen(t),
          left: t.deadline - t.now,
          leftLabel: "to reply",
        });
      return make({
        id: "unclear-wait",
        tone: "clock",
        waitsFor: "provider",
        kicker: "Stamped unclear · waiting for the provider",
        now: "Stamped unclear: nothing moved, and the provider may reply once more",
        time: `Until ${at(t.deadline)} (${left(t.deadline)} left).`,
        need: t.role === "member" ? NOTHING_NEEDED : "Nothing; only the provider may reply.",
        leave: t.role === "member" ? `${stays}. If no honoured or stalled reply comes by ${at(t.deadline)}, the Lapse button waits for you there.` : `${stays}.`,
        canLeave: true,
        money: moneyOpen(t),
        left: t.deadline - t.now,
        leftLabel: "until lapse opens",
      });
    }
    // The reply window has closed with the request still open.
    return make({
      id: "lapse-ready",
      tone: "ready",
      waitsFor: t.role === "member" ? "you" : "anyone",
      now: t.replies ? "The window closed without an honoured or stalled reply" : "The window closed with no reply",
      time: "Lapse is open now, with no deadline; it takes about 30 seconds once sent.",
      need:
        t.role === "member"
          ? `Press Lapse ${t.id} and ${fee} comes back to you.`
          : t.role === "provider"
            ? `Nothing you can reply now. Anyone may press Lapse ${t.id}; the fee goes back to the member.`
            : `Anyone may press Lapse ${t.id}, you included; the fee goes back to the member, whoever sends it.`,
      leave:
        t.role === "member"
          ? `You can close this page; nothing happens until someone presses Lapse, and the button waits for you on ${t.id} under My memberships.`
          : `${stays}.`,
      canLeave: true,
      money: `${fee} is still held by the contract; Lapse sends all of it back to ${w.member}.`,
    });
  }

  if (t.status === "honoured" && t.memberStatus === "cancelled") {
    if (t.now < t.end)
      return make({
        id: "collect-clock",
        tone: "clock",
        waitsFor: "clock",
        kicker: "Honoured · waiting for the period to end",
        now:
          t.role === "member"
            ? `Honoured: your cancellation is confirmed, and the membership ends at ${at(t.end)}`
            : `Honoured: the cancellation is confirmed, and the membership ends at ${at(t.end)}`,
        time: `The period ends at ${at(t.end)}, in ${left(t.end)}.`,
        need:
          t.role === "member"
            ? NOTHING_NEEDED
            : t.role === "provider"
              ? `Nothing until ${at(t.end)}. Then press Collect (anyone may) and ${held} reaches you.`
              : `Nothing; after ${at(t.end)} anyone may press Collect, which pays the provider.`,
        leave:
          t.role === "member"
            ? `${stays}, and nothing more is needed from you there.`
            : t.role === "provider"
              ? `You can close this page; from ${at(t.end)} the Collect button waits for you here and on your Provider desk.`
              : `${stays}.`,
        canLeave: true,
        money:
          t.role === "provider"
            ? `${held} is held by the contract for you until ${at(t.end)}; Collect then sends it to you.`
            : `${held} is held by the contract for the provider until ${at(t.end)}. Then anyone may press Collect and it goes to the provider.`,
        left: t.end - t.now,
        leftLabel: "until collect opens",
      });
    return make({
      id: "collect-ready",
      tone: "ready",
      waitsFor: t.role === "provider" ? "you" : "anyone",
      now: "The period is over: the held fee can be collected for the provider",
      time: "Collect is open now, with no deadline; about 30 seconds once sent.",
      need:
        t.role === "provider"
          ? `Press Collect and ${held} reaches you.`
          : t.role === "member"
            ? `${NOTHING_NEEDED} Anyone may press Collect; it pays the provider, not you.`
            : "Anyone may press Collect, you included; it pays the provider, whoever sends it.",
      leave:
        t.role === "member"
          ? `You can close this page; this membership is done for you, and ${t.id} stays under My memberships as a record.`
          : t.role === "provider"
            ? "You can close this page; the Collect button waits for you here and on your Provider desk."
            : `${stays}.`,
      canLeave: true,
      money: `${held} is held by the contract for the provider; Collect sends it to ${w.provider}.`,
    });
  }

  // Closed: honoured and collected, stalled, or lapsed.
  const closedTime = `Closed${t.closedAt ? " at " + at(t.closedAt) : ""}; nothing more will happen on this thread.`;
  const record = t.role === "visitor" ? "You can close this page." : `${stays} as a record.`;
  if (t.status === "honoured") {
    const paid = gen(t.collectedAtto && t.collectedAtto !== "0" ? t.collectedAtto : t.feeAtto);
    return make({
      id: "closed-served",
      tone: "done",
      waitsFor: "done",
      now: "Closed: honoured, and the period's fee was collected for the provider",
      time: closedTime,
      need: NOTHING_LEFT,
      leave: record,
      canLeave: true,
      money:
        t.role === "member"
          ? `${paid} went to the provider for the period you had; nothing is held any more.`
          : t.role === "provider"
            ? `${paid} was paid to you; nothing is held any more.`
            : `${paid} went to the provider; nothing is held any more.`,
    });
  }
  const back = gen(t.refundedAtto !== "0" ? t.refundedAtto : t.feeAtto);
  const stalled = t.status === "stalled";
  return make({
    id: stalled ? "closed-stalled" : "closed-lapsed",
    tone: "done",
    waitsFor: "done",
    now: stalled
      ? "Closed: the reply stalled the cancellation, so this period's fee went back"
      : "Closed: no honoured or stalled reply came in time, so the request lapsed and the fee went back",
    time: closedTime,
    need: NOTHING_LEFT,
    leave: record,
    canLeave: true,
    money:
      t.role === "member"
        ? `${back} went back to your wallet ${stalled ? "in the same transaction as the verdict" : "by rule"}.`
        : t.role === "provider"
          ? `${back} went back to the member; nothing of this period reaches you.`
          : `${back} went back to the member.`,
  });
}

/** One line for a thread row: who it waits for, and what the viewer can do. */
export function threadLine(t: ThreadInput): string {
  const fee = gen(t.feeAtto);
  const held = gen(t.heldAtto !== "0" ? t.heldAtto : t.feeAtto);
  const at = (x: number) => clockTime(x, t.now);
  const m = t.role === "member";
  const p = t.role === "provider";
  if (t.judging) return `The validators are reading a reply · usually 1 to 2 minutes${m || p ? " · nothing to do, you can leave" : ""}`;
  if (t.status === "open") {
    if (t.now >= t.deadline)
      return m ? `Window closed · press Lapse to get ${fee} back` : `Window closed · anyone may lapse it; ${fee} goes back to the member`;
    if (t.replies === 0)
      return p ? `Waits for your reply until ${at(t.deadline)}` : m ? `Waits for the provider until ${at(t.deadline)} · nothing to do, you can leave` : `Waits for the provider until ${at(t.deadline)}`;
    if (t.repliesLeft > 0 && !t.demo)
      return p
        ? `Unclear · you may reply once more until ${at(t.deadline)}`
        : m
          ? `Unclear · the provider may reply once more until ${at(t.deadline)} · nothing to do`
          : `Unclear · the provider may reply once more until ${at(t.deadline)}`;
    return m ? `Unclear · Lapse opens at ${at(t.deadline)} and gives ${fee} back to you` : `Unclear · Lapse opens at ${at(t.deadline)}; the fee goes back to the member`;
  }
  if (t.status === "honoured" && t.memberStatus === "cancelled") {
    if (t.now < t.end)
      return m ? `Honoured · nothing to do; ${held} held for the provider until ${at(t.end)}` : p ? `Honoured · Collect opens at ${at(t.end)} and pays you ${held}` : `Honoured · ${held} held for the provider until ${at(t.end)}`;
    return m ? "Honoured · period over; Collect pays the provider, nothing for you to do" : p ? `Honoured · press Collect for ${held}` : `Honoured · anyone may collect ${held} for the provider`;
  }
  if (t.status === "honoured") {
    const paid = gen(t.collectedAtto && t.collectedAtto !== "0" ? t.collectedAtto : t.feeAtto);
    return m ? `Closed · ${paid} went to the provider · nothing left to do` : p ? `Closed · ${paid} paid to you` : `Closed · ${paid} went to the provider`;
  }
  const back = gen(t.refundedAtto !== "0" ? t.refundedAtto : t.feeAtto);
  return m ? `Closed · ${back} came back to you · nothing left to do` : `Closed · ${back} went back to the member`;
}

// ---- the visitor's own membership, on a plan's page ----------------------------------------------------

export type MembershipInput = {
  now: number;
  /** "M7" */
  id: string;
  status: MembershipStatus;
  end: number;
  feeAtto: string;
  heldAtto: string;
  refundedAtto: string;
  collectedAtto: string;
  /** its cancellation, "" until one is sent */
  request: string;
  /** the cancellation's reply deadline, when it was read */
  deadline?: number;
  demo?: boolean;
};

/** The member's own membership: live, cancelling, honoured, over, or closed. */
export function membershipGuide(m: MembershipInput): Guide {
  const fee = gen(m.feeAtto);
  const held = gen(m.heldAtto !== "0" ? m.heldAtto : m.feeAtto);
  const at = (x: number) => clockTime(x, m.now);
  const left = (x: number) => span(x - m.now);
  const stays = keep(m.id, "member");
  if (m.status === "live" && m.now < m.end)
    return make({
      id: "live",
      tone: "clock",
      waitsFor: "nobody",
      now: `Your membership ${m.id} is live`,
      time: `The period ends at ${at(m.end)}, in ${left(m.end)}.`,
      need: `${NOTHING_NEEDED} To leave the plan, send a cancellation below before ${at(m.end)}.`,
      leave: `${stays}.`,
      canLeave: true,
      money: `Your ${fee} is held by the contract until ${at(m.end)}. With no cancellation it can then be collected for the provider; a stalled or unanswered cancellation sends it back to you.`,
      left: m.end - m.now,
      leftLabel: "left in the period",
    });
  if (m.status === "cancelling")
    return make({
      id: "cancelling",
      tone: "clock",
      waitsFor: "provider",
      now: m.request ? `Your cancellation ${m.request} is open` : "Your cancellation is open",
      time: m.deadline ? `The provider has until ${at(m.deadline)} (${left(m.deadline)} left) to reply.` : "The provider's reply window runs on the cancellation's thread.",
      need: m.demo
        ? `${NOTHING_NEEDED} Open ${m.request} to follow it; the demo provider replies once its thread has been opened.`
        : `${NOTHING_NEEDED} Open ${m.request} to follow it.`,
      leave: `You can close this page; ${m.request || m.id} stays under My memberships.`,
      canLeave: true,
      money: `Your ${fee} is held by the contract until the cancellation closes: a stalled reply or a lapse sends it back to you, an honoured one keeps it for the provider.`,
      left: m.deadline ? m.deadline - m.now : undefined,
      leftLabel: m.deadline ? "until lapse opens" : undefined,
    });
  if (m.status === "cancelled" || m.status === "live") {
    if (m.status === "cancelled" && m.now < m.end)
      return threadGuide({
        role: "member",
        now: m.now,
        id: m.request || m.id,
        membership: m.id,
        status: "honoured",
        deadline: 0,
        replies: 1,
        repliesLeft: 0,
        memberStatus: "cancelled",
        end: m.end,
        feeAtto: m.feeAtto,
        heldAtto: m.heldAtto,
        refundedAtto: m.refundedAtto,
      });
    return make({
      id: "collect-ready",
      tone: "ready",
      waitsFor: "anyone",
      now: m.status === "cancelled" ? "Honoured, and the period is over: the held fee can be collected for the provider" : `The period of ${m.id} is over`,
      time: "Collect is open now, with no deadline; about 30 seconds once sent.",
      need: `${NOTHING_NEEDED} Anyone may press Collect below; it pays the provider, not you.`,
      leave: `You can close this page; this membership is done for you, and ${m.id} stays under My memberships as a record.`,
      canLeave: true,
      money: `${held} is held by the contract for the provider; Collect sends it to the provider.`,
    });
  }
  if (m.status === "refunded")
    return make({
      id: "closed-refunded",
      tone: "done",
      waitsFor: "done",
      now: `${m.id} is closed: its fee went back to you`,
      time: "Closed; nothing more will happen to this membership.",
      need: `${NOTHING_LEFT} You may join this plan again above.`,
      leave: `${stays} as a record.`,
      canLeave: true,
      money: `${gen(m.refundedAtto !== "0" ? m.refundedAtto : m.feeAtto)} went back to your wallet.`,
    });
  return make({
    id: "closed-served",
    tone: "done",
    waitsFor: "done",
    now: `${m.id} is closed: the period ran its course`,
    time: "Closed; nothing more will happen to this membership.",
    need: `${NOTHING_LEFT} You may join this plan again above.`,
    leave: `${stays} as a record.`,
    canLeave: true,
    money: `${gen(m.collectedAtto !== "0" ? m.collectedAtto : m.feeAtto)} went to the provider for the period.`,
  });
}

/** One line for a membership row on /mine. */
export function membershipLine(m: MembershipInput): string {
  const fee = gen(m.feeAtto);
  const held = gen(m.heldAtto !== "0" ? m.heldAtto : m.feeAtto);
  const at = (x: number) => clockTime(x, m.now);
  if (m.status === "live" && m.now < m.end) return `Live until ${at(m.end)} · nothing to do; ${fee} held until then`;
  if (m.status === "cancelling")
    return m.deadline ? `Cancellation ${m.request} open · waits for the provider until ${at(m.deadline)}` : `Cancellation ${m.request} open · waits for the provider's reply`;
  if (m.status === "cancelled" && m.now < m.end) return `Honoured · nothing to do; ${held} held for the provider until ${at(m.end)}`;
  if (m.status === "cancelled" || m.status === "live") return `Period over · anyone may collect ${held} for the provider; nothing for you to do`;
  if (m.status === "refunded") return `Closed · ${gen(m.refundedAtto !== "0" ? m.refundedAtto : m.feeAtto)} came back to you`;
  return `Closed · ${gen(m.collectedAtto !== "0" ? m.collectedAtto : m.feeAtto)} went to the provider`;
}

// ---- the provider desk -----------------------------------------------------------------------------------

export type DeskInput = {
  now: number;
  /** plans this address runs */
  plans: number;
  /** open cancellations the provider may still reply to: ids and deadlines */
  due: { id: string; deadline: number }[];
  /** open cancellations whose reply this browser sent and the validators are reading */
  judging: string[];
  /** served periods ready to collect: how many, and their held fees together */
  collectable: number;
  collectableAtto: string;
  /** every fee the provider's plans hold now, together */
  heldAtto: string;
  /** memberships still running across the plans */
  live: number;
  mock?: boolean;
};

/** What the provider desk is waiting for, or null when the address runs no plan. */
export function deskGuide(d: DeskInput): Guide | null {
  if (d.plans <= 0) return null;
  const at = (x: number) => clockTime(x, d.now);
  const held = gen(d.heldAtto);
  const n = d.due.length;
  if (d.judging.length)
    return make({
      id: "desk-judging",
      tone: "busy",
      waitsFor: "validators",
      now: `The validators are reading your reply to ${d.judging.join(", ")}`,
      time: ONE_TO_TWO(d.mock),
      need: n ? `${NOTHING_NEEDED} ${n} other cancellation${n === 1 ? "" : "s"} still wait${n === 1 ? "s" : ""} for your reply below.` : NOTHING_NEEDED,
      leave: "You can close this page; the stamp lands on the thread whether or not this page is open.",
      canLeave: true,
      money: "The member's fee stays held by the contract until the stamp: honoured keeps it for you to the period's end, stalled sends it back to the member.",
    });
  if (n) {
    const first = d.due.reduce((a, b) => (b.deadline < a.deadline ? b : a));
    return make({
      id: "desk-replies",
      tone: "clock",
      waitsFor: "you",
      now: `${n} cancellation${n === 1 ? " waits" : "s wait"} for your reply`,
      time: `The first deadline is ${at(first.deadline)} (${span(first.deadline - d.now)} left), on ${first.id}.`,
      need: "Open each one below and send your reply on its thread.",
      leave: "You can close this page; each one stays on this desk until its deadline. Without an honoured or stalled reply by then, anyone may lapse it and the fee goes back to the member.",
      canLeave: true,
      money: `${held} of your members' fees is held by the contract.`,
      left: first.deadline - d.now,
      leftLabel: "to the first deadline",
    });
  }
  if (d.collectable)
    return make({
      id: "desk-collect",
      tone: "ready",
      waitsFor: "you",
      now: `${d.collectable} served period${d.collectable === 1 ? " is" : "s are"} ready to collect`,
      time: "Collect is open now, with no deadline; about 30 seconds per transaction.",
      need: "Press Collect on each one below.",
      leave: "You can close this page; the fees stay held for you until someone presses Collect. Anyone may, and it always pays you.",
      canLeave: true,
      money: `${gen(d.collectableAtto)} is held by the contract for you, ready to collect.`,
    });
  return make({
    id: "desk-quiet",
    tone: "clock",
    waitsFor: "nobody",
    now: "No cancellation is waiting for your reply",
    time: d.live ? `${d.live} membership${d.live === 1 ? " is" : "s are"} running; each fee becomes collectable when its period ends.` : "Nothing runs on the clock for you right now.",
    need: NOTHING_NEEDED,
    leave: "You can close this page; a new cancellation appears on this desk with its reply deadline.",
    canLeave: true,
    money:
      d.heldAtto !== "0"
        ? `${held} of your members' fees is held by the contract; each reaches you through Collect after its period ends, unless a reply stalls or a request lapses.`
        : "Nothing is held for your plans right now.",
  });
}
