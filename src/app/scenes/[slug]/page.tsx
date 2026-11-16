import { TermDetailPage } from "@/components/browse/term-pages";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <TermDetailPage section="scenes" slug={(await params).slug} />;
}
