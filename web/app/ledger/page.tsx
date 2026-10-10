"use client";

// The ledger: the contract's totals (no figure is kept per provider) and the latest stamps, read
// live. The balance line checks the one invariant the money rests on: the contract holds exactly the
// fees of the memberships not yet refunded or collected.

import * as React from "react";

import { Single } from "@/components/panes";
import { Placeholder, ReadError } from "@/components/read-state";
import { Section } from "@/components/section";
import { ThreadRow, readRequests } from "@/components/thread-list";
import { useMe } from "@/components/use-me";
import { useRead } from "@/components/use-read";
import { contractInUse, hasContract, readStats } from "@/lib/chain";
import { gen } from "@/lib/format";
import { cx } from "@/lib/cx";

function Tile({ label, value, note, tone }: { label: string; value: React.ReactNode; note?: string; tone?: "honoured" | "stalled" | "unclear" }) {
  return (
    <div className="rounded-[8px] border border-line px-3 py-2.5">
      <dt className="field-label">{label}</dt>
      <dd className={cx("mono mt-0.5 text-xl font-semibold", tone === "honoured" && "text-honoured-ink", tone === "stalled" && "text-stalled", tone === "unclear" && "text-unclear-ink")}>{value}</dd>
      {note && <dd className="mt-0.5 text-[12px] text-ink-3">{note}</dd>}
    </div>
  );
}

export default function LedgerPage() {
  const me = useMe();
  const stats = useRead(() => readStats(), ["ledger-stats"], { enabled: hasContract() });
  const count = stats.data?.requests ?? 0;
  const recent = useRead(
    async () => ({ data: await readRequests(Array.from({ length: Math.min(12, count) }, (_, k) => "R" + (count - k)), 12), source: "chain" as const }),
    ["ledger-recent", count],
    { enabled: hasContract() && count > 0 },
  );
  const s = stats.data;
  return (
    <Single wide>
      <p className="mono text-xs text-ink-3">Folder · Ledger</p>
      <h1 className="mt-1 text-2xl">Ledger</h1>
      <p className="mt-1 text-[14.5px] text-ink-2">
        Totals read live from the contract <span className="mono text-[13px]">{contractInUse() ? contractInUse().slice(0, 10) + "…" : ""}</span>. No figure here is kept per provider.
      </p>
      {stats.error ? (
        <ReadError detail={stats.error} onRetry={stats.retry} className="mt-6" />
      ) : !s ? (
        <Placeholder lines={6} className="mt-6" />
      ) : (
        <>
          <Section title="Stamps" hint="Every reply gets one word from the network; a window that ran out lapses by rule." className="mt-6">
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile label="Honoured" value={s.honoured} tone="honoured" note="the reply confirmed it" />
              <Tile label="Stalled" value={s.stalled} tone="stalled" note="month refunded at once" />
              <Tile label="Lapsed" value={s.lapsed} tone="stalled" note="no answer in time" />
              <Tile label="Unclear replies" value={s.unclearReplies} tone="unclear" note={`of ${s.replies} replies read`} />
            </dl>
          </Section>
          <Section title="Money" hint="Where the fees are now. The contract's balance is always exactly what it holds.">
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile label="Held now" value={gen(s.heldAtto)} note="fees of running periods" />
              <Tile label="Back to members" value={gen(s.refundedAtto)} note={`${s.refunds} refunds`} />
              <Tile label="To providers" value={gen(s.collectedAtto)} note={`${s.collections} collections`} />
              <Tile label="Refused joins" value={s.refusedJoins} note={`${gen(s.returnedAtto)} returned in the same tx`} />
            </dl>
          </Section>
          <Section title="Activity" hint="Plans opened, memberships paid and cancellations sent, since the contract was deployed.">
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile label="Plans" value={s.plans} note={`${s.closedPlans} closed`} />
              <Tile label="Memberships" value={s.memberships} />
              <Tile label="Cancellations" value={s.requests} />
              <Tile label="Open right now" value={s.openRequests} note="waiting for a reply or a lapse" />
            </dl>
          </Section>
          <Section title="Latest stamps" hint="The newest cancellations on the contract, each with the stamp on its last reply.">
            {count === 0 ? (
              <p className="text-sm text-ink-3">No cancellation has been sent yet.</p>
            ) : recent.error ? (
              <ReadError detail={recent.error} onRetry={recent.retry} />
            ) : !recent.data ? (
              <Placeholder lines={5} />
            ) : (
              <ul className="overflow-hidden rounded-[8px] border border-line">
                {recent.data.map((r) => (
                  <ThreadRow key={r.id} r={r} me={me.address} />
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </Single>
  );
}
