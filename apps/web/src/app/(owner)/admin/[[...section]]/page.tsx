import { Admin } from "@/components/admin";
import { notFound } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  if ((await params).section?.[0] === "history") notFound();
  return <Admin />;
}
