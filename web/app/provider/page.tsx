"use client";

// The provider desk. Open a plan (one of three samples, or your own terms, every field one click
// away), see the plans you run, the cancellations sent to them (reply on each thread), and collect
// the fees of periods that have ended with nothing open on them.

import * as React from "react";
import Link from "next/link";

import { Pill } from "@/components/chips";
import { DemoNote } from "@/components/demo-status";
import { IconArrowRight, IconCollect, IconPlus } from "@/components/icons";
import { Single } from "@/components/panes";
import { Placeholder, ReadError, readEach } from "@/components/read-state";
import { Section } from "@/components/section";
import { Suggest } from "@/components/suggest";
import { ThreadRow, readRequests } from "@/components/thread-list";
import { ToolButton, ToolLink } from "@/components/tool-button";
import { TxRail } from "@/components/tx-rail";
import { WalletGate } from "@/components/wallet-gate";
import { useMe } from "@/components/use-me";
import { useNow } from "@/components/use-now";
import { useRead } from "@/components/use-read";
import { useTx } from "@/components/use-tx";
import { calls, hasContract, membershipPhaseNow, openedPlan, readMembership, readMine, readPlan } from "@/lib/chain";
import { SAMPLE_PLANS } from "@/lib/demo-plans";
import { gen, genText, tryAtto, windowLabel } from "@/lib/format";
import { MAX_NAME, feeProblem, idNumber, nameProblem, periodProblem, plain, windowProblem } from "@/lib/rules";
import { FEE_CHIPS, NAME_CHIPS, PERIOD_CHIPS, WINDOW_CHIPS } from "@/lib/suggestions";
import { rememberTx } from "@/lib/tx-memory";
import type { Call, Membership, Plan, ReadResult, Request, TxStatus } from "@/lib/types";

type Desk = { plans: Plan[]; requests: Request[]; due: Membership[] };

export default function ProviderPage() {
  return (
    <Single>
      <p className="mono text-xs text-ink-3">Folder · Provider desk</p>
      <h1 className="mt-1 text-2xl">Provider desk</h1>
      <p className="mt-1 text-[14.5px] text-ink-2">
        Open a plan with your own fee, period and reply window. The rule is the same for every provider; you choose the terms, never the rule.
      </p>
      <OpenPlan />
      <MyDesk />
      <Section title="The demo provider" hint="The site's own provider runs the pinned demo plans and replies to their cancellations by itself.">
        <DemoNote />
      </Section>
    </Single>
  );
}

function Field({ label, htmlFor, help, problem, children }: { label: string; htmlFor: string; help: string; problem?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-[13px] font-medium">
        {label}
      </label>
      <div className="mt-1">{children}</div>
      <p className="mt-1 text-xs text-ink-3">
        {help}
        {problem && <span className="text-postal-ink"> {problem.charAt(0).toUpperCase() + problem.slice(1)}.</span>}
      </p>
    </div>
  );
}

