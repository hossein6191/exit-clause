import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ledger",
  description: "The contract's totals and the latest stamps, read live.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
