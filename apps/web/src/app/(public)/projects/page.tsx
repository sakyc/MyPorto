import { PublishedPortfolio } from "@/components/published-portfolio";
export const metadata = {
  title: "Projects",
  alternates: { canonical: "/projects" },
};
export const revalidate = 3600;
export default async function Page() {
  return <PublishedPortfolio view="archive" />;
}
