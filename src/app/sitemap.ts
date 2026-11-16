import type { MetadataRoute } from "next";
import { getPublications } from "@/modules/newsroom/public";
import { getArchive } from "@/modules/charts/history";
import { getTerms } from "@/modules/context/browse-data";
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
    "/genres",
    "/themes",
    "/scenes",
  ];
  const terms = await Promise.all(
    (["genre", "theme", "scene"] as const).map((d) =>
      getTerms(d, "en")
        .then((list) => list.map((t) => `/${d === "genre" ? "genres" : d === "theme" ? "themes" : "scenes"}/${t.slug}`))
        .catch(() => [] as string[]),
    ),
  );
  const archive = await getArchive().catch(() => ({ snapshots: [] }));
  const news = await getPublications().catch(() => ({ articles: [] }));
  return [
    ...news.articles.map((article) => ({
      url: `${base}/news/${article.id}`,
      lastModified: article.published_at,
    })),
    ...pages.map((path) => ({ url: base + path })),
    ...terms.flat().map((path) => ({ url: base + path })),
    ...archive.snapshots.map((s) => ({
      url: `${base}/charts/apple-music-mongolia?date=${s.snapshot_date}`,
      lastModified: s.collected_at,
    })),
  ];
}
