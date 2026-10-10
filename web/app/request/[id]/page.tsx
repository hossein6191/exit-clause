"use client";

// One cancellation as a thread. The member's message, every provider reply with the stamp the network
// put on it, the reply deadline counting down, the fee the contract still holds, and the step line
// that moves by itself. Below, what whoever is looking can do now: the provider replies, anyone lapses
// it once the window has closed, anyone collects an honoured period once it is over. On a demo plan
// the demo provider is asked to reply as soon as the member's cancellation has landed.

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
import { StepLine, Thread, Time, moneyLine } from "@/components/thread";
import { ThreadList } from "@/components/thread-list";
import { ToolButton } from "@/components/tool-button";
import { TxList } from "@/components/tx-list";
import { TxRail } from "@/components/tx-rail";
import { WalletGate } from "@/components/wallet-gate";
import { useDemoStatus } from "@/components/use-demo";
import { useLocal } from "@/components/use-local";
import { useMe } from "@/components/use-me";
import { useNow } from "@/components/use-now";
import { useRead } from "@/components/use-read";
import { useTx } from "@/components/use-tx";
import { calls, isJudged, isMock, membershipPhaseNow, readMembership, readRequest, replyOutcome, requestDemoReply, requestPhaseNow } from "@/lib/chain";
import { demoPlanByName, isDemoPlan } from "@/lib/demo-plans";
import { gen, span, windowLabel } from "@/lib/format";
import { MAX_REPLY, STAMPS, parseRequestId, plain, replyProblem, stampOfReply, stepsDone, type MembershipStatus } from "@/lib/rules";
import { REPLY_CHIPS } from "@/lib/suggestions";
import { demoAsked, demoSkipped, rememberTx, setDemoAsked } from "@/lib/tx-memory";
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
  const demo = useDemoStatus();
  const clock = now || req.now;
  const phase = requestPhaseNow(req, clock);
  const isProvider = !!me.address && me.address === req.provider;
  const isMember = !!me.address && me.address === req.member;
  const demoPlan = !!demo?.provider && isDemoPlan({ name: req.planName, provider: req.provider }, demo.provider);
  // With the demo provider offline its address may be unknown: a plan bearing a demo plan's name still says why nobody replies.
  const showDemo = demoPlan || (!!demo && !demo.online && !!demoPlanByName(req.planName));
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

  // ---- the demo provider, asked once the member's cancellation is here ----
  const skipped = useLocal(() => demoSkipped(req.id), false);
  const askedBefore = useLocal(() => demoAsked(req.id), false);
  const [ask, setAsk] = React.useState<{ state: "idle" | "asking" | "sent" | "failed"; reason: string }>({ state: "idle", reason: "" });
  const askDemo = React.useCallback(async () => {
    setAsk({ state: "asking", reason: "" });
    setDemoAsked(req.id);
    const answer = await requestDemoReply(req.id);
    if (answer.ok) {
      setAsk({ state: "sent", reason: "" });
      const text = demoPlanByName(req.planName)?.reply ?? "";
      rememberTx(req.id, answer.hash, "The demo provider's reply");
      track(answer.hash, calls.reply(req.id, text));
    } else setAsk({ state: "failed", reason: answer.reason });
  }, [req.id, req.planName, track]);
  const demoCanReply = demoPlan && !!demo?.online && req.status === "open" && req.replies.length === 0 && phase === "reply";
  const autoAsk = demoCanReply && (isMember || isMock) && !skipped && !askedBefore && ask.state === "idle" && !tx.hash;
  const asked = React.useRef(false);
  React.useEffect(() => {
    if (!autoAsk || asked.current) return;
    asked.current = true;
    void askDemo();
  }, [autoAsk, askDemo]);

  const lastStamp = req.status === "lapsed" ? "lapsed" : req.replies.length ? stampOfReply(req.replies[req.replies.length - 1].verdict, req.replies.length - 1) : null;
  const outcome = tx.final && tx.call?.fn === "reply" ? replyOutcome(tx.final) : null;

  return (
    <ReadingBody>
      <p className="mono text-xs text-ink-3">
        {req.id} · {req.membership} ·{" "}
        <Link href={`/plan/${req.plan}`} className="link">
          {req.plan}
        </Link>
      </p>
      <h1 className="mt-1 text-xl sm:text-2xl">Cancellation · {req.planName}</h1>
      <StepLine done={done} className="mt-4" />

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
              demoCanReply
                ? "It answers each cancellation on this plan once, within seconds."
                : req.replies.length
                  ? "It has answered this cancellation."
                  : "It answers only while the reply window is open."
            }
          />
          {demoCanReply && skipped && ask.state === "idle" && (
            <p className="mt-2 text-[13.5px] text-ink-2">
              You asked it to stay silent here: the window closes in {span(req.deadline - clock)}, and then anyone may lapse this request.
            </p>
          )}
          {ask.state === "asking" && <p className="mt-2 text-[13.5px] text-ink-2">The demo provider is replying…</p>}
          {ask.state === "sent" && (
            <p className="mt-2 text-[13.5px] text-ink-2">
              {tx.final ? "The demo provider replied, and the network's stamp is on the thread above." : "The demo provider replied. The validators are reading it now; the stamp lands on the thread above."}
            </p>
          )}
          {ask.state === "failed" && (
            <p role="alert" className="mt-2 text-[13.5px] text-postal-ink">
              {ask.reason}
            </p>
          )}
          {demoCanReply && (ask.state === "failed" || (ask.state === "idle" && (skipped || askedBefore || !isMember))) && (
            <ToolButton size="sm" className="mt-2" icon={<IconRefresh size={14} />} onClick={() => void askDemo()}>
              Ask the demo provider to reply
            </ToolButton>
          )}
        </Section>
      )}

      {(tx.hash || tx.error) && (
        <div className="py-2">
          {tx.hash && tx.call && <TxRail hash={tx.hash} label={labelOf(tx.call, req)} judged={isJudged(tx.call.fn)} onDone={tx.onDone} />}
          {tx.error && (
            <p role="alert" className="mt-2 text-sm text-postal-ink">
              {tx.error}
            </p>
          )}
          {outcome && (
            <p className="mt-2 text-sm">
              Stamped <strong>{outcome.verdict}</strong>.{" "}
              {outcome.refundedAtto !== "0" ? `${gen(outcome.refundedAtto)} went back to the member in the same transaction.` : "Nothing moved."}
            </p>
          )}
        </div>
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
                      <ToolButton variant="ink" icon={<IconReply />} disabled={tx.sending || !plainText || !!replyProblem(plainText)} onClick={() => void tx.start(calls.reply(req.id, plainText))}>
                        Send reply
                      </ToolButton>
                    </WalletGate>
                  </div>
                </div>
              </div>
            </div>
          )}
          {req.status === "open" && phase === "lapse" && (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-ink-2">
                The reply window closed without an honoured or stalled reply. Anyone may lapse the request: {gen(req.heldAtto)} goes back to the member by rule, with no model asked.
              </p>
              <WalletGate what="to lapse it">
                <ToolButton variant="ink" icon={<IconHourglass />} disabled={tx.sending} onClick={() => void tx.start(calls.lapse(req.id))}>
                  Lapse {req.id}: the fee goes back
                </ToolButton>
              </WalletGate>
            </div>
          )}
          {memPhase === "due" && memberStatus === "cancelled" && (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-ink-2">The cancellation was honoured and the period is over. Anyone may collect its fee for the provider; it goes to the provider whoever sends it.</p>
              <WalletGate what="to collect">
                <ToolButton icon={<IconCollect />} disabled={tx.sending} onClick={() => void tx.start(calls.collect(req.membership))}>
                  Collect {gen(memHeld)} for the provider
                </ToolButton>
              </WalletGate>
            </div>
          )}
          {req.status === "open" && phase === "reply" && !isProvider && (
            <p className="text-sm text-ink-2">
              {isMember ? "Waiting for the provider's reply." : "Only the provider may reply."} If the window closes in {span(req.deadline - clock)} without an honoured or stalled reply, anyone
              may lapse it and the fee goes back to the member.
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
