"use client";

// The waiting panel: what is happening right now and who it waits for, then four short lines like the
// header of a letter (how long, what is needed from you, whether you can leave, where the money is),
// a counter, and the next button when there is one. The words come from lib/guide.ts, the same for
// every in-between state of the site. A page shows one at a time, where its action happens; the panel
// scrolls itself into view when it first appears, so a visitor who pressed a button lower down still
// sees it (a calm state does not move the page). Five tones: busy (a transaction or the demo provider is at work; the airmail edge moves),
// clock (the period or a window must pass; a countdown), late (it is taking longer than it should,
// with a way out), ready (the wait is over and the next button is here) and done (closed; where the
// money ended up).

import * as React from "react";

import { IconCheck, IconClock, IconExternal, IconHourglass, IconPin } from "@/components/icons";
import { StepLine } from "@/components/thread";
import { useWallNow } from "@/components/use-now";
import { cx } from "@/lib/cx";
import type { Guide } from "@/lib/guide";

export type WaitTone = "busy" | "clock" | "late" | "ready" | "done";

/** The four lines under the title, from a guide. */
export type WaitLines = { time: string; need: string; leave: string; canLeave: boolean; money: string };

export type Wait = {
  /** a stable name for the state, e.g. "demo-writing"; written on the panel for tests and tools */
  id: string;
  tone: WaitTone;
  /** the small capitals above the title; each tone has its own when this is left out */
  kicker?: string;
  title: string;
  body?: React.ReactNode;
  /** how long, what is needed, whether to stay, where the money is */
  lines?: WaitLines;
  /** browser-clock seconds when the wait began: an elapsed counter runs from it */
  since?: number;
  /** seconds left on the contract's clock: a countdown in place of the elapsed counter */
  left?: number;
  /** what the countdown counts to, e.g. "until collect opens" */
  leftLabel?: string;
  link?: { href: string; label: string };
  action?: React.ReactNode;
  /** a step line inside the panel, for a page that has none of its own yet: the number of steps done */
  step?: number;
};

const KICKER: Record<WaitTone, string> = {
  busy: "In progress",
  clock: "Waiting for the clock",
  late: "Taking longer than it should",
  ready: "Ready",
  done: "Closed",
};

/** A guide from lib/guide.ts as a panel, with what only the page has: the button, the link, the counter's start. */
export function waitOf(g: Guide, extra: Pick<Wait, "action" | "link" | "since" | "step"> = {}): Wait {
  return {
    id: g.id,
    tone: g.tone,
    kicker: g.kicker,
    title: g.now,
    body: g.note || undefined,
    lines: { time: g.time, need: g.need, leave: g.leave, canLeave: g.canLeave, money: g.money },
    left: g.left !== undefined && g.left > 0 ? g.left : undefined,
    leftLabel: g.leftLabel,
    ...extra,
  };
}

/** "0:42", "12:05", "1:02:09"; longer than a day, "2 d 3 h". */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  if (d > 0) {
    const h = Math.floor((s % 86400) / 3600);
    return h ? `${d} d ${h} h` : `${d} d`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function WaitPanel({ wait, className }: { wait: Wait; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const wall = useWallNow();

  // A transaction or a late wait comes into view when it starts; a calm state (the clock, a closed
  // thread) never moves the page under a reader who just opened it.
  const moving = wait.tone === "busy" || wait.tone === "late";
  React.useEffect(() => {
    const el = ref.current;
    if (!moving || !el || typeof el.scrollIntoView !== "function") return;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [wait.id, moving]);

  const tone = wait.tone;
  const counter =
    wait.left !== undefined
      ? { text: clockText(wait.left), label: wait.leftLabel ?? "left" }
      : wait.since && wall
        ? { text: clockText(wall - wait.since), label: "elapsed" }
        : null;
  const Icon = tone === "ready" || tone === "done" ? IconCheck : tone === "clock" ? IconClock : IconHourglass;
  const lines = wait.lines;

  return (
    <div
      ref={ref}
      data-wait={wait.id}
      className={cx(
        "scroll-mt-4 scroll-mb-4 overflow-hidden rounded-[8px] border bg-pane",
        tone === "busy" && "border-postal/50",
        tone === "clock" && "border-line",
        tone === "late" && "border-unclear/60",
        tone === "ready" && "border-honoured/50",
        tone === "done" && "border-line",
        className,
      )}
    >
      {(tone === "busy" || tone === "clock") && (
        <div aria-hidden="true" className={cx("airmail", tone === "busy" && "airmail-run", tone === "clock" && "opacity-60")}>
          <span />
        </div>
      )}
      {tone === "late" && <div aria-hidden="true" className="h-[5px] bg-unclear" />}
      {tone === "ready" && <div aria-hidden="true" className="h-[5px] bg-honoured" />}
      {tone === "done" && <div aria-hidden="true" className="h-[3px] bg-ink-3/50" />}
      <div className="px-4 pt-3 pb-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0" role="status" aria-live="polite" aria-atomic="true">
            <p
              className={cx(
                "mono flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] uppercase",
                tone === "busy" && "text-postal-ink",
                tone === "clock" && "text-ink-3",
                tone === "late" && "text-unclear-ink",
                tone === "ready" && "text-honoured-ink",
                tone === "done" && "text-ink-3",
              )}
            >
              <Icon size={13} />
              {wait.kicker ?? KICKER[tone]}
            </p>
            <p className="mt-1 text-[16.5px] leading-snug font-semibold text-ink">{wait.title}</p>
          </div>
          {counter && (
            <div className="shrink-0 text-right">
              <p className="mono text-[22px] leading-none font-semibold text-ink">{counter.text}</p>
              <p className="mt-1 text-[11px] text-ink-3">{counter.label}</p>
            </div>
          )}
        </div>
        {wait.step !== undefined && <StepLine done={wait.step} busy={tone !== "ready"} className="mt-4 mb-1" />}
        {wait.body && <div className="mt-2 text-[14px] leading-relaxed text-ink-2">{wait.body}</div>}
        {lines && (
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-t border-line-soft pt-2.5 text-[13.5px] leading-snug">
            <dt className="field-label pt-px">How long</dt>
            <dd className="flex min-w-0 items-start gap-1.5 text-ink-2">
              <IconClock size={14} className="mt-[2px] shrink-0 text-ink-3" />
              <span>{lines.time}</span>
            </dd>
            <dt className="field-label pt-px">From you</dt>
            <dd className="min-w-0 font-medium text-ink">{lines.need}</dd>
            <dt className="field-label pt-px">Leave?</dt>
            <dd className={cx("flex min-w-0 items-start gap-1.5", lines.canLeave ? "text-ink-2" : "font-medium text-postal-ink")}>
              <IconPin size={14} className={cx("mt-[2px] shrink-0", lines.canLeave ? "text-ink-3" : "text-postal")} />
              <span>{lines.leave}</span>
            </dd>
            <dt className="field-label pt-px">Money</dt>
            <dd className="min-w-0 text-ink-2">{lines.money}</dd>
          </dl>
        )}
        {(wait.action || wait.link) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {wait.action}
            {wait.link && (
              <a href={wait.link.href} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 text-[13px] text-ink-2">
                {wait.link.label}
                <IconExternal size={12} />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
