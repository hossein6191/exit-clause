"use client";

// One plan. Its terms, THE RULE it is bound by, on a demo plan the reply its provider will send and
// the stamp to expect, the Join button, and, for a member, their own membership with its period
// counting down and the fee the contract holds, the cancellation composer and the request thread it
// started. While a transaction goes through, a waiting panel says what is happening, how long it
// usually takes and to stay; every transaction shows its explorer link from the moment it is sent.

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { Addr } from "@/components/addr";
import { HeldChip, PeriodChip, Pill } from "@/components/chips";
import { DemoNote } from "@/components/demo-status";
import { IconArrowRight, IconCollect, IconDoor, IconPlus, IconSend } from "@/components/icons";
import { ListHead, ReadingBody, Split } from "@/components/panes";
import { PlanRows } from "@/components/plan-list";
import { Placeholder, ReadError } from "@/components/read-state";
import { RuleBlock } from "@/components/rule-block";
import { Section } from "@/components/section";
import { Suggest } from "@/components/suggest";
import { StampTag } from "@/components/stamp";
import { StepLine, Thread, Time, moneyLine } from "@/components/thread";
import { ToolButton, ToolLink } from "@/components/tool-button";
import { TxList } from "@/components/tx-list";
import { TxRail } from "@/components/tx-rail";
import { WalletGate } from "@/components/wallet-gate";
import { useDemoStatus } from "@/components/use-demo";
import { useMe } from "@/components/use-me";
import { useNow } from "@/components/use-now";
import { useRead } from "@/components/use-read";
import { useTx } from "@/components/use-tx";
import { WaitPanel, type Wait } from "@/components/wait-panel";
import {
  calls,
  hasContract,
  isJudged,
  isMock,
  joinOutcome,
  membershipPhaseNow,
  readMembership,
  readMembershipsOf,
  readPlan,
  readRequest,
  sentRequest,
  succeeded,
} from "@/lib/chain";
import { demoPlanByName, isDemoPlan } from "@/lib/demo-plans";
import { clockTime, gen, windowLabel } from "@/lib/format";
import { MAX_MESSAGE, STAMPS, isOver, messageProblem, parsePlanId, plain, stepsDone } from "@/lib/rules";
import { MESSAGE_CHIPS } from "@/lib/suggestions";
import { rememberTx, setDemoSkipped } from "@/lib/tx-memory";
import type { Call, Membership, Plan, TxStatus } from "@/lib/types";

export default function PlanPage() {
  const params = useParams<{ id: string }>();
  const id = parsePlanId(String(params?.id ?? ""));
  return (
    <Split
      listLabel="Plans"
      show="reading"
      back={{ href: "/plans", label: "Plans" }}
      list={
        <>
          <ListHead title="Plans" hint="The pinned demo plans answer cancellations by themselves." />
          <PlanRows selected={id} />
        </>
      }
      reading={
        id ? (
          <PlanView key={id} id={id} />
        ) : (
          <ReadingBody>
            <h1 className="text-xl">That is not a plan id</h1>
            <p className="mt-2 text-ink-2">
              Plan ids look like P3.{" "}
              <Link href="/plans" className="link">
                See every plan
              </Link>
              .
            </p>
          </ReadingBody>
        )
      }
    />
  );
}

function PlanView({ id }: { id: string }) {
  const read = useRead(() => readPlan(id), [id]);
  if (read.error)
    return (
      <ReadingBody>
        <ReadError detail={read.error} onRetry={read.retry} />
      </ReadingBody>
    );
  if (!read.data && read.loading)
    return (
      <ReadingBody>
        <Placeholder lines={7} />
      </ReadingBody>
    );
  if (!read.data)
    return (
      <ReadingBody>
        <h1 className="text-xl">There is no plan {id}</h1>
        <p className="mt-2 text-ink-2">
          The contract holds no plan by that id.{" "}
          <Link href="/plans" className="link">
            See every plan
          </Link>
          .
        </p>
      </ReadingBody>
    );
  return <PlanBody plan={read.data} refreshPlan={read.refresh} />;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-[6px] border border-line-soft bg-frame/50 px-3 py-2">
      <dt className="field-label">{label}</dt>
      <dd className="mono mt-0.5 truncate text-[14px] font-medium">{children}</dd>
    </div>
  );
}

