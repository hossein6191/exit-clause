"use client";

// The transactions this browser sent or asked for on one plan or one request, each linked to the
// explorer. The contract cannot list them; the browser that sent them can.

import { IconExternal } from "@/components/icons";
import { Time } from "@/components/thread";
import { useLocal } from "@/components/use-local";
import { isMock, txUrl } from "@/lib/chain";
import { parseRemembered, rememberedRaw } from "@/lib/tx-memory";

export function TxList({ thread, also }: { thread: string; also?: string }) {
  const raw = useLocal(() => rememberedRaw(thread), "");
  const rawAlso = useLocal(() => (also ? rememberedRaw(also) : ""), "");
  const seen = new Set<string>();
  const list = [...parseRemembered(raw), ...parseRemembered(rawAlso)]
    .filter((r) => (seen.has(r.hash) ? false : (seen.add(r.hash), true)))
    .sort((a, b) => b.at - a.at);
  if (!list.length) return <p className="text-sm text-ink-3">Nothing sent from this browser yet. Each transaction you send here is listed with its explorer link.</p>;
  return (
    <ul className="divide-y divide-line-soft rounded-[8px] border border-line">
      {list.map((r) => (
        <li key={r.hash} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
          <span className="min-w-0">{r.label}</span>
          <span className="flex items-center gap-3">
            <Time at={r.at} />
            <a href={txUrl(r.hash)} target="_blank" rel="noreferrer" className="mono link inline-flex items-center gap-1 text-xs text-ink-2">
              {isMock ? "demo tx " : ""}
              {r.hash.slice(0, 10)}…
              <IconExternal size={12} />
            </a>
          </span>
        </li>
      ))}
    </ul>
  );
}
