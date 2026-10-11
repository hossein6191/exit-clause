"use client";

// My memberships: every membership the connected address holds, with its period, the fee the
// contract still holds and one line from lib/guide.ts on what it waits for and what is left to do,
// and every cancellation it sent, with the stamp on its last reply and the same one line.

import * as React from "react";
import Link from "next/link";

import { HeldChip, PeriodChip, Pill } from "@/components/chips";
import { IconPlus } from "@/components/icons";
import { Single } from "@/components/panes";
import { Placeholder, ReadError, readEach } from "@/components/read-state";
import { Section } from "@/components/section";
import { StampTag } from "@/components/stamp";
import { ThreadRow, latestStamp, readRequests } from "@/components/thread-list";
import { Time } from "@/components/thread";
import { ToolLink } from "@/components/tool-button";
import { WalletGate } from "@/components/wallet-gate";
import { useMe } from "@/components/use-me";
import { useNow } from "@/components/use-now";
import { useRead } from "@/components/use-read";
import { hasContract, membershipPhaseNow, readMembership, readMine } from "@/lib/chain";
import { gen } from "@/lib/format";
import { membershipLine, threadLine } from "@/lib/guide";
import { idNumber } from "@/lib/rules";
import type { Membership, ReadResult, Request } from "@/lib/types";

type Mine = { memberships: Membership[]; requests: Request[]; total: number };

const PHASE_WORD: Record<string, { text: string; tone: "plain" | "postal" | "honoured" | "stalled" | "unclear" }> = {
  running: { text: "live", tone: "plain" },
  cancelling: { text: "cancelling", tone: "postal" },
  cancelled: { text: "honoured, runs to its end", tone: "honoured" },
  due: { text: "period over, collectable", tone: "unclear" },
  refunded: { text: "refunded to you", tone: "stalled" },
  served: { text: "served, fee to the provider", tone: "plain" },
  unknown: { text: "no clock", tone: "plain" },
};

export default function MinePage() {
  const me = useMe();
  return (
    <Single>
      <p className="mono text-xs text-ink-3">Folder · My memberships</p>
      <h1 className="mt-1 text-2xl">My memberships</h1>
      <p className="mt-1 text-[14.5px] text-ink-2">What you joined, where each fee is right now, and every cancellation you sent.</p>
      {me.address ? (
        <MineBody address={me.address} />
      ) : (
        <Section title="Connect to see yours" hint="Memberships belong to an address; connect the wallet you joined with." className="mt-6">
          <WalletGate what="to see your memberships">{null}</WalletGate>
        </Section>
      )}
    </Single>
  );
}

function MineBody({ address }: { address: string }) {
  const now = useNow();
  const read = useRead<Mine>(
    async (): Promise<ReadResult<Mine>> => {
      const ids = (await readMine(address)).data;
      const memIds = [...ids.memberships].sort((a, b) => idNumber(b) - idNumber(a)).slice(0, 12);
      const memberships: Membership[] = [];
      for (const r of await readEach(memIds, (id) => readMembership(id), 2)) if (r.status === "fulfilled" && r.value.data) memberships.push(r.value.data);
      const requests = await readRequests(ids.sent, 10);
      return { data: { memberships, requests, total: ids.memberships.length }, source: "chain" };
    },
    ["mine-page", address],
    { enabled: hasContract() },
  );
  if (read.error) return <ReadError detail={read.error} onRetry={read.retry} className="mt-6" />;
  if (!read.data) return <Placeholder lines={6} className="mt-6" />;
  const { memberships, requests, total } = read.data;
  return (
    <>
      <Section
        title="Memberships"
        hint={`One row per period you paid for, newest first${total > memberships.length ? ` (the newest ${memberships.length} of ${total})` : ""}.`}
        className="mt-6"
        aside={
          <ToolLink href="/plans" size="sm" icon={<IconPlus size={14} />}>
            Join a plan
          </ToolLink>
        }
      >
        {memberships.length ? (
          <ul className="overflow-hidden rounded-[8px] border border-line">
            {memberships.map((m) => {
              const phase = membershipPhaseNow(m, now || m.now);
              const word = PHASE_WORD[phase] ?? PHASE_WORD.unknown;
              const req = requests.find((r) => r.id === m.request);
              const stamp = req ? latestStamp(req) : null;
              const clock = now || m.now;
              const line = !(clock > 0)
                ? ""
                : req
                  ? threadLine({
                      role: "member",
                      now: clock,
                      id: req.id,
                      membership: m.id,
                      status: req.status,
                      deadline: req.deadline,
                      replies: req.replies.length,
                      repliesLeft: req.repliesLeft,
                      memberStatus: m.status,
                      end: m.end,
                      feeAtto: m.feeAtto,
                      heldAtto: m.heldAtto,
                      refundedAtto: m.refundedAtto,
                      collectedAtto: m.collectedAtto,
                    })
                  : membershipLine({
                      now: clock,
                      id: m.id,
                      status: m.status,
                      end: m.end,
                      feeAtto: m.feeAtto,
                      heldAtto: m.heldAtto,
                      refundedAtto: m.refundedAtto,
                      collectedAtto: m.collectedAtto,
                      request: m.request,
                    });
              return (
                <li key={m.id} className="border-b border-line-soft last:border-b-0">
                  <Link href={m.request ? `/request/${m.request}` : `/plan/${m.plan}`} className="block px-4 py-3 hover:bg-hover">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[14px] font-semibold">{m.planName}</span>
                      <span className="mono text-[13px]">{gen(m.feeAtto)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-3">
                      <span className="mono">{m.id}</span>
                      <span>· joined</span>
                      <Time at={m.start} />
                      <Pill tone={word.tone}>{word.text}</Pill>
                      {stamp && <StampTag kind={stamp} />}
                    </div>
                    {line && <p className="mt-1 text-[13px] leading-snug font-medium text-ink-2">{line}</p>}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <HeldChip heldAtto={m.heldAtto} until={m.end} />
                      {(phase === "running" || phase === "cancelled" || phase === "cancelling") && <PeriodChip end={m.end} />}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-ink-3">This address holds no membership yet. The pinned demo plans are the quickest start.</p>
        )}
      </Section>
      <Section title="Cancellations you sent" hint="Each thread with the stamp on its last reply. Open one to see the whole exchange.">
        {requests.length ? (
          <ul className="overflow-hidden rounded-[8px] border border-line">
            {requests.map((r) => (
              <ThreadRow key={r.id} r={r} me={address} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-3">No cancellation sent from this address yet.</p>
        )}
      </Section>
    </>
  );
}