function PlanBody({ plan, refreshPlan }: { plan: Plan; refreshPlan: () => Promise<void> }) {
  const me = useMe();
  const now = useNow();
  const router = useRouter();
  const demo = useDemoStatus();
  const demoPlan = !!demo?.provider && isDemoPlan(plan, demo.provider);
  const habit = demoPlan ? demoPlanByName(plan.name)?.habit : "";
  // With the demo provider offline its address may be unknown: a plan bearing a demo plan's name still says why nobody replies.
  const showDemo = demoPlan || (!!demo && !demo.online && !!demoPlanByName(plan.name));
  const story = showDemo ? demoPlanByName(plan.name) : null;
  const isProvider = !!me.address && me.address === plan.provider;

  const mine = useRead(() => readMembershipsOf(me.address), ["plan-mine", me.address], { enabled: hasContract() && !!me.address });
  const myIds = mine.data?.memberships ?? [];
  const latestId = [...plan.memberships].reverse().find((m) => myIds.includes(m)) ?? "";
  const memRead = useRead(() => readMembership(latestId), ["plan-membership", latestId], { enabled: !!latestId });
  const mem = memRead.data;
  const reqId = mem?.request ?? "";
  const reqRead = useRead(() => readRequest(reqId), ["plan-request", reqId], { enabled: !!reqId });

  const [message, setMessage] = React.useState("");
  const [skipDemo, setSkipDemo] = React.useState(false);
  const skipRef = React.useRef(false);

  const refreshAll = async () => {
    await refreshPlan();
    await mine.refresh();
    await memRead.refresh();
    await reqRead.refresh();
  };

  const tx = useTx((s: TxStatus, hash: string, call: Call) => {
    rememberTx(plan.id, hash, labelOf(call, plan));
    if (call.fn === "cancel" && succeeded(s)) {
      const req = sentRequest(s);
      if (req) {
        rememberTx(req, hash, labelOf(call, plan));
        setDemoSkipped(req, skipRef.current);
        router.push(`/request/${req}`);
        return;
      }
    }
    void refreshAll();
  });

  // The call being signed (tx.call is set only once there is a hash) and when the wait for it began.
  const [pending, setPending] = React.useState<Call | null>(null);
  const [since, setSince] = React.useState(0);
  const send = (call: Call) => {
    if (call.fn === "cancel") skipRef.current = skipDemo;
    setPending(call);
    setSince(Math.floor(Date.now() / 1000));
    void tx.start(call);
  };

  const fee = BigInt(plan.feeAtto);
  const memOver = mem ? isOver(mem.status, mem.end, now || mem.now) : true;
  const canJoin = plan.status === "open" && !isProvider && (!mem || memOver);
  const plainMessage = plain(message);
  const msgProblem = message ? messageProblem(plainMessage) : "";

  // ---- what this page is waiting for right now, in one panel where the action happened ----
  const clock = now || plan.now;
  const callNow = tx.error ? null : (tx.call ?? (tx.sending ? pending : null));
  const stepOf = (c: Call) => (c.fn === "join" ? 0 : c.fn === "cancel" ? 1 : undefined);
  const sent = tx.final && tx.call?.fn === "cancel" ? sentRequest(tx.final) : "";
  let wait: Wait | null = null;
  if (tx.sending && !tx.hash && callNow) {
    wait = {
      id: "sign",
      tone: "busy",
      kicker: isMock ? "Sending" : "Your wallet",
      title: isMock ? `${labelOf(callNow, plan)}…` : "Confirm the transaction in your wallet",
      body: isMock ? undefined : `${labelOf(callNow, plan)}. Nothing is sent until you confirm it there.`,
      since,
      step: stepOf(callNow),
    };
  } else if (tx.hash && tx.call && !tx.final) {
    const c = tx.call;
    if (c.fn === "join")
      wait = {
        id: "join",
        tone: "busy",
        title: `Joining ${plan.name}`,
        body: `One transaction: the validators check the call, and the contract takes the fee of ${gen(plan.feeAtto)} and holds it for ${windowLabel(plan.period)}.`,
        expect: "about 30 seconds",
        since,
        stay: "Stay on this page; your membership and the cancellation form appear below by themselves.",
        step: 0,
      };
    else if (c.fn === "cancel")
      wait = {
        id: "cancel",
        tone: "busy",
        title: "Your cancellation is being sent",
        body: demoPlan
          ? "One transaction. When it is final this page opens the thread, and the demo provider starts writing its reply there; that takes another 1 to 2 minutes."
          : `One transaction. When it is final this page opens the thread; the provider then has ${windowLabel(plan.replyWindow)} to reply.`,
        expect: "about 30 seconds",
        since,
        stay: "Stay on this page; the thread opens by itself.",
        step: 1,
      };
    else
      wait = {
        id: c.fn,
        tone: "busy",
        title: c.fn === "collect" ? `Collecting ${c.args[0]} for the provider` : `Closing ${plan.id} to new members`,
        body:
          c.fn === "collect"
            ? "One transaction. The held fee leaves the contract for the provider and the membership is served."
            : "One transaction. Memberships already running keep going to their own end.",
        expect: "about 30 seconds",
        since,
        stay: "Stay on this page; it updates by itself.",
      };
  } else if (sent) {
    wait = { id: "cancel-sent", tone: "busy", title: `Sent as ${sent}. Opening its thread…`, since, step: 2 };
  }
  if (!wait && mem && mem.status === "cancelled" && membershipPhaseNow(mem, clock) === "cancelled")
    wait = {
      id: "collect-clock",
      tone: "clock",
      kicker: "Honoured · waiting for the period",
      title: "Honoured. Collect opens when the period ends",
      body: (
        <>
          The fee stays held for the provider until <strong className="text-ink">{clockTime(mem.end, clock)}</strong>. Then anyone may collect it for the provider, and the
          membership is served.
        </>
      ),
      left: mem.end - clock,
      leftLabel: "until collect opens",
      stay: mem.end - clock <= 3600 ? "Stay here and the Collect button appears below by itself, or come back later." : undefined,
    };

  return (
    <ReadingBody>
      <p className="mono text-xs text-ink-3">
        {plan.id} · opened <Time at={plan.openedAt} />
      </p>
      <h1 className="mt-1 text-2xl">{plan.name}</h1>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
        <span>
          Provider <Addr address={plan.provider} me={me.address} />
        </span>
        {demoPlan && <Pill tone="postal">demo provider: {habit}</Pill>}
        {plan.status === "closed" ? <Pill>closed to new members</Pill> : <Pill tone="honoured">open</Pill>}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Fact label="Fee, one period">{gen(plan.feeAtto)}</Fact>
        <Fact label="Period">{windowLabel(plan.period)}</Fact>
        <Fact label="Reply window">{windowLabel(plan.replyWindow)}</Fact>
        <Fact label="Live members">
          {plan.live} <span className="text-ink-3">of {plan.members}</span>
        </Fact>
        <Fact label="Held now">{gen(plan.heldAtto)}</Fact>
      </dl>

      <Section title="The rule this plan is bound by" hint="The provider chose the fee, the period and the window. This sentence is the contract's own." className="mt-6">
        <RuleBlock />
      </Section>

      {story && (
        <Section title="What this provider will reply" hint="The demo provider sends this reply, word for word, to every cancellation on this plan. Pick a plan by the story you want to watch.">
          <div className="rounded-[8px] border border-line bg-pane px-3.5 py-3 sm:px-4">
            <p className="text-xs text-ink-3">The provider {story.habit}:</p>
            <p className="mt-1 text-[14.5px] leading-relaxed text-ink">{story.reply}</p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px]">
            <span className="text-ink-2">Expected stamp</span>
            <StampTag kind={story.expect} />
            <span className="text-ink-3">· {STAMPS[story.expect].meaning}</span>
          </div>
          <p className="mt-1.5 text-[13.5px] text-ink-2">{story.why}</p>
          <p className="mt-1.5 text-xs text-ink-3">
            {isMock ? "In this demo build the stamp is scripted." : "On chain the validators decide; this is what the rule should make of it."}
          </p>
        </Section>
      )}

      <Section
        title={isProvider ? "Your plan" : "Join"}
        hint={isProvider ? "Members join from their own wallets; their fees are held until each period ends." : "Pay exactly the fee; the contract holds it until the period ends."}
      >
        {isProvider ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-ink-2">
              You run this plan. Replies to its cancellations are written on each request&apos;s thread;{" "}
              <Link href="/provider" className="link">
                the provider desk
              </Link>{" "}
              lists them.
            </p>
            {plan.status === "open" && (
              <ToolButton icon={<IconDoor />} disabled={tx.sending} onClick={() => send(calls.closePlan(plan.id))}>
                Close to new members
              </ToolButton>
            )}
          </div>
        ) : plan.status !== "open" ? (
          <p className="text-sm text-ink-2">This plan is closed and takes no new members. Every membership it already has runs to its own end.</p>
        ) : canJoin ? (
          <WalletGate need={fee} what="to join">
            <div className="flex flex-col items-start gap-2">
              <ToolButton variant="ink" icon={<IconPlus />} disabled={tx.sending} onClick={() => send(calls.join(plan.id, fee))}>
                Join for {gen(plan.feeAtto)}
              </ToolButton>
              <p className="text-[13px] text-ink-3">
                The fee is held for {windowLabel(plan.period)}. It reaches the provider only once the period has ended, and only if no reply stalled your cancellation.
              </p>
            </div>
          </WalletGate>
        ) : (
          <p className="text-sm text-ink-2">
            You hold <span className="mono">{mem?.id}</span> in this plan. You may join again once it ends.
          </p>
        )}
        {showDemo && !isProvider && (
          <DemoNote
            className="mt-3"
            online="It replies to every cancellation on this plan by itself. Its reply is a transaction the validators judge, so the stamp lands 1 to 2 minutes after your cancellation."
          />
        )}
      </Section>

      {(wait || tx.hash || tx.error) && (
        <div className="flex flex-col gap-2 py-2">
          {wait && <WaitPanel wait={wait} />}
          {tx.hash && tx.call && <TxRail hash={tx.hash} label={labelOf(tx.call, plan)} judged={isJudged(tx.call.fn)} onDone={tx.onDone} />}
          {tx.error && (
            <p role="alert" className="text-sm text-postal-ink">
              {tx.error}
            </p>
          )}
          {tx.final && tx.call?.fn === "join" && joinOutcome(tx.final).kind === "joined" && (
            <p className="text-sm text-honoured-ink">Joined. Your membership is below; send a cancellation whenever you like.</p>
          )}
        </div>
      )}

      {mem && (
        <Section title="Your membership" hint="One period, and where its fee is right now.">
          <MembershipCard mem={mem} now={now} />
          {mem.status === "live" && now > 0 && now < mem.end && (
            <div className="mt-4">
              <h3 className="text-[14px]">Send a cancellation</h3>
              <p className="mt-0.5 text-[13px] text-ink-3">The provider&apos;s reply window starts when it lands. One click fills the message.</p>
              <div className="mt-2 rounded-[8px] border border-line">
                <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-line-soft px-3 py-2 text-[13px]">
                  <span className="field-label">To</span>
                  <span className="min-w-0 break-words">
                    the provider of {plan.name} <Addr address={plan.provider} />
                  </span>
                  <span className="field-label">Subject</span>
                  <span>
                    Cancellation of <span className="mono">{mem.id}</span>
                  </span>
                </div>
                <label htmlFor="cancel-message" className="sr-only">
                  Your message
                </label>
                <textarea
                  id="cancel-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  placeholder="Write why you are leaving, or pick a message below."
                  aria-invalid={!!msgProblem}
                  aria-describedby="cancel-help"
                  className="block min-h-[96px] w-full resize-y border-0 bg-pane px-3 py-2 text-[14.5px] leading-relaxed focus-visible:outline-2 focus-visible:-outline-offset-2"
                />
                <div className="border-t border-line-soft px-3 py-2.5">
                  <Suggest label="Suggested messages" chips={MESSAGE_CHIPS} onPick={setMessage} isOn={(v) => v === message} />
                  <p id="cancel-help" className="mt-2 text-xs text-ink-3">
                    <span className="mono">{[...plainMessage].length}</span> / {MAX_MESSAGE} characters, at least 20, printable ASCII on one line.
                    {msgProblem && <span className="text-postal-ink"> {msgProblem.charAt(0).toUpperCase() + msgProblem.slice(1)}.</span>}
                  </p>
                  {demoPlan && (
                    <label className="mt-2 flex items-start gap-2 text-[13px] text-ink-2">
                      <input type="checkbox" checked={!skipDemo} onChange={(e) => setSkipDemo(!e.target.checked)} className="mt-0.5 size-4 accent-postal" />
                      <span>
                        Let the demo provider reply. Untick it to watch the {windowLabel(plan.replyWindow)} window run out instead, and lapse the request yourself.
                      </span>
                    </label>
                  )}
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                    <WalletGate what="to send the cancellation">
                      <ToolButton
                        variant="postal"
                        icon={<IconSend />}
                        disabled={tx.sending || !plainMessage || !!messageProblem(plainMessage)}
                        onClick={() => send(calls.cancel(mem.id, plainMessage))}
                      >
                        Send cancellation
                      </ToolButton>
                    </WalletGate>
                  </div>
                </div>
              </div>
            </div>
          )}
          {membershipPhaseNow(mem, now || mem.now) === "due" && (
            <div className="mt-4 flex flex-col items-start gap-2">
              <p className="text-sm text-ink-2">The period is over with nothing open on it. Anyone may now collect its fee for the provider; it goes to the provider whoever sends it.</p>
              <WalletGate what="to collect">
                <ToolButton icon={<IconCollect />} disabled={tx.sending} onClick={() => send(calls.collect(mem.id))}>
                  Collect {gen(mem.heldAtto)} for the provider
                </ToolButton>
              </WalletGate>
            </div>
          )}
        </Section>
      )}

      {reqRead.data && mem && (
        <Section
          title="Its cancellation"
          hint="The thread of this membership's one cancellation."
          aside={
            <ToolLink href={`/request/${reqRead.data.id}`} size="sm" icon={<IconArrowRight size={14} />}>
              Open {reqRead.data.id}
            </ToolLink>
          }
        >
          <StepLine
            done={stepsDone({ requestStatus: reqRead.data.status, replies: reqRead.data.replies.length, membershipStatus: mem.status })}
            busy={reqRead.data.status === "open" || wait?.id === "collect-clock" || wait?.id === "collect"}
            className="mb-4"
          />
          <Thread t={reqRead.data} me={me.address} />
          <p className="mt-6 text-[13.5px] text-ink-2">{moneyLine(reqRead.data, mem.status)}</p>
        </Section>
      )}

      <Section title="Sent from this browser" hint="The contract does not keep transaction hashes; this browser does, with an explorer link for each.">
        <TxList thread={plan.id} also={reqId} />
      </Section>
    </ReadingBody>
  );
}

