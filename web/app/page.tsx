"use client";

// The inbox: what Exit Clause is in one minute. A pinned welcome message with THE RULE, a sample
// thread with its stamp, how the held month moves and where to start; beside it, five sample threads,
// one for each way a provider can answer. The brands are fictional and nothing here is on chain.

import * as React from "react";

import { IconArrowRight, IconDesk, IconHelp, IconPin, IconPlus } from "@/components/icons";
import { MoneyFlow } from "@/components/money-flow";
import { ListHead, ReadingBody, Split } from "@/components/panes";
import { RuleBlock } from "@/components/rule-block";
import { Section } from "@/components/section";
import { StampTag } from "@/components/stamp";
import { StepLine, Thread, Time, moneyLine, type ThreadData } from "@/components/thread";
import { ToolLink } from "@/components/tool-button";
import { useNow } from "@/components/use-now";
import { DEMO_PLANS } from "@/lib/demo-plans";
import { stampOfReply, stepsDone, type MembershipStatus, type StampKind } from "@/lib/rules";
import { MESSAGE_CHIPS, REPLY_CHIPS } from "@/lib/suggestions";
import { cx } from "@/lib/cx";

const GEN = 10n ** 18n;
const MIN = 60;
const HOUR = 3600;

type Sample = {
  key: string;
  subject: string;
  /** the thread, with every instant as seconds before now */
  thread: Omit<ThreadData, "member" | "provider" | "closedBy">;
  membership: MembershipStatus;
};

/** Five sample threads, one per ending. Times are offsets before now; the page adds the clock. */
const SAMPLES: Sample[] = [
  {
    key: "gym",
    subject: "Ironside Gym, monthly",
    membership: "cancelled",
    thread: {
      planName: DEMO_PLANS[0].name,
      message: MESSAGE_CHIPS[0].value,
      sentAt: 2 * HOUR,
      replies: [{ text: DEMO_PLANS[0].reply, verdict: "honoured", at: 2 * HOUR - 4 * MIN }],
      status: "honoured",
      deadline: 0,
      closedAt: 2 * HOUR - 4 * MIN,
      feeAtto: DEMO_PLANS[0].feeAtto,
      refundedAtto: "0",
    },
  },
  {
    key: "stream",
    subject: "Northwind Stream, premium",
    membership: "refunded",
    thread: {
      planName: DEMO_PLANS[1].name,
      message: MESSAGE_CHIPS[1].value,
      sentAt: 3 * HOUR,
      replies: [{ text: DEMO_PLANS[1].reply, verdict: "stalled", at: 3 * HOUR - 6 * MIN }],
      status: "stalled",
      deadline: 0,
      closedAt: 3 * HOUR - 6 * MIN,
      feeAtto: DEMO_PLANS[1].feeAtto,
      refundedAtto: DEMO_PLANS[1].feeAtto,
    },
  },
  {
    key: "lingo",
    subject: "Lingo Daily Pro",
    membership: "refunded",
    thread: {
      planName: DEMO_PLANS[2].name,
      message: MESSAGE_CHIPS[3].value,
      sentAt: 5 * HOUR,
      replies: [{ text: DEMO_PLANS[2].reply, verdict: "stalled", at: 5 * HOUR - 3 * MIN }],
      status: "stalled",
      deadline: 0,
      closedAt: 5 * HOUR - 3 * MIN,
      feeAtto: DEMO_PLANS[2].feeAtto,
      refundedAtto: DEMO_PLANS[2].feeAtto,
    },
  },
  {
    key: "cloud",
    subject: "Brightline Cloud 2 TB",
    membership: "cancelling",
    thread: {
      planName: "Brightline Cloud 2 TB",
      message: MESSAGE_CHIPS[4].value,
      sentAt: 20 * HOUR,
      replies: [{ text: REPLY_CHIPS[3].value, verdict: "unclear", at: 18 * HOUR }],
      status: "open",
      deadline: 0,
      closedAt: 0,
      feeAtto: (GEN / 5n).toString(),
      refundedAtto: "0",
    },
  },
  {
    key: "books",
    subject: "Paperleaf book box",
    membership: "refunded",
    thread: {
      planName: "Paperleaf book box",
      message: MESSAGE_CHIPS[2].value,
      sentAt: 50 * HOUR,
      replies: [],
      status: "lapsed",
      deadline: 0,
      closedAt: 25 * HOUR,
      feeAtto: ((GEN * 6n) / 10n).toString(),
      refundedAtto: ((GEN * 6n) / 10n).toString(),
    },
  },
];

