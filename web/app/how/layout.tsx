import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How it decides",
  description: "Two askings, one stored word, and where the held fee goes for each word.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
