"use client";

// Every plan as an inbox row: name, fee, period, reply window and live members. The demo provider's
// three are pinned on top; any visitor can join one and try the whole thread alone.

import { IconDesk } from "@/components/icons";
import { ListHead, ReadingBody, Split } from "@/components/panes";
import { PlanRows } from "@/components/plan-list";
import { RuleBlock } from "@/components/rule-block";
import { Section } from "@/components/section";
import { ToolLink } from "@/components/tool-button";
import { DemoNote } from "@/components/demo-status";
import { DEMO_PLANS } from "@/lib/demo-plans";
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
            hint="Pick a plan to read it and join. The pinned three answer cancellations by themselves."
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
          <Section title="The three demo plans" hint="Same rule, three habits. Each period is fifteen minutes, so you can also watch a held fee being collected.">
            <ul className="grid gap-2">
              {DEMO_PLANS.map((p) => (
                <li key={p.key} className="rounded-[8px] border border-line px-3 py-2.5 text-sm">
                  <p className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">{p.name}</span>
                    <span className="mono text-[13px]">{gen(p.feeAtto)}</span>
                  </p>
                  <p className="mt-0.5 text-[13px] text-ink-2">
                    The provider {p.habit}. A period of {windowLabel(p.period)}, {windowLabel(p.window)} to reply.
                  </p>
                </li>
              ))}
            </ul>
            <DemoNote className="mt-3" />
          </Section>
        </ReadingBody>
      }
    />
  );
}
