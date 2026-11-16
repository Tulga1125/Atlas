import Link from "next/link";
import { SiteHeader } from "@/components/atlas/site-header";
import { getPublications } from "@/modules/newsroom/public";
import { getLocale } from "@/modules/i18n/server";
export const metadata = { title: "News and insights" };
export default async function News({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const locale = await getLocale();
  const { cursor } = await searchParams;
  const { articles, nextCursor } = await getPublications(cursor);
  return (
    <main className="public-shell">
      <SiteHeader currentPath="/news" locale={locale} />
      <section className="editorial-page">
        <p className="eyebrow">Atlas Charts</p>
        <h1>{locale === "mn" ? "Мэдээ, тойм" : "News and insights"}</h1>
        {!articles.length && (
          <p>
            {locale === "mn"
              ? "Баталгаажсан нийтлэл хараахан алга."
              : "No reviewed articles have been published yet."}
          </p>
        )}
        <div className="operations-list">
          {articles.map((a) => (
            <Link href={`/news/${a.id}`} key={a.id}>
              <span lang={locale === "en" && a.headline_en ? "en" : "mn"}>
                {locale === "en" && a.headline_en
                  ? a.headline_en
                  : a.headline_mn}
              </span>
              <small>{a.published_at.slice(0, 10)}</small>
            </Link>
          ))}
        </div>
        {nextCursor && (
          <Link href={`/news?cursor=${nextCursor}`}>
            {locale === "mn" ? "Дараах" : "Next"}
          </Link>
        )}
      </section>
    </main>
  );
}
