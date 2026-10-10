import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Provider desk",
  description: "Open a plan, reply to cancellations on your plans and collect the fees of served periods.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
