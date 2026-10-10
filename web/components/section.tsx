// A section of a reading pane: a title and one line that says what happens here, then its content.

import * as React from "react";

import { cx } from "@/lib/cx";

export function Section({
  title,
  hint,
  id,
  aside,
  className,
  children,
}: {
  title: string;
  /** one line: what happens here */
  hint: string;
  id?: string;
  aside?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={cx("border-t border-line-soft py-5 first:border-t-0 first:pt-0", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id={headingId} className="text-[15px]">
            {title}
          </h2>
          <p className="mt-0.5 text-[13px] text-ink-3">{hint}</p>
        </div>
        {aside}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </section>
  );
}
