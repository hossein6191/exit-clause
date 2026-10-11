"use client";

// Cancellations as inbox rows: the plan, the last word in the thread, its stamp, and one line from
// lib/guide.ts saying who the thread waits for and what the viewer can do. Beside a request
// it lists the visitor's own threads (sent and received) or, for a visitor with no wallet, the most
// recent ones on the contract. Reads are spaced: Studio allows 30 a minute from one browser.

import * as React from "react";
import Link from "next/link";

import { Pill } from "@/components/chips";
import { Placeholder, ReadError, readEach } from "@/components/read-state";
import { StampTag } from "@/components/stamp";
import { Time } from "@/components/thread";
import { useMe } from "@/components/use-me";
import { useNow } from "@/components/use-now";
import { useAfterTx, useRead } from "@/components/use-read";
import { hasContract, readMine, readRequest, readStats } from "@/lib/chain";
import { memberStatusOf, threadLine, type Role } from "@/lib/guide";
import { idNumber, stampOfReply, type StampKind } from "@/lib/rules";
import type { ReadResult, Request } from "@/lib/types";
import { cx } from "@/lib/cx";

export const latestStamp = (r: Request): StampKind | null => {
  if (r.status === "lapsed") return "lapsed";
  const last = r.replies.length - 1;
  return last >= 0 ? stampOfReply(r.replies[last].verdict, last) : null;
};

const lastAt = (r: Request) => (r.closedAt ? r.closedAt : r.replies.length ? r.replies[r.replies.length - 1].at : r.sentAt);

/** Reads the requests with these ids, newest first, at most `cap` of them, two at a time. */
export async function readRequests(ids: string[], cap = 10): Promise<Request[]> {
  const wanted = [...new Set(ids)].sort((a, b) => idNumber(b) - idNumber(a)).slice(0, cap);
  const out = await readEach(wanted, (id) => readRequest(id), 2);
  const rows: Request[] = [];
  for (const o of out) if (o.status === "fulfilled" && o.value.data) rows.push(o.value.data);
  if (wanted.length && !rows.length && out.some((o) => o.status === "rejected")) throw (out.find((o) => o.status === "rejected") as PromiseRejectedResult).reason;
  return rows;
}

/** The thread's one-line status for whoever is looking. */
export function rowLine(r: Request, me: string | undefined, now: number, judging?: boolean): string {
  const clock = now || r.now;
  if (!(clock > 0)) return "";
  const role: Role = me && me === r.member ? "member" : me && me === r.provider ? "provider" : "visitor";
  return threadLine({
    role,
    now: clock,
    id: r.id,
    membership: r.membership,
    status: r.status,
    deadline: r.deadline,
    replies: r.replies.length,
    repliesLeft: r.repliesLeft,
    memberStatus: memberStatusOf(r),
    end: r.end,
    feeAtto: r.feeAtto,
    heldAtto: r.heldAtto,
    refundedAtto: r.refundedAtto,
    judging: judging ? "busy" : undefined,
  });
}

export function ThreadRow({ r, me, selected, judging }: { r: Request; me?: string; selected?: boolean; judging?: boolean }) {
  const now = useNow();
  const line = rowLine(r, me, now, judging);
  const stamp = latestStamp(r);
  const last = r.replies.length ? r.replies[r.replies.length - 1].text : r.message;
  const role = me && me === r.member ? "you cancelled" : me && me === r.provider ? "to your plan" : "";
  return (
    <li>
      <Link
        href={`/request/${r.id}`}
        aria-current={selected ? "page" : undefined}
        className={cx("relative block border-b border-line-soft px-4 py-3 hover:bg-hover", selected && "bg-postal-wash/60 hover:bg-postal-wash/80")}
      >
        {selected && <span aria-hidden="true" className="absolute top-0 bottom-0 left-0 w-[3px] bg-postal" />}
        <div className="flex items-baseline justify-between gap-2">
          <span className={cx("truncate text-[14px]", r.status === "open" ? "font-semibold" : "font-medium text-ink-2")}>{r.planName}</span>
          <Time at={lastAt(r)} className="shrink-0" />
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="truncate text-[13px]">
            {r.replies.length ? "Re: " : ""}Cancellation of <span className="mono">{r.membership}</span>
          </span>
          {stamp ? <StampTag kind={stamp} className="shrink-0" /> : <Pill tone="postal">awaiting reply</Pill>}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[12.5px] text-ink-3">{last}</p>
        {line && <p className="mt-1 text-[12.5px] leading-snug font-medium text-ink-2">{line}</p>}
        <p className="mt-1 text-[11.5px] text-ink-3">
          <span className="mono">{r.id}</span>
          {role && <> · {role}</>}
        </p>
      </Link>
    </li>
  );
}

/** The list pane beside a request: my threads when a wallet is connected, else the latest on the contract. */
export function ThreadList({ selected }: { selected?: string }) {
  const me = useMe();
  const read = useRead<{ rows: Request[]; mine: boolean }>(
    async (): Promise<ReadResult<{ rows: Request[]; mine: boolean }>> => {
      if (me.address) {
        const ids = (await readMine(me.address)).data;
        const all = [...ids.sent, ...ids.received];
        if (all.length) {
          const rows = await readRequests(all, 10);
          return { data: { rows, mine: true }, source: "chain" };
        }
      }
      const stats = (await readStats()).data;
      const recent = Array.from({ length: Math.min(8, stats.requests) }, (_, k) => "R" + (stats.requests - k));
      return { data: { rows: await readRequests(recent, 8), mine: false }, source: "chain" };
    },
    ["thread-list", me.address],
    { enabled: hasContract() },
  );
  useAfterTx(read.refresh);
  if (read.error) return <ReadError detail={read.error} onRetry={read.retry} className="m-3" />;
  if (!read.data) return <Placeholder lines={6} className="p-4" />;
  return (
    <div>
      <p className="border-b border-line-soft bg-frame/60 px-4 py-1.5 text-[11.5px] font-semibold tracking-wide text-ink-3 uppercase">
        {read.data.mine ? "Your threads, newest first" : "Latest threads on the contract"}
      </p>
      {read.data.rows.length ? (
        <ul>
          {read.data.rows.map((r) => (
            <ThreadRow key={r.id} r={r} me={me.address} selected={r.id === selected} />
          ))}
        </ul>
      ) : (
        <p className="px-4 py-3 text-sm text-ink-3">No cancellation has been sent yet.</p>
      )}
    </div>
  );
}
