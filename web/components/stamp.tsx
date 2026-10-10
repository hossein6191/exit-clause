// The rubber stamp drawn over a provider's reply once the network has judged it: HONOURED in green,
// STALLED or LAPSED with the month refunded in deep red, UNCLEAR in amber. It lands once, in 150 ms,
// when it first appears on a page that was already open; anyone who asks for reduced motion sees it
// already in place.

import { STAMPS, type StampKind } from "@/lib/rules";
import { cx } from "@/lib/cx";

export function Stamp({ kind, fresh, large, flat, className }: { kind: StampKind; fresh?: boolean; large?: boolean; flat?: boolean; className?: string }) {
  const s = STAMPS[kind];
  return (
    <span className={cx("stamp", `stamp-${s.tone}`, large && "stamp-lg", flat && "stamp-flat", fresh && "stamp-in", className)} role="img" aria-label={`Stamp: ${s.text.replace("·", "-")}`}>
      {s.text}
    </span>
  );
}

/** The stamp as a small flat label, for rows in a list. */
export function StampTag({ kind, className }: { kind: StampKind; className?: string }) {
  const s = STAMPS[kind];
  return (
    <span
      className={cx(
        "mono inline-flex items-center rounded-[4px] border px-1.5 text-[10.5px] leading-[18px] font-bold tracking-[0.06em] whitespace-nowrap",
        s.tone === "honoured" && "border-honoured/50 bg-honoured-wash text-honoured-ink",
        s.tone === "stalled" && "border-stalled/40 bg-stalled-wash text-stalled",
        s.tone === "unclear" && "border-unclear/50 bg-unclear-wash text-unclear-ink",
        className,
      )}
    >
      {s.text.split(" · ")[0]}
    </span>
  );
}
