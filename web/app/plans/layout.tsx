import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Plans",
  description: "Every plan as an inbox row: fee, period, reply window and live members. The demo provider's three are pinned.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
