// The site's buttons are mail-toolbar buttons: compact rectangles with an icon and a label, 6 px
// corners, a hairline border, a subtle inset when pressed and a clear focus ring. One variant is the
// solid postal red of "Send cancellation"; one solid ink for the other main step of a page.

import * as React from "react";
import Link from "next/link";

import { cx } from "@/lib/cx";

export type ToolVariant = "postal" | "ink" | "plain" | "quiet";
type Size = "sm" | "md";

const base =
  "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] border font-medium transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
  "active:translate-y-px active:shadow-[inset_0_1px_3px_rgba(17,24,39,0.22)] " +
  "disabled:cursor-not-allowed disabled:opacity-55 disabled:active:translate-y-0 disabled:active:shadow-none";

const variants: Record<ToolVariant, string> = {
  postal: "border-postal-ink bg-postal text-white shadow-[0_1px_0_rgba(17,24,39,0.08)] hover:bg-postal-ink",
  ink: "border-ink bg-ink text-white shadow-[0_1px_0_rgba(17,24,39,0.08)] hover:bg-ink-2",
  plain: "border-line bg-pane text-ink shadow-[0_1px_0_rgba(17,24,39,0.05)] hover:border-ink-3/50 hover:bg-hover",
  quiet: "border-transparent bg-transparent text-ink-2 hover:bg-frame-deep",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[13px]",
  md: "h-9 px-3.5 text-sm",
};

type Common = { variant?: ToolVariant; size?: Size; icon?: React.ReactNode; block?: boolean; className?: string; children?: React.ReactNode };

export function ToolButton({
  variant = "plain",
  size = "md",
  icon,
  block,
  className,
  children,
  type = "button",
  ...rest
}: Common & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">) {
  return (
    <button type={type} className={cx(base, variants[variant], sizes[size], block && "w-full", className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}

export function ToolLink({
  href,
  variant = "plain",
  size = "md",
  icon,
  block,
  className,
  children,
  external,
  onClick,
}: Common & { href: string; external?: boolean; onClick?: () => void }) {
  const cls = cx(base, variants[variant], sizes[size], block && "w-full", className);
  if (external)
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {icon}
        {children}
      </a>
    );
  return (
    <Link href={href} className={cls} onClick={onClick}>
      {icon}
      {children}
    </Link>
  );
}
