import { DesignLayout } from "@/components/design-layout";
export const metadata = {
  title: "RF / Admin",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <DesignLayout admin>{children}</DesignLayout>;
}