const stampOf = (s: Sample): StampKind | null => {
  if (s.thread.status === "lapsed") return "lapsed";
  const last = s.thread.replies.length - 1;
  return last >= 0 ? stampOfReply(s.thread.replies[last].verdict, last) : null;
};

/** The sample with the page's clock applied: every offset becomes an instant. */
function placed(s: Sample, now: number): ThreadData {
  const at = (offset: number) => (offset && now ? now - offset : 0);
  return {
    ...s.thread,
    member: "",
    provider: "",
    closedBy: "",
    sentAt: at(s.thread.sentAt),
    closedAt: at(s.thread.closedAt),
    replies: s.thread.replies.map((r) => ({ ...r, at: at(r.at) })),
  };
}

export default function InboxPage() {
  const [selected, setSelected] = React.useState("welcome");
  const [show, setShow] = React.useState<"list" | "reading">("reading");
  const now = useNow();
  const pick = (key: string) => {
    setSelected(key);
    setShow("reading");
  };
  const sample = SAMPLES.find((s) => s.key === selected) ?? null;

  const list = (
    <div>
      <ListHead title="Inbox" hint="Five sample threads, one for each way a provider can answer. Fictional brands; nothing here is on chain." />
      <ul>
        <InboxRow
          on={selected === "welcome"}
          onPick={() => pick("welcome")}
          from="Exit Clause"
          subject="Cancel anytime, enforced"
          preview="What this is in one minute: the rule, the held month, and where to start."
          pinned
        />
        {SAMPLES.map((s) => (
          <InboxRow
            key={s.key}
            on={selected === s.key}
            onPick={() => pick(s.key)}
            from={s.subject}
            subject={s.thread.replies.length ? "Re: Cancellation" : "Cancellation (no reply)"}
            preview={s.thread.replies.length ? s.thread.replies[s.thread.replies.length - 1].text : s.thread.message}
            stamp={stampOf(s)}
            at={now ? now - (s.thread.replies.length ? s.thread.replies[s.thread.replies.length - 1].at : s.thread.closedAt) : 0}
          />
        ))}
      </ul>
    </div>
  );

  return (
    <Split
      listLabel="Inbox"
      show={show}
      list={list}
      back={{ onClick: () => setShow("list"), label: "Inbox" }}
      reading={sample ? <SampleReading s={sample} now={now} /> : <Welcome now={now} />}
    />
  );
}

function InboxRow({
  on,
  onPick,
  from,
  subject,
  preview,
  stamp,
  at,
  pinned,
}: {
  on: boolean;
  onPick: () => void;
  from: string;
  subject: string;
  preview: string;
  stamp?: StampKind | null;
  at?: number;
  pinned?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        aria-current={on ? "true" : undefined}
        className={cx("relative block w-full border-b border-line-soft px-4 py-3 text-left hover:bg-hover", on && "bg-postal-wash/60 hover:bg-postal-wash/80")}
      >
        {on && <span aria-hidden="true" className="absolute top-0 bottom-0 left-0 w-[3px] bg-postal" />}
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 truncate text-[14px] font-semibold">
            {pinned && <IconPin size={13} className="shrink-0 text-postal" />}
            {from}
          </span>
          {at ? <Time at={at} className="shrink-0" /> : null}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="truncate text-[13px] text-ink">{subject}</span>
          {stamp && <StampTag kind={stamp} className="shrink-0" />}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[12.5px] text-ink-3">{preview}</p>
      </button>
    </li>
  );
}

