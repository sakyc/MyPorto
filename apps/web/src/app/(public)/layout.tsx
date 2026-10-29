import type { Metadata } from "next";
import { DesignLayout } from "@/components/design-layout";
export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || "http://localhost:3000"),
  title: { default: "Rifki Fadhil — Fullstack Developer", template: "%s | RF" },
  description:
    "Rifki Muhammad Fadhil — fullstack developer in Indonesia. Explore projects, tools, and experience.",
  openGraph: { type: "website", locale: "en_US", siteName: "RF Portfolio" },
  robots: { index: true, follow: true },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <DesignLayout>{children}</DesignLayout>;
}
