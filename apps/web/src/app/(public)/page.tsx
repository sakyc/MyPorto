import { PublishedPortfolio } from "@/components/published-portfolio";
import { getContent } from "@/lib/content";
export const revalidate = 3600;
export async function generateMetadata() {
  const { settings } = await getContent();
  return {
    title: settings.siteTitle,
    description: settings.profile.description,
    alternates: { canonical: "/" },
    openGraph: {
      title: settings.siteTitle,
      description: settings.profile.description,
    },
  };
}
export default async function Page() {
  return <PublishedPortfolio />;
}
