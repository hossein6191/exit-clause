import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My memberships",
  description: "What you joined, where each fee is now, and every cancellation you sent.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
