// The site's icons: one line weight, 20-unit grid, drawn in currentColor. Decorative by default
// (aria-hidden); the button or link they sit in carries the words.

import * as React from "react";

type IconProps = { className?: string; size?: number };

function Svg({ className, size = 16, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export const IconInbox = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 11.5 5 4h10l2 7.5V16H3z" />
    <path d="M3 11.5h4.2l1 2h3.6l1-2H17" />
  </Svg>
);
export const IconPlans = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3.5" width="14" height="4" rx="1" />
    <rect x="3" y="9.5" width="14" height="4" rx="1" />
    <path d="M5 16.5h10" />
  </Svg>
);
export const IconCard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" />
    <circle cx="7" cy="9.3" r="1.7" />
    <path d="M4.6 13.2c.6-1.3 1.4-1.9 2.4-1.9s1.8.6 2.4 1.9M11.5 8.5h4M11.5 11.5h3" />
  </Svg>
);
export const IconLedger = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 3.5h10.5a1.5 1.5 0 0 1 1.5 1.5v11.5H5.5A1.5 1.5 0 0 1 4 15z" />
    <path d="M4 15a1.5 1.5 0 0 1 1.5-1.5H16M7.5 7h5M7.5 10h3" />
  </Svg>
);
export const IconHelp = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="7" />
    <path d="M8 8a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2v.5" />
    <path d="M10 14h.01" />
  </Svg>
);
export const IconDesk = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="6" width="15" height="10" rx="1.5" />
    <path d="M7.5 6V4.5A1 1 0 0 1 8.5 3.5h3a1 1 0 0 1 1 1V6M2.5 10.5h15" />
  </Svg>
);
export const IconSend = (p: IconProps) => (
  <Svg {...p}>
    <path d="M17.5 2.5 8.6 11.4" />
    <path d="M17.5 2.5 12 17.5l-3.4-6.1L2.5 8z" />
  </Svg>
);
export const IconReply = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 5 3.5 9.5 8 14" />
    <path d="M3.5 9.5H12a4.5 4.5 0 0 1 4.5 4.5v1.5" />
  </Svg>
);
export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 6v4.2l2.6 1.6" />
  </Svg>
);
export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="9" width="12" height="8" rx="1.5" />
    <path d="M6.8 9V6.5a3.2 3.2 0 0 1 6.4 0V9" />
  </Svg>
);
export const IconArrowLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16 10H4.5M9 5 4 10l5 5" />
  </Svg>
);
export const IconArrowRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10h11.5M11 5l5 5-5 5" />
  </Svg>
);
export const IconExternal = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11.5 3.5h5v5M16.5 3.5 9.5 10.5" />
    <path d="M14.5 12v3.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1H8" />
  </Svg>
);
export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4 10.5 4 4 8-9" />
  </Svg>
);
export const IconCross = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 5 10 10M15 5 5 15" />
  </Svg>
);
export const IconWallet = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H15a1 1 0 0 1 1 1v1.5" />
    <rect x="3" y="7.5" width="14" height="9" rx="1.5" />
    <path d="M13.5 12h.01" />
  </Svg>
);
export const IconMenu = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" />
  </Svg>
);
export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16 10a6 6 0 1 1-1.8-4.3" />
    <path d="M16 3.5v3.7h-3.7" />
  </Svg>
);
export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 4v12M4 10h12" />
  </Svg>
);
export const IconHourglass = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 3h9M5.5 17h9M6.5 3c0 4 7 4 7 7s-7 3-7 7M13.5 3c0 4-7 4-7 7s7 3 7 7" />
  </Svg>
);
export const IconCollect = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 3v9M6.5 8.5 10 12l3.5-3.5" />
    <path d="M3.5 12.5v3a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3" />
  </Svg>
);
export const IconDoor = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 17V3.5h8V17M3 17h14" />
    <path d="M10.5 10.5h.01" />
  </Svg>
);
export const IconCoin = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="7" />
    <path d="M12.2 7.6c-.4-.7-1.2-1.1-2.2-1.1-1.3 0-2.2.7-2.2 1.7 0 2.3 4.6 1.2 4.6 3.6 0 1-1 1.7-2.4 1.7-1 0-1.9-.4-2.3-1.2M10 5v1.5M10 13.5V15" />
  </Svg>
);
export const IconFaucet = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 6.5h7.5a3 3 0 0 1 3 3V11M7 4v2.5M5 4h4" />
    <path d="M13.5 14c0 1.2-.7 2-1.5 2s-1.5-.8-1.5-2 1.5-3 1.5-3 1.5 1.8 1.5 3z" />
  </Svg>
);
export const IconUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10" cy="7" r="3.2" />
    <path d="M3.8 16.5c1.1-2.7 3.4-4.2 6.2-4.2s5.1 1.5 6.2 4.2" />
  </Svg>
);
export const IconPin = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 3.5h6l-1 4 3 3H5l3-3zM10 10.5V17" />
  </Svg>
);
