"use client";

// One cancellation as a thread. The member's message, every provider reply with the stamp the network
// put on it, the reply deadline counting down, the fee the contract still holds, and the step line
// that moves by itself. Right under the step line, one waiting panel says what the thread is waiting
// for now (the demo provider writing, the validators reading, the clock), how long that usually
// takes and whether to stay; when the wait is over it holds the next button (lapse, collect). On a
// demo plan the demo provider is asked to reply as soon as the member's cancellation has landed.

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { Addr } from "@/components/addr";
import { DeadlineChip, HeldChip, Pill } from "@/components/chips";
import { DemoNote } from "@/components/demo-status";
import { IconCollect, IconHourglass, IconRefresh, IconReply } from "@/components/icons";
import { ListHead, ReadingBody, Split } from "@/components/panes";
import { Placeholder, ReadError } from "@/components/read-state";
import { Section } from "@/components/section";
import { Suggest } from "@/components/suggest";
import { StampTag } from "@/components/stamp";
import { StepLine, Thread, Time, moneyLine } from "@/components/thread";
import { ThreadList } from "@/components/thread-list";
import { ToolButton } from "@/components/tool-button";
import { TxList } from "@/components/tx-list";
import { TxRail } from "@/components/tx-rail";
import { WalletGate } from "@/components/wallet-gate";
import { useDemoStatus } from "@/components/use-demo";
import { useLocal } from "@/components/use-local";
import { useMe } from "@/components/use-me";
import { useNow, useWallNow } from "@/components/use-now";
import { useRead } from "@/components/use-read";
import { useTx } from "@/components/use-tx";
import { WaitPanel, type Wait } from "@/components/wait-panel";
import { calls, isJudged, isMock, membershipPhaseNow, readMembership, readRequest, replyOutcome, requestDemoReply, requestPhaseNow, succeeded, txUrl } from "@/lib/chain";
import { demoPlanByName, isDemoPlan } from "@/lib/demo-plans";
import { clockTime, gen, span, windowLabel } from "@/lib/format";
import { MAX_REPLY, STAMPS, parseRequestId, plain, replyProblem, stampOfReply, stepsDone, type MembershipStatus } from "@/lib/rules";
import { REPLY_CHIPS } from "@/lib/suggestions";
import { DEMO_REPLY_LABEL, demoAsked, demoAskedAt, demoSkipped, parseRemembered, rememberTx, rememberedRaw, setDemoAsked } from "@/lib/tx-memory";
import type { Call, Request, TxStatus } from "@/lib/types";

export default function RequestPage() {
  const params = useParams<{ id: string }>();
  const id = parseRequestId(String(params?.id ?? ""));
  return (
    <Split
      listLabel="Threads"
      show="reading"
      back={{ href: "/mine", label: "My memberships" }}
      list={
        <>
          <ListHead title="Threads" hint="Cancellations and the stamps on their replies." />
          <ThreadList selected={id} />
        </>
      }
      reading={
        id ? (
          <RequestView key={id} id={id} />
        ) : (
          <ReadingBody>
            <h1 className="text-xl">That is not a request id</h1>
            <p className="mt-2 text-ink-2">
              Request ids look like R4.{" "}
              <Link href="/mine" className="link">
                See your threads
              </Link>
              .
            </p>
          </ReadingBody>
        )
      }
    />
  );
}

/** While anything can still change, the thread is read again every 25 s, past the cache. */
const POLL_MS = isMock ? 4000 : 25_000;

