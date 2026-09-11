import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "STLS Studio — Traffic Engineering",
};

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
