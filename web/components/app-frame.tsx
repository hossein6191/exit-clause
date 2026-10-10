"use client";

// The mail-client frame around every page: a header with the mark and the wallet, a left rail of
// folders (Inbox, Plans, My memberships, Provider desk, Ledger, How it works) and the panes. On a
// phone the rail is a drawer behind the menu button, and the pages show one pane at a time.

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { IconCard, IconCross, IconDesk, IconExternal, IconHelp, IconInbox, IconLedger, IconMenu, IconPlans, IconPlus } from "@/components/icons";
import { Wordmark } from "@/components/logo";
import { MockBar } from "@/components/mock-bar";
import { ToolLink } from "@/components/tool-button";
import { useDemoStatus } from "@/components/use-demo";
import { useMe } from "@/components/use-me";
import { useAfterTx, useRead } from "@/components/use-read";
import { WalletButton, WrongChainBanner } from "@/components/wallet";
import { addressUrl, contractInUse, hasContract, isMock, readMembershipsOf, readStats } from "@/lib/chain";
import { REPO_URL } from "@/lib/config";
import { cx } from "@/lib/cx";
import { gen, short } from "@/lib/format";

type Folder = { href: string; label: string; icon: React.ReactNode; match: (p: string) => boolean; count?: "plans" | "mine" };

const FOLDERS: Folder[] = [
  { href: "/", label: "Inbox", icon: <IconInbox />, match: (p) => p === "/" },
  { href: "/plans", label: "Plans", icon: <IconPlans />, match: (p) => p === "/plans" || p.startsWith("/plan/"), count: "plans" },
  { href: "/mine", label: "My memberships", icon: <IconCard />, match: (p) => p === "/mine" || p.startsWith("/request/"), count: "mine" },
  { href: "/provider", label: "Provider desk", icon: <IconDesk />, match: (p) => p === "/provider" },
  { href: "/ledger", label: "Ledger", icon: <IconLedger />, match: (p) => p === "/ledger" },
  { href: "/how", label: "How it works", icon: <IconHelp />, match: (p) => p === "/how" },
];

function Rail({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname() || "/";
  const me = useMe();
  const stats = useRead(() => readStats(), ["rail-stats"], { enabled: hasContract() });
  const mine = useRead(() => readMembershipsOf(me.address), ["rail-mine", me.address], { enabled: hasContract() && !!me.address });
  useAfterTx(stats.refresh);
  useAfterTx(mine.refresh);
  const demo = useDemoStatus();
  const counts = { plans: stats.data?.plans, mine: mine.data?.memberships.length };
  const contract = contractInUse();
  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <ToolLink href="/plans" variant="ink" block icon={<IconPlus />} onClick={onNavigate}>
        Try a demo plan
      </ToolLink>
      <ul className="flex flex-col gap-0.5" aria-label="Folders">
        {FOLDERS.map((f) => {
          const on = f.match(path);
          const count = f.count ? counts[f.count] : undefined;
          return (
            <li key={f.href}>
              <Link
                href={f.href}
                onClick={onNavigate}
                aria-current={on ? "page" : undefined}
                className={cx(
                  "relative flex h-8 items-center gap-2.5 rounded-[6px] px-2.5 text-sm",
                  on ? "bg-pane font-semibold text-ink shadow-[0_0_0_1px_var(--color-line)]" : "text-ink-2 hover:bg-frame-deep",
                )}
              >
                {on && <span aria-hidden="true" className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r bg-postal" />}
                <span className={on ? "text-postal" : "text-ink-3"}>{f.icon}</span>
                <span className="flex-1 truncate">{f.label}</span>
                {count !== undefined && count > 0 && <span className="mono text-xs text-ink-3">{count}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
      <dl className="mt-auto space-y-2 border-t border-line pt-3 text-xs text-ink-3">
        <div>
          <dt className="font-medium text-ink-2">Contract</dt>
          <dd>
            {contract ? (
              <a href={addressUrl(contract)} target="_blank" rel="noreferrer" className="mono link inline-flex items-center gap-1">
                {short(contract)}
                <IconExternal size={11} />
              </a>
            ) : (
              "not deployed yet"
            )}
            {isMock && " (in memory)"}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink-2">Network</dt>
          <dd>GenLayer Studio · chain 61999</dd>
        </div>
        <div>
          <dt className="font-medium text-ink-2">Demo provider</dt>
          <dd className="flex items-center gap-1.5">
            <span aria-hidden="true" className={cx("size-2 rounded-full", demo?.online ? "bg-honoured" : demo ? "bg-postal" : "bg-line")} />
            {demo ? (demo.online ? "online, replies by itself" : "offline: " + demo.reason) : "asking…"}
          </dd>
        </div>
        {REPO_URL && (
          <div>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
              Source code <IconExternal size={11} />
            </a>
          </div>
        )}
      </dl>
    </div>
  );
}

/** In mock mode there is no wallet: the header shows who the visitor is acting as, chosen in the bar below. */
function MockWho() {
  const me = useMe();
  return (
    <span className="flex h-7 items-center gap-2 rounded-[6px] border border-line bg-pane px-2.5 text-[13px]" title="Change it in the demo bar below the header">
      <span aria-hidden="true" className="size-2 rounded-full bg-unclear" />
      <span className="mono">{short(me.address)}</span>
      <span className="mono hidden text-ink-3 sm:inline">{gen(me.balanceAtto)}</span>
    </span>
  );
}

export function AppFrame({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = React.useState(false);
  const closeDrawer = React.useCallback(() => setDrawer(false), []);
  React.useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-pane px-2 sm:px-3">
        <button
          type="button"
          onClick={() => setDrawer(true)}
          aria-label="Open the folders"
          aria-expanded={drawer}
          className="flex size-8 items-center justify-center rounded-[6px] text-ink-2 hover:bg-hover lg:hidden"
        >
          <IconMenu size={18} />
        </button>
        <Link href="/" className="rounded-[4px] px-1" aria-label="Exit Clause, the inbox">
          <Wordmark />
        </Link>
        <span className="hidden text-[13px] text-ink-3 md:inline">Cancel anytime, enforced.</span>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-[5px] border border-line px-2 py-0.5 text-xs text-ink-3 sm:flex">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-honoured" />
            Studio · 61999
          </span>
          {isMock ? <MockWho /> : <WalletButton />}
        </div>
      </header>
      {isMock && <MockBar />}
      <WrongChainBanner />
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Folders" className="hidden w-[214px] shrink-0 overflow-y-auto border-r border-line bg-frame lg:block">
          <Rail />
        </nav>
        <main id="main" className="min-w-0 flex-1 lg:overflow-hidden">
          {children}
        </main>
      </div>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Folders">
          <button type="button" aria-label="Close the folders" onClick={closeDrawer} className="absolute inset-0 bg-ink/35" />
          <nav className="absolute top-0 left-0 flex h-full w-[264px] max-w-[85vw] flex-col border-r border-line bg-frame shadow-xl">
            <div className="flex h-12 items-center justify-between border-b border-line bg-pane px-3">
              <Wordmark />
              <button type="button" onClick={closeDrawer} aria-label="Close the folders" className="flex size-8 items-center justify-center rounded-[6px] hover:bg-hover">
                <IconCross size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Rail onNavigate={closeDrawer} />
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