function MembershipCard({ mem, now }: { mem: Membership; now: number }) {
  const phase = membershipPhaseNow(mem, now || mem.now);
  const words: Record<string, string> = {
    running: "Live. The period runs and its fee is held.",
    cancelling: "Cancelling. Your request is open and the fee is held until it closes.",
    cancelled: "Cancelled, honoured. The membership ends at the period's end; the fee stays held for the provider.",
    due: mem.status === "cancelled" ? "Honoured, and the period is over: the fee can be collected for the provider." : "The period is over: the fee can be collected for the provider.",
    refunded: "Refunded. The fee went back to you and the membership ended.",
    served: "Served. The period ended and its fee went to the provider.",
    unknown: "Read without a clock.",
  };
  return (
    <div className="rounded-[8px] border border-line px-3.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="mono font-semibold">{mem.id}</span> <span className="text-ink-3">·</span> joined <Time at={mem.start} />
        </p>
        {mem.request && (
          <Link href={`/request/${mem.request}`} className="mono link text-[13px]">
            {mem.request}
          </Link>
        )}
      </div>
      <p className="mt-1 text-[14px]">{words[phase] ?? ""}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <HeldChip heldAtto={mem.heldAtto} until={mem.end} />
        {(mem.status === "live" || mem.status === "cancelled" || mem.status === "cancelling") && <PeriodChip end={mem.end} />}
        {mem.refundedAtto !== "0" && <Pill tone="stalled">{gen(mem.refundedAtto)} back to the member</Pill>}
        {mem.collectedAtto !== "0" && <Pill tone="honoured">{gen(mem.collectedAtto)} to the provider</Pill>}
      </div>
    </div>
  );
}

function labelOf(call: Call, plan: Plan): string {
  switch (call.fn) {
    case "join":
      return `Joining ${plan.id} for ${gen(call.value ?? 0n)}`;
    case "cancel":
      return `Sending the cancellation of ${call.args[0]}`;
    case "collect":
      return `Collecting ${call.args[0]} for the provider`;
    case "close_plan":
      return `Closing ${plan.id} to new members`;
    default:
      return call.fn;
  }
}

