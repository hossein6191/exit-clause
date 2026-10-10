"use client";

// A cancellation as a mail thread: the member's message, then each provider reply with the stamp
// the network put on it, and, when the window ran out, the contract's own note that it lapsed. Above
// it, the step line (Joined, Cancellation sent, Reply, Stamped, Closed) that moves by itself as the
// chain moves.

import * as React from "react";

import { Addr } from "@/components/addr";
import { IconCheck } from "@/components/icons";
import { Stamp } from "@/components/stamp";
import { useNow } from "@/components/use-now";
import { clockTime, gen } from "@/lib/format";
import { STEPS, stampOfReply, type RequestStatus, type Verdict } from "@/lib/rules";
import { cx } from "@/lib/cx";

/** A time printed in the reader's own zone, only once the page runs in the browser (no hydration mismatch). */
export function Time({ at, className }: { at: number; className?: string }) {
  const now = useNow();
  if (!at) return null;
  return (
    <time dateTime={new Date(at * 1000).toISOString()} className={cx("mono text-xs text-ink-3", className)} suppressHydrationWarning>
      {now ? clockTime(at, now) : ""}
    </time>
  );
}

/** The five steps of a thread, the done ones ticked and the next one marked. */
export function StepLine({ done, className }: { done: number; className?: string }) {
  return (
    <ol className={cx("grid grid-cols-5 gap-1", className)} aria-label="Where this cancellation is">
      {STEPS.map((label, i) => {
        const isDone = i < done;
        const isNext = i === done;
        return (
          <li key={label} className="relative flex min-w-0 flex-col items-center text-center" aria-current={isNext ? "step" : undefined}>
            {i > 0 && (
              <span aria-hidden="true" className={cx("absolute top-[11px] right-1/2 h-0.5 w-[calc(100%+4px)]", i <= done ? "bg-ink" : "bg-line")} />
            )}
            <span
              className={cx(
                "relative z-[1] flex size-6 items-center justify-center rounded-full border-2 text-[11px] font-semibold",
                isDone ? "border-ink bg-ink text-white" : isNext ? "border-postal bg-postal-wash text-postal-ink" : "border-line bg-pane text-ink-3",
              )}
            >
              {isDone ? <IconCheck size={12} /> : i + 1}
            </span>
            <span className={cx("mt-1 text-[11px] leading-tight sm:text-xs", isDone ? "text-ink" : isNext ? "font-semibold text-postal-ink" : "text-ink-3")}>{label}</span>
            <span className="sr-only">{isDone ? "(done)" : isNext ? "(next)" : "(to come)"}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Avatar({ who }: { who: "member" | "provider" | "contract" }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold",
        who === "member" && "bg-frame-deep text-ink",
        who === "provider" && "bg-postal-wash text-postal-ink",
        who === "contract" && "border border-dashed border-ink-3/60 bg-pane text-ink-3",
      )}
    >
      {who === "member" ? "M" : who === "provider" ? "P" : "§"}
    </span>
  );
}

function Card({
  who,
  name,
  address,
  me,
  at,
  note,
  children,
  stamp,
  indent,
}: {
  who: "member" | "provider" | "contract";
  name: string;
  address?: string;
  me?: string;
  at: number;
  note?: string;
  children: React.ReactNode;
  stamp?: React.ReactNode;
  indent?: boolean;
}) {
  return (
    <article className={cx("relative rounded-[8px] border bg-pane", who === "contract" ? "border-dashed border-ink-3/40 bg-frame/50" : "border-line", indent && "sm:ml-8")}>
      <header className="flex items-start gap-3 px-3.5 pt-3 sm:px-4">
        <Avatar who={who} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-sm">
              <span className="font-semibold">{name}</span> {address && <Addr address={address} me={me} />}
            </p>
            <Time at={at} />
          </div>
          {note && <p className="text-xs text-ink-3">{note}</p>}
        </div>
      </header>
      <div className={cx("px-3.5 pt-2 text-[14.5px] leading-relaxed text-ink sm:px-4", stamp ? "pb-9" : "pb-4")}>{children}</div>
      {stamp && <div className="absolute right-3 -bottom-3 sm:right-5">{stamp}</div>}
    </article>
  );
}

export type ThreadData = {
  planName: string;
  member: string;
  provider: string;
  message: string;
  sentAt: number;
  replies: { text: string; verdict: Verdict; at: number }[];
  status: RequestStatus;
  deadline: number;
  closedAt: number;
  closedBy: string;
  feeAtto: string;
  refundedAtto: string;
};

/**
 * The thread itself. `freshFrom` is how many stamps were already on screen when the page first read
 * it: the stamps after those land with the stamp-in motion, the earlier ones are simply there.
 */
export function Thread({ t, me, freshFrom = Infinity, className }: { t: ThreadData; me?: string; freshFrom?: number; className?: string }) {
  const lapsed = t.status === "lapsed";
  return (
    <div className={cx("flex flex-col gap-5", className)}>
      <Card who="member" name="Member" address={t.member} me={me} at={t.sentAt} note={`to the provider of ${t.planName}`}>
        <p className="break-words whitespace-pre-wrap">{t.message}</p>
      </Card>
      {t.replies.map((r, i) => (
        <Card
          key={i}
          who="provider"
          name="Provider"
          address={t.provider}
          me={me}
          at={r.at}
          indent
          note={`reply ${i + 1} of at most 2 · read by the network in the same call`}
          stamp={<Stamp kind={stampOfReply(r.verdict, i)} fresh={i >= freshFrom} />}
        >
          <p className="break-words whitespace-pre-wrap">{r.text}</p>
        </Card>
      ))}
      {lapsed && (
        <Card
          who="contract"
          name="Exit Clause"
          at={t.closedAt}
          note="the contract, by rule; no model asked"
          stamp={<Stamp kind="lapsed" fresh={t.replies.length >= freshFrom} />}
        >
          <p>
            The reply window closed {t.replies.length ? "without an honoured or stalled reply" : "with no reply at all"}.{" "}
            {t.closedBy ? (
              <>
                <Addr address={t.closedBy} me={me} /> lapsed the request, and
              </>
            ) : (
              "The request lapsed, and"
            )}{" "}
            <span className="mono font-medium">{gen(t.refundedAtto)}</span> went back to the member in the same transaction.
          </p>
        </Card>
      )}
    </div>
  );
}

/** Where the money went, in one sentence, for a thread in any state. */
export function moneyLine(t: { status: RequestStatus; feeAtto: string; refundedAtto: string }, membershipStatus?: string): string {
  const fee = gen(t.feeAtto);
  if (t.status === "stalled") return `Stalled: ${gen(t.refundedAtto)} went back to the member in the same transaction as the verdict. The membership ended.`;
  if (t.status === "lapsed") return `Lapsed: ${gen(t.refundedAtto)} went back to the member by rule. The membership ended.`;
  if (t.status === "honoured")
    return membershipStatus === "served"
      ? `Honoured: the period ran out and its ${fee} was collected for the provider. The membership is over.`
      : `Honoured: nothing moved. The ${fee} stays held for the provider until the period ends, then anyone may collect it.`;
  return `Open: the ${fee} stays held while the provider may reply. A stall sends it back at once; silence past the deadline sends it back by rule.`;
}
