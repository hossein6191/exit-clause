// How the held month moves, drawn as boxes and arrows: the member pays the fee, the contract holds it
// for the period, and it leaves to exactly one side. Static; the same drawing on the inbox and on /how.

import { IconArrowRight, IconLock } from "@/components/icons";
import { cx } from "@/lib/cx";

function Box({ title, body, tone = "plain", className }: { title: string; body: string; tone?: "plain" | "held" | "honoured" | "stalled"; className?: string }) {
  return (
    <div
      className={cx(
        "rounded-[8px] border px-3 py-2.5",
        tone === "plain" && "border-line bg-pane",
        tone === "held" && "border-ink/25 bg-frame",
        tone === "honoured" && "border-honoured/40 bg-honoured-wash",
        tone === "stalled" && "border-stalled/30 bg-stalled-wash",
        className,
      )}
    >
      <p className={cx("flex items-center gap-1.5 text-[13.5px] font-semibold", tone === "honoured" && "text-honoured-ink", tone === "stalled" && "text-stalled")}>
        {tone === "held" && <IconLock size={14} />}
        {title}
      </p>
      <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{body}</p>
    </div>
  );
}

function Arrow({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-1 py-1 text-ink-3 md:flex-col md:px-1 md:py-0" aria-hidden="true">
      <IconArrowRight className="rotate-90 md:rotate-0" />
      {label && <span className="mono text-[11px]">{label}</span>}
    </div>
  );
}

export function MoneyFlow({ fee = "0.5 GEN" }: { fee?: string }) {
  return (
    <figure aria-label="Where the fee goes" className="m-0">
      <div className="grid gap-0 md:grid-cols-[1fr_auto_1.1fr_auto_1.3fr] md:items-center">
        <Box title="The member joins" body={`and pays exactly the fee for one period: ${fee}.`} />
        <Arrow label={fee} />
        <Box tone="held" title="The contract holds it" body="for the whole period. Nobody can touch it, the provider included." />
        <Arrow />
        <div className="flex flex-col gap-2">
          <Box tone="honoured" title="To the provider, at the period's end" body="when the cancellation was honoured, or no cancellation was sent. Anyone may collect it once the period is over." />
          <Box tone="stalled" title="Back to the member, at once" body="when a reply stalled the cancellation, or the window closed without an honoured or stalled reply (lapse)." />
        </div>
      </div>
      <figcaption className="mt-2 text-[12.5px] text-ink-3">
        An unclear reply moves nothing: the provider may reply once more before the deadline. The model never sees an amount; only the stamp decides where the fee goes.
      </figcaption>
    </figure>
  );
}
