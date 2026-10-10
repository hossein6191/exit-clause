// The route's own browser title, from the URL alone: no chain read, and a made-up id never reaches the title.
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const m = /^P?([1-9]\d{0,8})$/i.exec(id);
  return {
    title: m ? `Plan P${m[1]}` : "Plan",
    description: "One plan: its fee, period and reply window, the rule it is bound by, and your membership and its cancellation.",
  };
}

export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
