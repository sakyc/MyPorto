import { getContent } from "@/lib/content";
import { designContent } from "@/lib/design-content";
import { renderDesign } from "@/design/templates";
import { Portfolio } from "./portfolio";
export async function PublishedPortfolio({
  view = "",
  slug = "",
}: {
  view?: string;
  slug?: string;
}) {
  const content = await getContent();
  return (
    <Portfolio
      content={content}
      initialView={view}
      markup={renderDesign(designContent(content), slug)}
    />
  );
}
