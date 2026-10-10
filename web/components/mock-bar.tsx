"use client";

// Mock mode only. There is no wallet and no chain: the visitor acts as one of the demo accounts of
// the in-memory contract, and this bar says so on every page, lets them change account, gives test
// GEN, and moves the clock on so a closed window or an ended period can be seen.

import { useLocal } from "@/components/use-local";
import { PERSONAS, advanceClock, mockAddress, mockBalanceText, mockClockOffset, setMockPersona } from "@/lib/chain-mock";
import { faucet } from "@/lib/chain";
import { gen, span } from "@/lib/format";

const small = "h-7 rounded-[5px] border border-ink/25 bg-pane px-2 text-xs font-medium hover:bg-hover active:translate-y-px";

export function MockBar() {
  const address = useLocal(mockAddress, PERSONAS[0].address);
  const balance = useLocal(() => mockBalanceText(mockAddress()), "0");
  const offset = useLocal(mockClockOffset, 0);
  return (
    <div className="border-b border-unclear/40 bg-unclear-wash">
      <div className="flex flex-col gap-2 px-4 py-2 text-xs xl:flex-row xl:items-center xl:justify-between">
        <p>
          <strong className="font-semibold">Demo build.</strong> An in-memory copy of the contract; the stamps are scripted, not read by validators. Nothing here is on chain,
          and a reload starts again.
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <label htmlFor="mock-persona" className="shrink-0 font-semibold">
            Acting as
          </label>
          <select
            id="mock-persona"
            value={address}
            onChange={(e) => setMockPersona(e.target.value)}
            className="h-7 max-w-full min-w-0 rounded-[5px] border border-ink/25 bg-pane px-1.5 text-xs"
          >
            {PERSONAS.map((p) => (
              <option key={p.address} value={p.address}>
                {p.name}: {p.note}
              </option>
            ))}
          </select>
          <span className="mono whitespace-nowrap">{gen(balance)}</span>
          <button type="button" onClick={() => void faucet(address)} className={small}>
            +10 GEN
          </button>
          <button type="button" onClick={() => advanceClock(300)} className={small}>
            Clock +5 min
          </button>
          <button type="button" onClick={() => advanceClock(3600)} className={small}>
            +1 h
          </button>
          <button type="button" onClick={() => advanceClock(86400)} className={small}>
            +1 day
          </button>
          {offset > 0 && <span className="text-ink-2">clock moved on {span(offset)}</span>}
        </div>
      </div>
    </div>
  );
}