function Welcome({ now }: { now: number }) {
  const sample = placed(SAMPLES[1], now);
  return (
    <ReadingBody>
      <p className="mono text-xs text-ink-3">From Exit Clause · pinned</p>
      <h1 className="mt-1 text-2xl sm:text-[28px]">Cancel anytime, enforced.</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
        &ldquo;Cancel anytime&rdquo; is on every gym leaflet and streaming plan, until the reply asks you to phone a care line, or to answer an offer first. Here a provider opens a
        plan, a member pays the fee for one period, and <strong className="text-ink">the contract holds that fee until the period ends</strong>. When the member cancels, the
        provider&apos;s reply is read by the network against one fixed rule in the same transaction, and stamped. A reply that stalls gives that month back at once.
      </p>

      <Section title="The rule every reply is read against" hint="One sentence in the contract. No provider writes its own." className="mt-6">
        <RuleBlock />
      </Section>

      <Section title="A sample thread" hint="A member cancels; the provider asks for a phone call; the network stamps it and the fee goes back in the same transaction.">
        <Thread t={sample} />
        <p className="mt-6 text-[13.5px] text-ink-2">{moneyLine(sample)}</p>
      </Section>

      <Section title="How the held month moves" hint="The fee sits in the contract for the period and leaves to exactly one side.">
        <MoneyFlow />
      </Section>

      <Section title="Start here" hint="One wallet is enough: the demo provider replies to its three plans by itself.">
        <div className="flex flex-wrap gap-2">
          <ToolLink href="/plans" variant="ink" icon={<IconPlus />}>
            Try a demo plan
          </ToolLink>
          <ToolLink href="/provider" icon={<IconDesk />}>
            Open your own plan
          </ToolLink>
          <ToolLink href="/how" variant="quiet" icon={<IconHelp />}>
            How it decides
          </ToolLink>
        </div>
        <ol className="mt-4 grid gap-2 text-[13.5px] text-ink-2 sm:grid-cols-3">
          {[
            ["Join", "Pick Ironside Gym, Northwind Stream or Lingo Daily Pro and pay its fee. The contract holds it."],
            ["Send a cancellation", "One click fills the message. The demo provider replies within seconds, in its own habit."],
            ["Watch the stamp", "Validators read the reply twice and stamp it. A stall sends the fee straight back to you."],
          ].map(([title, body], i) => (
            <li key={title} className="rounded-[8px] border border-line bg-frame/50 px-3 py-2.5">
              <span className="mono text-[11px] font-bold text-postal-ink">STEP {i + 1}</span>
              <p className="font-semibold text-ink">{title}</p>
              <p className="mt-0.5 text-[12.5px] leading-snug">{body}</p>
            </li>
          ))}
        </ol>
      </Section>
    </ReadingBody>
  );
}

function SampleReading({ s, now }: { s: Sample; now: number }) {
  const t = placed(s, now);
  const done = stepsDone({ requestStatus: t.status, replies: t.replies.length, membershipStatus: s.membership });
  return (
    <ReadingBody>
      <p className="mono text-xs text-ink-3">Sample thread · fictional brand · not on chain</p>
      <h1 className="mt-1 text-xl sm:text-2xl">Cancellation · {s.subject}</h1>
      <StepLine done={done} className="mt-4" />
      <Section title="The thread" hint="The member's message, then each reply with the stamp the network put on it." className="mt-5">
        <Thread t={t} />
      </Section>
      <Section title="Where the fee went" hint="The stamp decides it; the model never sees the amount.">
        <p className="text-[14px] text-ink-2">{moneyLine(t, s.membership)}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <ToolLink href="/plans" variant="ink" icon={<IconArrowRight />}>
            Try it live on a demo plan
          </ToolLink>
          <ToolLink href="/how" variant="quiet" icon={<IconHelp />}>
            How the stamp is decided
          </ToolLink>
        </div>
      </Section>
    </ReadingBody>
  );
}
