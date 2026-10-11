"use client";

// The demo provider's state, said plainly: online and replying by itself, or offline and exactly why
// (no key set, or a key that is not a 0x private key of 64 hex characters).

import { useDemoStatus } from "@/components/use-demo";
import { Addr } from "@/components/addr";
import { cx } from "@/lib/cx";

export function DemoNote({ className, online }: { className?: string; online?: React.ReactNode }) {
  const s = useDemoStatus();
  if (!s) return <p className={cx("text-sm text-ink-3", className)}>Asking the site&apos;s server about the demo provider…</p>;
  if (s.online)
    return (
      <p className={cx("text-sm text-ink-2", className)}>
        <span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-full bg-honoured align-middle" />
        The demo provider is online{s.provider && <> as <Addr address={s.provider} /></>}. {online}
      </p>
    );
  return (
    <div role="status" className={cx("rounded-[8px] border border-postal/30 bg-postal-wash px-3 py-2 text-sm", className)}>
      <p>
        <strong className="font-semibold">The demo provider is offline:</strong> {s.reason}.
      </p>
      <p className="mt-0.5 text-ink-2">
        Its plans still take members and cancellations, and a cancellation nobody answers lapses by rule: anyone may send the fee back once the reply window closes.
      </p>
    </div>
  );
}