function RequestView({ id }: { id: string }) {
  const fresh = React.useRef(false);
  const read = useRead(() => readRequest(id, { fresh: fresh.current }), [id]);
  const req = read.data;
  const memRead = useRead(() => readMembership(req?.membership ?? "", { fresh: fresh.current }), ["req-mem", req?.membership ?? ""], { enabled: !!req?.membership });
  const mem = memRead.data;
  const live = !!req && (req.status === "open" || (mem ? mem.status === "cancelled" : false));
  const refreshRef = React.useRef<() => Promise<void>>(async () => {});
  React.useEffect(() => {
    refreshRef.current = async () => {
      fresh.current = true;
      try {
        await read.refresh();
        await memRead.refresh();
      } finally {
        fresh.current = false;
      }
    };
  });
  React.useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => void refreshRef.current(), POLL_MS);
    return () => clearInterval(timer);
  }, [live]);

  // How many stamps were on screen at the first read: later ones land with the stamp-in motion.
  const [firstStamps, setFirstStamps] = React.useState<number | null>(null);
  if (req && firstStamps === null) setFirstStamps(req.replies.length + (req.status === "lapsed" ? 1 : 0));

  if (read.error)
    return (
      <ReadingBody>
        <ReadError detail={read.error} onRetry={read.retry} />
      </ReadingBody>
    );
  if (!req && read.loading)
    return (
      <ReadingBody>
        <Placeholder lines={8} />
      </ReadingBody>
    );
  if (!req)
    return (
      <ReadingBody>
        <h1 className="text-xl">There is no request {id}</h1>
        <p className="mt-2 text-ink-2">The contract holds no cancellation by that id yet.</p>
      </ReadingBody>
    );
  return <RequestBody req={req} memStatus={mem?.status} memEnd={mem?.end ?? req.end} memHeld={mem?.heldAtto ?? req.heldAtto} freshFrom={firstStamps ?? Infinity} refresh={() => refreshRef.current()} />;
}

/** How long the demo provider may take before the page says so and offers to ask it again. */
const DEMO_LATE_S = 180;

