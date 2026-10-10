// The mark (an envelope with an arrow leaving it) and the name, as the header shows them.

import { INK, POSTAL } from "@/lib/mark";

export function Mark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className={className}>
      <rect x="3.5" y="8.5" width="19" height="15" rx="2" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
      <path d="M4.5 10 L13 16.5 L21.5 10" fill="none" stroke={INK} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M17 20 H28.5" fill="none" stroke={POSTAL} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M24.5 16 L28.5 20 L24.5 24" fill="none" stroke={POSTAL} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <Mark />
      <span className="text-[15px] font-semibold tracking-[-0.01em]">Exit Clause</span>
    </span>
  );
}
