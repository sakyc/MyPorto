import { notFound } from "next/navigation";
import { getContent } from "@/lib/content";
import { PublishedPortfolio } from "@/components/published-portfolio";
export const revalidate = 3600;
export async function generateStaticParams() {
  return (await getContent()).projects.map((p) => ({ slug: p.slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const p = (await getContent()).projects.find((p) => p.slug === slug);
  return {
    title: p?.title || "Project not found",
    description: p?.description,
    alternates: { canonical: "/projects/" + slug },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const content = await getContent();
  if (!content.projects.some((p) => p.slug === slug)) notFound();
  return <PublishedPortfolio view="detail" slug={slug} />;
}
