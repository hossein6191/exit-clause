"use client";

// A row of one-click suggestions under a field: press one and the field is filled with it.

import { cx } from "@/lib/cx";

export function Suggest<T>({
  label,
  chips,
  onPick,
  isOn,
  className,
}: {
  label: string;
  chips: { label: string; value: T }[];
  onPick: (value: T) => void;
  isOn?: (value: T) => boolean;
  className?: string;
}) {
  return (
    <div className={cx("mt-1.5 flex flex-wrap items-center gap-1.5", className)} role="group" aria-label={label}>
      {chips.map((c) => {
        const on = isOn?.(c.value) ?? false;
        return (
          <button
            key={c.label}
            type="button"
            aria-pressed={isOn ? on : undefined}
            onClick={() => onPick(c.value)}
            className={cx(
              "rounded-[5px] border px-2 py-0.5 text-[12.5px] leading-5 active:translate-y-px",
              on ? "border-ink bg-ink text-white" : "border-line bg-pane text-ink-2 hover:border-ink-3/60 hover:bg-hover",
            )}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
