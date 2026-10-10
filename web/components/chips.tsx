"use client";

// The small chips of the thread and the membership: the reply deadline counting down on an open
// request, the fee held until the period ends on a live membership, and a few status words.

import { IconClock, IconHourglass, IconLock } from "@/components/icons";
import { useNow } from "@/components/use-now";
import { clockTime, gen, span } from "@/lib/format";
import { cx } from "@/lib/cx";

const chip = "inline-flex max-w-full items-center gap-1.5 rounded-[5px] border px-2 py-0.5 text-[12.5px] leading-5";

/** On an open request: how long the provider has left to reply, then that anyone may lapse it. */
export function DeadlineChip({ deadline, className }: { deadline: number; className?: string }) {
  const now = useNow();
  if (!now || !deadline) return null;
  const left = deadline - now;
  if (left > 0)
    return (
      <span className={cx(chip, left < 120 ? "border-postal/40 bg-postal-wash text-postal-ink" : "border-line bg-pane text-ink-2", className)}>
        <IconClock size={14} />
        <span>
          reply due in <span className="mono font-medium">{span(left)}</span>
        </span>
      </span>
    );
  return (
    <span className={cx(chip, "border-stalled/40 bg-stalled-wash text-stalled", className)}>
      <IconHourglass size={14} />
      <span>
        window closed <span className="mono">{span(-left)}</span> ago · anyone may lapse it
      </span>
    </span>
  );
}

/** On a membership whose fee the contract still holds: how much, and until when. */
export function HeldChip({ heldAtto, until, className }: { heldAtto: string; until: number; className?: string }) {
  const now = useNow();
  if (!heldAtto || heldAtto === "0") return null;
  const over = now > 0 && now >= until;
  return (
    <span className={cx(chip, "border-ink/15 bg-frame text-ink", className)} title="The contract holds this fee; it reaches the provider only once the period has ended.">
      <IconLock size={14} />
      <span className="mono">
        held: {gen(heldAtto)} {over ? "· period over" : `until ${clockTime(until, now || undefined)}`}
      </span>
    </span>
  );
}

/** How long a period has left, or that it is over. */
export function PeriodChip({ end, className }: { end: number; className?: string }) {
  const now = useNow();
  if (!now || !end) return null;
  const left = end - now;
  return (
    <span className={cx(chip, "border-line bg-pane text-ink-2", className)}>
      <IconClock size={14} />
      {left > 0 ? (
        <span>
          period ends in <span className="mono font-medium">{span(left)}</span>
        </span>
      ) : (
        <span>period ended {clockTime(end, now)}</span>
      )}
    </span>
  );
}

export function Pill({ tone = "plain", children, className }: { tone?: "plain" | "postal" | "honoured" | "stalled" | "unclear" | "ink"; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-[4px] border px-1.5 text-[11.5px] leading-[18px] font-medium whitespace-nowrap",
        tone === "plain" && "border-line bg-pane text-ink-2",
        tone === "postal" && "border-postal/40 bg-postal-wash text-postal-ink",
        tone === "honoured" && "border-honoured/40 bg-honoured-wash text-honoured-ink",
        tone === "stalled" && "border-stalled/40 bg-stalled-wash text-stalled",
        tone === "unclear" && "border-unclear/50 bg-unclear-wash text-unclear-ink",
        tone === "ink" && "border-ink bg-ink text-white",
        className,
      )}
    >
      {children}
    </span>
  );
}
