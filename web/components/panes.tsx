// The panes of the mail client. On a wide screen a list pane sits beside the reading pane, each
// scrolling on its own inside the grey frame; on a phone only one of them shows, and the reading
// pane carries a back arrow to the list.

import * as React from "react";
import Link from "next/link";

import { IconArrowLeft } from "@/components/icons";
import { cx } from "@/lib/cx";

/** A list pane and a reading pane side by side. `show` picks the one a phone sees. */
export function Split({
  list,
  reading,
  show,
  listLabel,
  back,
}: {
  list: React.ReactNode;
  reading: React.ReactNode;
  show: "list" | "reading";
  listLabel: string;
  /** the back arrow on a phone: a link, or a button that switches to the list */
  back?: { href: string; label: string } | { onClick: () => void; label: string };
}) {
  return (
    <div className="lg:grid lg:h-full lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] lg:gap-2 lg:p-2">
      <section
        aria-label={listLabel}
        className={cx(
          "border-line bg-pane lg:block lg:min-h-0 lg:overflow-y-auto lg:rounded-[8px] lg:border",
          show === "list" ? "block border-b" : "hidden",
        )}
      >
        {list}
      </section>
      <div
        className={cx(
          "min-w-0 bg-pane lg:block lg:min-h-0 lg:overflow-y-auto lg:rounded-[8px] lg:border lg:border-line",
          show === "reading" ? "block" : "hidden",
        )}
      >
        {back && <BackBar back={back} />}
        {reading}
      </div>
    </div>
  );
}

function BackBar({ back }: { back: { href: string; label: string } | { onClick: () => void; label: string } }) {
  const cls = "flex h-10 items-center gap-1.5 px-3 text-sm font-medium text-ink-2 hover:text-ink";
  return (
    <div className="sticky top-0 z-10 border-b border-line bg-pane/95 backdrop-blur lg:hidden">
      {"href" in back ? (
        <Link href={back.href} className={cls}>
          <IconArrowLeft />
          {back.label}
        </Link>
      ) : (
        <button type="button" onClick={back.onClick} className={cls}>
          <IconArrowLeft />
          {back.label}
        </button>
      )}
    </div>
  );
}

/** One wide reading pane, for the folders that are not a list of messages. */
export function Single({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="lg:h-full lg:p-2">
      <div className="min-h-full bg-pane lg:h-full lg:overflow-y-auto lg:rounded-[8px] lg:border lg:border-line">
        <div className={cx("mx-auto px-4 py-5 sm:px-6 sm:py-6", wide ? "max-w-5xl" : "max-w-3xl")}>{children}</div>
      </div>
    </div>
  );
}

/** The padded column inside a reading pane. */
export function ReadingBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-6", className)}>{children}</div>;
}

/** The header of a list pane: the folder's name, one line of what is in it, and room for a control. */
export function ListHead({ title, hint, aside }: { title: string; hint: string; aside?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-10 border-b border-line bg-pane/95 px-4 py-3 backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base">{title}</h2>
        {aside}
      </div>
      <p className="mt-0.5 text-[12.5px] text-ink-3">{hint}</p>
    </div>
  );
}
