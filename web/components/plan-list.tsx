"use client";

// The plans as inbox rows: name, fee, period, reply window and live members, the demo provider's
// three pinned on top. Used by /plans as the whole list and beside a plan as the list pane.

import * as React from "react";
import Link from "next/link";

import { Pill } from "@/components/chips";
import { IconPin } from "@/components/icons";
import { Placeholder, ReadError } from "@/components/read-state";
import { useDemoStatus } from "@/components/use-demo";
import { useAfterTx, useRead } from "@/components/use-read";
import { readPlansWindow } from "@/lib/chain";
import { demoPlanByName, isDemoPlan } from "@/lib/demo-plans";
import { gen, windowLabel } from "@/lib/format";
import type { PlanRow } from "@/lib/types";
import { cx } from "@/lib/cx";

export function usePlans() {
  const read = useRead(() => readPlansWindow(), ["plans-window"]);
  useAfterTx(read.refresh);
  return read;
}

function Row({ p, selected, demo }: { p: PlanRow; selected: boolean; demo: boolean }) {
  const habit = demo ? demoPlanByName(p.name)?.habit : "";
  return (
    <li>
      <Link
        href={`/plan/${p.id}`}
        aria-current={selected ? "page" : undefined}
        className={cx("relative block border-b border-line-soft px-4 py-3 hover:bg-hover", selected && "bg-postal-wash/60 hover:bg-postal-wash/80")}
      >
        {selected && <span aria-hidden="true" className="absolute top-0 bottom-0 left-0 w-[3px] bg-postal" />}
        <div className="flex items-baseline justify-between gap-3">
          <span className={cx("truncate text-[14px]", p.status === "open" ? "font-semibold" : "text-ink-2")}>{p.name}</span>
          <span className="mono shrink-0 text-[13px] font-medium">{gen(p.feeAtto)}</span>
        </div>
        <p className="mt-0.5 text-[12.5px] text-ink-3">
          {habit ? <>The provider {habit}.</> : <>A period of {windowLabel(p.period)}; replies within {windowLabel(p.replyWindow)}.</>}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-3">
          <span className="mono">{p.id}</span>
          <span aria-hidden="true">·</span>
          <span>
            {windowLabel(p.period)} period · {windowLabel(p.replyWindow)} to reply
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <span className="mono">{p.live}</span> live
          </span>
          {demo && <Pill tone="postal">demo provider</Pill>}
          {p.status === "closed" && <Pill>closed</Pill>}
        </div>
      </Link>
    </li>
  );
}

export function PlanRows({ selected }: { selected?: string }) {
  const read = usePlans();
  const demo = useDemoStatus();
  if (read.error) return <ReadError detail={read.error} onRetry={read.retry} className="m-3" />;
  if (!read.data) return <Placeholder lines={6} className="p-4" />;
  const rows = read.data.rows;
  if (!rows.length) return <p className="p-4 text-sm text-ink-2">No plan has been opened yet. The provider desk opens one in a single transaction.</p>;
  const isDemo = (p: PlanRow) => !!demo?.provider && isDemoPlan(p, demo.provider);
  const pinned = rows.filter(isDemo).sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  const rest = rows.filter((p) => !isDemo(p));
  return (
    <div>
      {pinned.length > 0 && (
        <>
          <p className="flex items-center gap-1.5 border-b border-line-soft bg-frame/60 px-4 py-1.5 text-[11.5px] font-semibold tracking-wide text-ink-3 uppercase">
            <IconPin size={13} /> Pinned · try these alone
          </p>
          <ul>
            {pinned.map((p) => (
              <Row key={p.id} p={p} selected={p.id === selected} demo />
            ))}
          </ul>
        </>
      )}
      <p className="border-b border-line-soft bg-frame/60 px-4 py-1.5 text-[11.5px] font-semibold tracking-wide text-ink-3 uppercase">
        {pinned.length ? "Every other plan, newest first" : "Every plan, newest first"}
      </p>
      {rest.length ? (
        <ul>
          {rest.map((p) => (
            <Row key={p.id} p={p} selected={p.id === selected} demo={false} />
          ))}
        </ul>
      ) : (
        <p className="px-4 py-3 text-sm text-ink-3">None yet besides the demo plans.</p>
      )}
      {read.data.partial && <p className="px-4 py-3 text-xs text-ink-3">The oldest plans are not listed here; open one by its id, e.g. /plan/P1.</p>}
    </div>
  );
}