function OpenPlan() {
  const [name, setName] = React.useState("");
  const [fee, setFee] = React.useState("");
  const [period, setPeriod] = React.useState("");
  const [windowMin, setWindowMin] = React.useState("");
  const [opened, setOpened] = React.useState("");
  const tx = useTx((s: TxStatus, hash: string) => {
    const id = openedPlan(s);
    if (id) {
      rememberTx(id, hash, `Opening ${id}`);
      setOpened(id);
    }
  });

  const plainName = plain(name);
  const feeAtto = tryAtto(fee);
  const periodS = /^\d+$/.test(period.trim()) ? Number(period) * 60 : NaN;
  const windowS = /^\d+$/.test(windowMin.trim()) ? Number(windowMin) * 60 : NaN;
  const problems = {
    name: name ? nameProblem(plainName) : "",
    fee: fee ? (feeAtto === null ? "enter an amount like 0.5" : feeProblem(feeAtto)) : "",
    period: period ? (Number.isNaN(periodS) ? "enter whole minutes" : periodProblem(periodS)) : "",
    window: windowMin ? (Number.isNaN(windowS) ? "enter whole minutes" : windowProblem(windowS)) : "",
  };
  const ready = !!plainName && feeAtto !== null && !Number.isNaN(periodS) && !Number.isNaN(windowS) && !Object.values(problems).some(Boolean);

  const fill = (p: (typeof SAMPLE_PLANS)[number]) => {
    setName(p.name);
    setFee(genText(p.feeAtto));
    setPeriod(String(p.period / 60));
    setWindowMin(String(p.window / 60));
  };

  return (
    <Section title="Open a plan" hint="One transaction; the sender is the provider. Members join it from their own wallets." className="mt-6">
      <p className="text-[13px] font-medium">Start from a sample</p>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
        {SAMPLE_PLANS.map((p) => (
          <button key={p.key} type="button" onClick={() => fill(p)} className="rounded-[8px] border border-line bg-pane px-3 py-2 text-left hover:bg-hover active:translate-y-px">
            <span className="block text-[13.5px] font-semibold">{p.name}</span>
            <span className="mono block text-[12.5px]">{gen(p.feeAtto)}</span>
            <span className="block text-xs text-ink-3">{p.note}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-4">
        <Field label="Name" htmlFor="plan-name" help={`3 to ${MAX_NAME} characters. One open plan per name per address.`} problem={problems.name}>
          <input id="plan-name" className="field" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!problems.name} autoComplete="off" />
          <Suggest label="Suggested names" chips={NAME_CHIPS.map((n) => ({ label: n, value: n }))} onPick={setName} isOn={(v) => v === name} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Fee for one period (GEN)" htmlFor="plan-fee" help="0.1 to 100 GEN, held until each period ends." problem={problems.fee}>
            <input id="plan-fee" className="field mono" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} aria-invalid={!!problems.fee} autoComplete="off" />
            <Suggest label="Suggested fees" chips={FEE_CHIPS.map((c) => ({ label: c.label, value: genText(c.value) }))} onPick={setFee} isOn={(v) => v === fee} />
          </Field>
          <Field label="Period (minutes)" htmlFor="plan-period" help="5 minutes to 90 days." problem={problems.period}>
            <input id="plan-period" className="field mono" inputMode="numeric" value={period} onChange={(e) => setPeriod(e.target.value)} aria-invalid={!!problems.period} autoComplete="off" />
            <Suggest label="Suggested periods" chips={PERIOD_CHIPS.map((c) => ({ label: c.label, value: String(c.value / 60) }))} onPick={setPeriod} isOn={(v) => v === period} />
          </Field>
          <Field label="Reply window (minutes)" htmlFor="plan-window" help="5 minutes to 14 days." problem={problems.window}>
            <input id="plan-window" className="field mono" inputMode="numeric" value={windowMin} onChange={(e) => setWindowMin(e.target.value)} aria-invalid={!!problems.window} autoComplete="off" />
            <Suggest label="Suggested reply windows" chips={WINDOW_CHIPS.map((c) => ({ label: c.label, value: String(c.value / 60) }))} onPick={setWindowMin} isOn={(v) => v === windowMin} />
          </Field>
        </div>
        {ready && (
          <p className="text-[13px] text-ink-2">
            {plainName}: <span className="mono">{gen(feeAtto!)}</span> for {windowLabel(periodS)}, {windowLabel(windowS)} to reply to a cancellation.
          </p>
        )}
        <div>
          <WalletGate what="to open a plan">
            <ToolButton variant="ink" icon={<IconPlus />} disabled={!ready || tx.sending} onClick={() => void tx.start(calls.openPlan(plainName, feeAtto!, periodS, windowS))}>
              Open plan
            </ToolButton>
          </WalletGate>
        </div>
        {(tx.hash || tx.error) && (
          <div>
            {tx.hash && <TxRail hash={tx.hash} label={`Opening ${plainName || "a plan"}`} onDone={tx.onDone} />}
            {tx.error && (
              <p role="alert" className="mt-2 text-sm text-postal-ink">
                {tx.error}
              </p>
            )}
            {opened && (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-honoured-ink">
                Opened <span className="mono">{opened}</span>.
                <ToolLink href={`/plan/${opened}`} size="sm" icon={<IconArrowRight size={14} />}>
                  Open {opened}
                </ToolLink>
              </p>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

function MyDesk() {
  const me = useMe();
  const now = useNow();
  const read = useRead<Desk>(
    async (): Promise<ReadResult<Desk>> => {
      const ids = (await readMine(me.address)).data;
      const planIds = [...ids.provides].sort((a, b) => idNumber(b) - idNumber(a)).slice(0, 6);
      const plans: Plan[] = [];
      for (const r of await readEach(planIds, (id) => readPlan(id), 2)) if (r.status === "fulfilled" && r.value.data) plans.push(r.value.data);
      const requests = await readRequests(ids.received, 8);
      // Only the newest memberships of each plan can still be due; older ones were collected or refunded.
      const memIds = plans.flatMap((p) => p.memberships.slice(-4)).sort((a, b) => idNumber(b) - idNumber(a)).slice(0, 8);
      const due: Membership[] = [];
      for (const r of await readEach(memIds, (id) => readMembership(id), 2)) if (r.status === "fulfilled" && r.value.data && r.value.data.heldAtto !== "0") due.push(r.value.data);
      return { data: { plans, requests, due }, source: "chain" };
    },
    ["desk", me.address],
    { enabled: hasContract() && !!me.address },
  );
  const tx = useTx((s: TxStatus, hash: string, call: Call) => {
    rememberTx(String(call.args[0]), hash, `Collecting ${call.args[0]} for the provider`);
    void read.refresh();
  });

  if (!me.address)
    return (
      <Section title="Your plans and their cancellations" hint="Connect the wallet you opened plans with to see them here.">
        <WalletGate what="to see the plans you run">{null}</WalletGate>
      </Section>
    );
  if (read.error)
    return (
      <Section title="Your plans and their cancellations" hint="Read from the contract for the connected address.">
        <ReadError detail={read.error} onRetry={read.retry} />
      </Section>
    );
  if (!read.data)
    return (
      <Section title="Your plans and their cancellations" hint="Read from the contract for the connected address.">
        <Placeholder lines={5} />
      </Section>
    );
  const { plans, requests, due } = read.data;
  const collectable = due.filter((m) => membershipPhaseNow(m, now || m.now) === "due");
  const open = requests.filter((r) => r.status === "open");
  return (
    <>
      <Section title="Your plans" hint="The plans this address opened, newest first. Closing one stops new members; every membership runs to its end.">
        {plans.length ? (
          <ul className="divide-y divide-line-soft rounded-[8px] border border-line">
            {plans.map((p) => (
              <li key={p.id}>
                <Link href={`/plan/${p.id}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 hover:bg-hover">
                  <span className="min-w-0">
                    <span className="mono text-[12.5px] text-ink-3">{p.id}</span> <span className="font-semibold">{p.name}</span>
                  </span>
                  <span className="flex items-center gap-2 text-[12.5px] text-ink-2">
                    <span className="mono">{gen(p.feeAtto)}</span> · {p.live} live · held <span className="mono">{gen(p.heldAtto)}</span>
                    {p.status === "closed" && <Pill>closed</Pill>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-3">This address runs no plan yet. Open one above.</p>
        )}
      </Section>
      <Section title="Cancellations to your plans" hint={`Reply on each thread before its deadline. ${open.length} waiting.`}>
        {requests.length ? (
          <ul className="overflow-hidden rounded-[8px] border border-line">
            {[...open, ...requests.filter((r) => r.status !== "open")].map((r) => (
              <ThreadRow key={r.id} r={r} me={me.address} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-3">No member has sent a cancellation to your plans.</p>
        )}
      </Section>
      <Section title="Collect served periods" hint="A period that ended with nothing open on it: its held fee goes to you. Anyone may send this; the fee goes to the provider either way.">
        {collectable.length ? (
          <ul className="flex flex-col gap-2">
            {collectable.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-line px-3 py-2 text-sm">
                <span>
                  <span className="mono">{m.id}</span> on {m.planName} · <span className="mono">{gen(m.heldAtto)}</span>
                </span>
                <ToolButton size="sm" icon={<IconCollect size={14} />} disabled={tx.sending} onClick={() => void tx.start(calls.collect(m.id))}>
                  Collect
                </ToolButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-3">Nothing to collect right now. A fee becomes collectable once its period has ended with no cancellation open.</p>
        )}
        {(tx.hash || tx.error) && (
          <div className="mt-3">
            {tx.hash && tx.call && <TxRail hash={tx.hash} label={`Collecting ${tx.call.args[0]} for the provider`} onDone={tx.onDone} />}
            {tx.error && (
              <p role="alert" className="mt-2 text-sm text-postal-ink">
                {tx.error}
              </p>
            )}
          </div>
        )}
      </Section>
    </>
  );
}