function RequestBody({
  req,
  memStatus,
  memEnd,
  memHeld,
  freshFrom,
  refresh,
}: {
  req: Request;
  memStatus: MembershipStatus | undefined;
  memEnd: number;
  memHeld: string;
  freshFrom: number;
  refresh: () => Promise<void>;
}) {
  const me = useMe();
  const now = useNow();
  const wall = useWallNow();
  const demo = useDemoStatus();
  const clock = now || req.now;
  const phase = requestPhaseNow(req, clock);
  const isProvider = !!me.address && me.address === req.provider;
  const isMember = !!me.address && me.address === req.member;
  const story = demoPlanByName(req.planName);
  const demoPlan = !!demo?.provider && isDemoPlan({ name: req.planName, provider: req.provider }, demo.provider);
  // With the demo provider offline its address may be unknown: a plan bearing a demo plan's name still says why nobody replies.
  const showDemo = demoPlan || (!!demo && !demo.online && !!story);
  const memberStatus = memStatus ?? (req.status === "open" ? "cancelling" : req.status === "honoured" ? "cancelled" : "refunded");
  const memPhase = membershipPhaseNow({ status: memberStatus, end: memEnd }, clock);
  const done = stepsDone({ requestStatus: req.status, replies: req.replies.length, membershipStatus: memberStatus });

  const [text, setText] = React.useState("");
  const plainText = plain(text);
  const textProblem = text ? replyProblem(plainText) : "";

  const tx = useTx((s: TxStatus, hash: string, call: Call) => {
    rememberTx(req.id, hash, labelOf(call, req));
    void refresh();
  });
  const { track } = tx;
  // The call being signed (tx.call is set only once there is a hash) and when the wait for it began.
  const [pending, setPending] = React.useState<Call | null>(null);
  const [txSince, setTxSince] = React.useState(0);
  // How many replies the thread had when a provider's own reply went out: the next one is that reply.
  const [replyBase, setReplyBase] = React.useState(0);
  const act = (call: Call) => {
    setPending(call);
    setTxSince(Math.floor(Date.now() / 1000));
    if (call.fn === "reply") setReplyBase(req.replies.length);
    void tx.start(call);
  };

  // ---- the demo provider, asked once the member's cancellation is here ----
  const demoText = story?.reply ?? "";
  const skipped = useLocal(() => demoSkipped(req.id), false);
  const askedBefore = useLocal(() => demoAsked(req.id), false);
  const askedAt = useLocal(() => demoAskedAt(req.id), 0);
  const remembered = useLocal(() => rememberedRaw(req.id), "");
  // The demo provider's reply this browser already asked for, so a reload follows it again.
  const demoHash = React.useMemo(
    () => parseRemembered(remembered).find((r) => r.label === DEMO_REPLY_LABEL || r.label === `The demo provider replies to ${req.id}`) ?? null,
    [remembered, req.id],
  );
  const [ask, setAsk] = React.useState<{ state: "idle" | "asking" | "sent" | "failed"; reason: string }>({ state: "idle", reason: "" });
  const askDemo = React.useCallback(async () => {
    setAsk({ state: "asking", reason: "" });
    setDemoAsked(req.id);
    const answer = await requestDemoReply(req.id);
    if (answer.ok) {
      setAsk({ state: "sent", reason: "" });
      rememberTx(req.id, answer.hash, DEMO_REPLY_LABEL);
      track(answer.hash, calls.reply(req.id, demoText));
    } else setAsk({ state: "failed", reason: answer.reason });
  }, [req.id, demoText, track]);
  const demoCanReply = demoPlan && !!demo?.online && req.status === "open" && req.replies.length === 0 && phase === "reply";
  const autoAsk = demoCanReply && (isMember || isMock) && !skipped && !askedBefore && ask.state === "idle" && !tx.hash;
  const asked = React.useRef(false);
  React.useEffect(() => {
    if (!autoAsk || asked.current) return;
    asked.current = true;
    void askDemo();
  }, [autoAsk, askDemo]);
  const resumed = React.useRef(false);
  React.useEffect(() => {
    if (resumed.current || !demoHash || !demoPlan || tx.hash || tx.sending || req.status !== "open" || req.replies.length > 0) return;
    resumed.current = true;
    track(demoHash.hash, calls.reply(req.id, demoText));
  }, [demoHash, demoPlan, tx.hash, tx.sending, req.status, req.replies.length, req.id, demoText, track]);

  const lastStamp = req.status === "lapsed" ? "lapsed" : req.replies.length ? stampOfReply(req.replies[req.replies.length - 1].verdict, req.replies.length - 1) : null;
  const outcome = tx.final && tx.call?.fn === "reply" ? replyOutcome(tx.final) : null;

  // ---- what the thread is waiting for right now, in one panel at the top ----
  const fee = gen(req.feeAtto);
  const toWhom = isMember ? "to you" : "to the member";
  const at = (t: number) => clockTime(t, clock);
  // Seconds since the cancellation landed, as a browser-clock instant (the demo clock may have been moved on).
  const sinceSent = wall && clock ? wall - Math.max(0, clock - req.sentAt) : 0;
  const demoSince = askedAt || demoHash?.at || sinceSent;
  const demoLate = !!wall && !!demoSince && wall - demoSince >= DEMO_LATE_S;
  const isDemoReply = (c: Call | null) => !!c && c.fn === "reply" && !!demoText && c.args[1] === demoText;
  const fallback = (
    <>
      If no honoured or stalled reply comes, the reply window closes at <strong className="text-ink">{at(req.deadline)}</strong>, in {span(req.deadline - clock)}; then you can
      lapse the request and {fee} goes back {toWhom}.
    </>
  );
  const askButton = (label: string) => (
    <ToolButton size="sm" variant="ink" icon={<IconRefresh size={14} />} disabled={ask.state === "asking"} onClick={() => void askDemo()}>
      {label}
    </ToolButton>
  );
  const lapseButton = (
    <WalletGate what="to lapse it">
      <ToolButton variant="ink" icon={<IconHourglass />} disabled={tx.sending} onClick={() => act(calls.lapse(req.id))}>
        Lapse {req.id}: the fee goes back
      </ToolButton>
    </WalletGate>
  );
  const collectButton = (
    <WalletGate what="to collect">
      <ToolButton variant="ink" icon={<IconCollect />} disabled={tx.sending} onClick={() => act(calls.collect(req.membership))}>
        Collect {gen(memHeld)} for the provider
      </ToolButton>
    </WalletGate>
  );
  const stayClock = "Stay here and the next button appears by itself, or come back later.";
  const demoWaiting = demoPlan && !!demo?.online && req.status === "open" && req.replies.length === 0 && phase === "reply";
  const callNow = tx.error ? null : (tx.call ?? (tx.sending ? pending : null));
  // The thread already shows what the call did (the network applies it before it is final): from then
  // on the panel follows the thread, and the rail below keeps following the transaction.
  const landed = (c: Call): boolean =>
    c.fn === "reply"
      ? req.status !== "open" || req.replies.length > (isDemoReply(c) ? 0 : replyBase)
      : c.fn === "lapse"
        ? req.status !== "open"
        : c.fn === "collect"
          ? memberStatus !== "cancelled"
          : true;

  let wait: Wait | null = null;
  if (tx.sending && !tx.hash && callNow) {
    wait = {
      id: "sign",
      tone: "busy",
      kicker: isMock ? "Sending" : "Your wallet",
      title: isMock ? `${labelOf(callNow, req)}…` : "Confirm the transaction in your wallet",
      body: isMock ? undefined : `${labelOf(callNow, req)}. Nothing is sent until you confirm it there.`,
      since: txSince,
    };
  } else if (tx.hash && tx.call && !tx.final && !landed(tx.call)) {
    const c = tx.call;
    if (c.fn === "reply") {
      const demoReply = isDemoReply(c);
      const since = demoReply ? demoSince : txSince;
      const link = { href: txUrl(tx.hash), label: isMock ? "The demo transaction" : "Follow it on the explorer" };
      wait =
        demoReply && demoLate
          ? {
              id: "judging-late",
              tone: "late",
              title: "The validators are still reading the reply",
              body: (
                <>
                  <p>
                    It has been over 3 minutes. Studio is slow at times; the stamp still lands here by itself when they finish. You can also ask the demo provider again: if its reply
                    is already on the way, it does not send a second one.
                  </p>
                  <p className="mt-1.5">{fallback}</p>
                </>
              ),
              since,
              link,
              action: askButton("Ask the demo provider again"),
            }
          : {
              id: "judging",
              tone: "busy",
              title: "The validators are reading the reply",
              body: "Each validator asks its own model whether the reply honours or stalls the cancellation under the rule, in two framings and two orders. Then the contract stamps it, and a stall sends the fee back in the same transaction.",
              expect: isMock ? "a few seconds in this demo build, 1 to 2 minutes on Studio" : "1 to 2 minutes",
              since,
              stay: "Stay on this page; the stamp appears here by itself.",
              link,
            };
    } else {
      wait = {
        id: c.fn,
        tone: "busy",
        title: c.fn === "lapse" ? `Lapsing ${req.id}` : `Collecting ${gen(memHeld)} for the provider`,
        body:
          c.fn === "lapse"
            ? `One transaction. The contract sends ${fee} back to the member by rule; no model is asked.`
            : "One transaction. The held fee leaves the contract for the provider and the membership is served.",
        expect: "about 30 seconds",
        since: txSince,
        stay: "Stay on this page; the thread updates by itself.",
      };
    }
  } else if (tx.final && tx.call && !tx.error && !landed(tx.call)) {
    // Final, but the thread on screen does not show it yet, or nothing was stored.
    const c = tx.call;
    if (c.fn === "reply") {
      if (outcome) wait = { id: "stamping", tone: "busy", title: `Stamped ${outcome.verdict}. Putting it on the thread…` };
      else if (isDemoReply(c))
        wait = {
          id: "not-stored",
          tone: "late",
          kicker: "Nothing stored",
          title: "The reply was not stored",
          body: (
            <>
              <p>The validators did not settle it, so nothing changed and the reply window is still open. Ask the demo provider again.</p>
              <p className="mt-1.5">{fallback}</p>
            </>
          ),
          action: askButton("Ask the demo provider again"),
        };
    } else if (succeeded(tx.final)) {
      wait = { id: "updating", tone: "busy", title: "Final. Updating the thread…" };
    }
  }
  if (!wait && demoWaiting && (!skipped || ask.state !== "idle")) {
    if (ask.state === "failed")
      wait = {
        id: "demo-failed",
        tone: "late",
        kicker: "No reply yet",
        title: "The demo provider could not reply yet",
        body: (
          <>
            <p>{ask.reason}</p>
            <p className="mt-1.5">{fallback}</p>
          </>
        ),
        action: askButton("Ask the demo provider again"),
      };
    else if (ask.state !== "idle" || autoAsk || askedBefore)
      wait = demoLate
        ? {
            id: "demo-late",
            tone: "late",
            title: "The demo provider has not answered in 3 minutes",
            body: (
              <>
                <p>Studio may be busy, or the reply did not go through. Ask it again: if a reply is already on its way, it does not send a second one.</p>
                <p className="mt-1.5">{fallback}</p>
              </>
            ),
            since: demoSince,
            action: askButton("Ask the demo provider again"),
          }
        : {
            id: "demo-writing",
            tone: "busy",
            title: "The demo provider is writing its reply",
            body: isMock
              ? "In this demo build it takes a few seconds. On Studio it takes 1 to 2 minutes: the reply is a transaction and the validators read it against the rule."
              : "This takes 1 to 2 minutes: the reply is a transaction and the validators read it against the rule.",
            expect: isMock ? "a few seconds here, 1 to 2 minutes on Studio" : "1 to 2 minutes",
            since: demoSince,
            stay: "Stay on this page; the stamp appears here by itself.",
          };
    else
      wait = {
        id: "demo-idle",
        tone: "clock",
        kicker: "Waiting for the demo provider",
        title: "Nobody has asked the demo provider to reply yet",
        body: "It replies once to each cancellation on this plan, as soon as it is asked. The member's own page asks by itself; you can ask from here too.",
        left: req.deadline - clock,
        leftLabel: "until the window closes",
        action: askButton("Ask the demo provider to reply"),
      };
  }
  if (!wait && demoWaiting && skipped)
    wait = {
      id: "demo-silent",
      tone: "clock",
      kicker: "Watching the window run out",
      title: "The demo provider stays silent, as you asked",
      body: (
        <>
          When the reply window closes at <strong className="text-ink">{at(req.deadline)}</strong>, lapse the request and {fee} goes back {toWhom} by rule. No model is asked.
        </>
      ),
      left: req.deadline - clock,
      leftLabel: "until lapse opens",
      stay: stayClock,
      action: askButton("Ask it to reply after all"),
    };
  if (!wait && req.status === "open" && phase === "reply" && req.replies.length === 0 && !isProvider)
    wait = {
      id: "provider-clock",
      tone: "clock",
      kicker: "Waiting for the provider",
      title: "Waiting for the provider's reply",
      body: (
        <>
          The provider has until <strong className="text-ink">{at(req.deadline)}</strong>. A reply that stalls sends the fee back at once; with no honoured or stalled reply by
          then, anyone may lapse the request and {fee} goes back {toWhom}.
        </>
      ),
      left: req.deadline - clock,
      leftLabel: "until lapse opens",
      stay: req.deadline - clock <= 3600 ? stayClock : undefined,
    };
  if (!wait && req.status === "open" && phase === "reply" && req.replies.length > 0 && (!isProvider || req.repliesLeft === 0))
    wait = {
      id: "unclear-clock",
      tone: "clock",
      kicker: "Stamped unclear",
      title: demoPlan || req.repliesLeft === 0 ? "Nothing moved. Lapse opens when the window closes" : "Nothing moved. The provider may reply once more",
      body: demoPlan ? (
        <>
          The demo provider does not reply again. When the window closes at <strong className="text-ink">{at(req.deadline)}</strong>, lapse the request and {fee} comes back{" "}
          {toWhom}.
        </>
      ) : req.repliesLeft > 0 ? (
        <>
          The provider may reply once more before <strong className="text-ink">{at(req.deadline)}</strong>. With no honoured or stalled reply by then, anyone may lapse the request
          and {fee} goes back {toWhom}.
        </>
      ) : (
        <>
          Both replies were unclear, so the provider has no third. When the window closes at <strong className="text-ink">{at(req.deadline)}</strong>, lapse the request and {fee}{" "}
          goes back {toWhom}.
        </>
      ),
      left: req.deadline - clock,
      leftLabel: "until lapse opens",
      stay: req.deadline - clock <= 3600 ? stayClock : undefined,
    };
  if (!wait && req.status === "open" && phase === "lapse")
    wait = {
      id: "lapse-ready",
      tone: "ready",
      kicker: "Lapse is open",
      title: req.replies.length ? "The window closed without an honoured or stalled reply" : "The window closed with no reply",
      body: `Lapse the request and ${fee} goes back to the member by rule; no model is asked. Anyone may send it.`,
      action: lapseButton,
    };
  if (!wait && memberStatus === "cancelled" && memPhase === "cancelled")
    wait = {
      id: "collect-clock",
      tone: "clock",
      kicker: "Honoured · waiting for the period",
      title: "Honoured. Collect opens when the period ends",
      body: (
        <>
          The fee stays held for the provider until <strong className="text-ink">{at(memEnd)}</strong>. Then anyone may collect it for the provider, and the thread closes.
        </>
      ),
      left: memEnd - clock,
      leftLabel: "until collect opens",
      stay: memEnd - clock <= 3600 ? stayClock : undefined,
    };
  if (!wait && memberStatus === "cancelled" && memPhase === "due")
    wait = {
      id: "collect-ready",
      tone: "ready",
      kicker: "Collect is open",
      title: "The period is over",
      body: `Collect the held ${gen(memHeld)}: it goes to the provider whoever sends it, and the thread closes.`,
      action: collectButton,
    };

  return (
    <ReadingBody>
      <p className="mono text-xs text-ink-3">
        {req.id} · {req.membership} ·{" "}
        <Link href={`/plan/${req.plan}`} className="link">
          {req.plan}
        </Link>
      </p>
      <h1 className="mt-1 text-xl sm:text-2xl">Cancellation · {req.planName}</h1>
      <StepLine done={done} busy={!!wait && wait.tone !== "ready"} className="mt-4" />

      {(wait || tx.hash || tx.error) && (
        <div className="mt-4 flex flex-col gap-2">
          {wait && <WaitPanel wait={wait} />}
          {tx.hash && tx.call && <TxRail hash={tx.hash} label={labelOf(tx.call, req)} judged={isJudged(tx.call.fn)} onDone={tx.onDone} />}
          {tx.error && (
            <p role="alert" className="text-sm text-postal-ink">
              {tx.error}
            </p>
          )}
          {outcome && (
            <p className="text-sm">
              Stamped <strong>{outcome.verdict}</strong>.{" "}
              {outcome.refundedAtto !== "0" ? `${gen(outcome.refundedAtto)} went back to the member in the same transaction.` : "Nothing moved."}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-[8px] border border-line-soft bg-frame/40 px-3 py-2 text-[13px]">
        <span className="field-label">From</span>
        <span>
          the member <Addr address={req.member} me={me.address} />
        </span>
        <span className="field-label">To</span>
        <span>
          the provider <Addr address={req.provider} me={me.address} />
        </span>
        <span className="field-label">Sent</span>
        <Time at={req.sentAt} className="text-[13px] text-ink" />
        <span className="field-label">Deadline</span>
        <span>
          <Time at={req.deadline} className="text-[13px] text-ink" />
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {req.status === "open" && <DeadlineChip deadline={req.deadline} />}
        <HeldChip heldAtto={memHeld} until={memEnd} />
        {req.status === "open" && <Pill tone="postal">{req.repliesLeft} {req.repliesLeft === 1 ? "reply" : "replies"} left</Pill>}
      </div>

      <Section title="The thread" hint="Each reply is read by the network against the rule in the same transaction, and stamped." className="mt-5">
        <Thread t={req} me={me.address} freshFrom={freshFrom} />
        {req.status === "open" && req.replies.length === 0 && (
          <p className="mt-4 text-[13.5px] text-ink-3">
            No reply yet. The provider has until <Time at={req.deadline} className="text-[13.5px]" /> to answer.
          </p>
        )}
        {lastStamp && <p className="mt-6 text-[13.5px] text-ink-2">{STAMPS[lastStamp].meaning}</p>}
        <p className="mt-2 text-[13.5px] text-ink-2">{moneyLine(req, memberStatus)}</p>
      </Section>

      {showDemo && (
        <Section title="The demo provider" hint="This plan belongs to the site's demo provider, which answers cancellations by itself.">
          <DemoNote
            online={
              req.replies.length
                ? "It has answered this cancellation; it answers each one once."
                : "It answers each cancellation on this plan once, by itself. Its reply is a transaction the validators judge, so the stamp lands 1 to 2 minutes after it is asked."
            }
          />
          {story && (
            <p className="mt-2 text-[13.5px] text-ink-2">
              On this plan it {story.habit}; expect <StampTag kind={story.expect} className="align-[1px]" />. {story.why}
            </p>
          )}
        </Section>
      )}

      <Section title="What you can do here" hint="Who may act depends on who you are and on the clock; the contract checks both.">
        <div className="flex flex-col gap-4">
          {isProvider && req.status === "open" && phase === "reply" && req.repliesLeft > 0 && (
            <div>
              <h3 className="text-[14px]">Reply as the provider</h3>
              <p className="mt-0.5 text-[13px] text-ink-3">The network reads your reply against the rule in this same transaction. A stall sends the fee back at once.</p>
              <div className="mt-2 rounded-[8px] border border-line">
                <label htmlFor="reply-text" className="sr-only">
                  Your reply
                </label>
                <textarea
                  id="reply-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={4}
                  placeholder="Write the reply, or pick one below."
                  aria-invalid={!!textProblem}
                  aria-describedby="reply-help"
                  className="block min-h-[96px] w-full resize-y rounded-t-[8px] border-0 bg-pane px-3 py-2 text-[14.5px] leading-relaxed focus-visible:outline-2 focus-visible:-outline-offset-2"
                />
                <div className="border-t border-line-soft px-3 py-2.5">
                  <Suggest label="Suggested replies" chips={REPLY_CHIPS} onPick={setText} isOn={(v) => v === text} />
                  <p id="reply-help" className="mt-2 text-xs text-ink-3">
                    <span className="mono">{[...plainText].length}</span> / {MAX_REPLY} characters, at least 20, printable ASCII on one line.
                    {textProblem && <span className="text-postal-ink"> {textProblem.charAt(0).toUpperCase() + textProblem.slice(1)}.</span>}
                  </p>
                  <div className="mt-3 flex justify-end">
                    <WalletGate what="to reply">
                      <ToolButton variant="ink" icon={<IconReply />} disabled={tx.sending || !plainText || !!replyProblem(plainText)} onClick={() => act(calls.reply(req.id, plainText))}>
                        Send reply
                      </ToolButton>
                    </WalletGate>
                  </div>
                </div>
              </div>
            </div>
          )}
          {req.status === "open" && phase === "lapse" && (
            <p className="text-sm text-ink-2">The reply window has closed. Anyone may lapse the request: the button is at the top of this thread.</p>
          )}
          {memPhase === "due" && memberStatus === "cancelled" && (
            <p className="text-sm text-ink-2">The honoured period is over. Anyone may collect its fee for the provider: the button is at the top of this thread.</p>
          )}
          {req.status === "open" && phase === "reply" && !isProvider && (
            <p className="text-sm text-ink-2">
              {isMember ? "Nothing to do but wait: only the provider may reply." : "Only the provider may reply."} If the window closes in {span(req.deadline - clock)} without an
              honoured or stalled reply, anyone may lapse it and the fee goes back to the member.
            </p>
          )}
          {memberStatus === "cancelled" && memPhase === "cancelled" && (
            <p className="text-sm text-ink-2">Honoured. The fee stays held until the period ends in {span(memEnd - clock)}; then anyone may collect it for the provider.</p>
          )}
          {(memberStatus === "refunded" || memberStatus === "served") && (
            <p className="text-sm text-ink-2">
              Closed. Nothing is left to do on this thread.{" "}
              <Link href={`/plan/${req.plan}`} className="link">
                Back to {req.planName}
              </Link>
              .
            </p>
          )}
        </div>
      </Section>

      <Section title="Sent from this browser" hint="Every transaction on this thread that this browser sent or asked for, with its explorer link.">
        <TxList thread={req.id} />
        <p className="mt-2 text-xs text-ink-3">The reply window of this plan is {windowLabel(Math.max(0, req.deadline - req.sentAt))}.</p>
      </Section>
    </ReadingBody>
  );
}

function labelOf(call: Call, req: Request): string {
  switch (call.fn) {
    case "reply":
      return call.args[1] === demoPlanByName(req.planName)?.reply ? `The demo provider replies to ${req.id}` : `Replying to ${req.id}`;
    case "lapse":
      return `Lapsing ${req.id}`;
    case "collect":
      return `Collecting ${req.membership} for the provider`;
    default:
      return call.fn;
  }
}
