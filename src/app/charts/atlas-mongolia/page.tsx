import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { SiteHeader } from "@/components/atlas/site-header";
import { AtlasWeeklyChart } from "@/components/charts/atlas-weekly-chart";
import { createAdminClient } from "@/lib/supabase/admin";
import { atlasWeeklyPublic } from "@/lib/env";
import { getLocale } from "@/modules/i18n/server";

export const metadata: Metadata = { title: "Atlas Mongolia Top 50" };
export const dynamic = "force-dynamic";

// Public weekly chart. It ranks partly by YouTube views, so it stays off
// (404) until the owner sets ATLAS_WEEKLY_PUBLIC=true (decision D3).
export default async function AtlasMongoliaWeekly({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  if (!atlasWeeklyPublic()) notFound();
  const locale = await getLocale();
  const week = z.iso.date().safeParse((await searchParams).week);
  return (
    <main className="public-shell">
      <SiteHeader currentPath="/charts/atlas-mongolia" locale={locale} />
      <section className="chart-page-content">
        <AtlasWeeklyChart db={createAdminClient()} locale={locale} week={week.success ? week.data : undefined} basePath="/charts/atlas-mongolia" staff={false} />
      </section>
    </main>
  );
}
