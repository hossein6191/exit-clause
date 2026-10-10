// The route's own browser title, from the URL alone: no chain read, and a made-up id never reaches the title.
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const m = /^R?([1-9]\d{0,8})$/i.exec(id);
  return {
    title: m ? `Cancellation R${m[1]}` : "Cancellation",
    description: "One cancellation as a thread: the member's message, each reply with the stamp the network put on it, and where the fee went.",
  };
}

export default function RequestLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
