// THE RULE, quoted as the contract holds it: one rule, the same for every provider, which no provider can change.

import { THE_RULE } from "@/lib/rules";
import { cx } from "@/lib/cx";

export function RuleBlock({ className }: { className?: string }) {
  return (
    <figure className={cx("m-0 rounded-[8px] border border-line border-l-[4px] border-l-postal bg-pane px-4 py-3", className)}>
      <figcaption className="mono text-[11px] font-bold tracking-[0.08em] text-postal-ink">THE RULE · SAME FOR EVERY PROVIDER · FIXED IN THE CONTRACT</figcaption>
      <blockquote className="mt-1.5 text-[15px] leading-relaxed text-ink">&ldquo;{THE_RULE}&rdquo;</blockquote>
    </figure>
  );
}
