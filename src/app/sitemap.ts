import type { MetadataRoute } from "next";
import { getPublications } from "@/modules/newsroom/public";
import { getArchive } from "@/modules/charts/history";
export const revalidate = 3600;
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const pages = [
    "",
    "/artists",
    "/news",
    "/about",
    "/methodology",
    "/charts/apple-music-mongolia",
    "/charts/apple-music-mongolia/archive",
  ];
  const archive = await getArchive().catch(() => ({ snapshots: [] }));
  const news = await getPublications().catch(() => ({ articles: [] }));
  return [
    ...news.articles.map((article) => ({
      url: `${base}/news/${article.id}`,
      lastModified: article.published_at,
    })),
    ...pages.map((path) => ({ url: base + path })),
    ...archive.snapshots.map((s) => ({
      url: `${base}/charts/apple-music-mongolia?date=${s.snapshot_date}`,
      lastModified: s.collected_at,
    })),
  ];
}
