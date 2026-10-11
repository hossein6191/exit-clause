"use client";

// Every plan as an inbox row: name, fee, period, reply window and live members. The demo provider's
// plans are pinned on top; any visitor can join one and try the whole thread alone. With no plan
// selected, the reading pane lists the demo plans by the story each one tells and the stamp to expect.

import Link from "next/link";

import { IconDesk } from "@/components/icons";
import { ListHead, ReadingBody, Split } from "@/components/panes";
import { PlanRows, usePlans } from "@/components/plan-list";
import { StampTag } from "@/components/stamp";
import { useDemoStatus } from "@/components/use-demo";
import { RuleBlock } from "@/components/rule-block";
import { Section } from "@/components/section";
import { ToolLink } from "@/components/tool-button";
import { DemoNote } from "@/components/demo-status";
import { DEMO_PLANS, isDemoPlan } from "@/lib/demo-plans";
import { gen, windowLabel } from "@/lib/format";

export default function PlansPage() {
  return (
    <Split
      listLabel="Plans"
      show="list"
      list={
        <>
          <ListHead
            title="Plans"
            hint="Pick a plan to read it and join. The pinned demo plans answer cancellations by themselves."
            aside={
              <ToolLink href="/provider" size="sm" icon={<IconDesk size={14} />}>
                Open one
              </ToolLink>
            }
          />
          <h1 className="sr-only">Plans</h1>
          <PlanRows />
        </>
      }
      reading={
        <ReadingBody>
          <p className="mono text-xs text-ink-3">No plan selected</p>
          <p className="mt-1 text-xl font-semibold">Pick a plan on the left to read it.</p>
          <Section title="Every plan is bound by the same rule" hint="The provider sets the fee, the period and the reply window; never the rule." className="mt-5">
            <RuleBlock />
          </Section>
          <DemoStories />
        </ReadingBody>
      }
    />
  );
}

/** The demo plans by the story each tells: the provider's habit and the stamp to expect, linked once open on chain. */
function DemoStories() {
  const read = usePlans();
  const demo = useDemoStatus();
  const rows = read.data?.rows ?? [];
  const idOf = (name: string) => rows.find((r) => r.name === name && r.status === "open" && !!demo?.provider && isDemoPlan(r, demo.provider))?.id ?? "";
  // Once the plans are read, only the demo plans open on chain are listed; until then, all of them.
  const listed = read.data && demo?.online ? DEMO_PLANS.filter((p) => idOf(p.name)) : DEMO_PLANS;
  return (
    <Section title="Pick a story" hint="Same rule, one scripted reply each. Every period is fifteen minutes, so you can also watch a held fee being collected.">
      <ul className="grid gap-2">
        {(listed.length ? listed : DEMO_PLANS).map((p) => {
          const id = idOf(p.name);
          const head = (
            <>
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{p.name}</span>
                <span className="mono text-[13px]">{gen(p.feeAtto)}</span>
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
                <span>The provider {p.habit}.</span>
                <span className="text-ink-3">Expect</span>
                <StampTag kind={p.expect} />
              </span>
              <span className="mt-0.5 block text-[12.5px] text-ink-3">
                {id ? <span className="mono">{id} · </span> : null}
                {windowLabel(p.period)} period, {windowLabel(p.window)} to reply.
              </span>
            </>
          );
          return (
            <li key={p.key}>
              {id ? (
                <Link href={`/plan/${id}`} className="block rounded-[8px] border border-line px-3 py-2.5 text-sm hover:border-ink-3/50 hover:bg-hover">
                  {head}
                </Link>
              ) : (
                <div className="rounded-[8px] border border-line px-3 py-2.5 text-sm">{head}</div>
              )}
            </li>
          );
        })}
      </ul>
      <DemoNote className="mt-3" />
    </Section>
  );
}
