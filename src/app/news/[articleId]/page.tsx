import { notFound } from "next/navigation";
import { getPublication } from "@/modules/newsroom/public";
import { SiteHeader } from "@/components/atlas/site-header";
import { getLocale } from "@/modules/i18n/server";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ articleId: string }>;
}) {
  const article = await getPublication((await params).articleId);
  return { title: article?.headline_mn ?? "Atlas News" };
}
export default async function Article({
  params,
}: {
  params: Promise<{ articleId: string }>;
}) {
  const { articleId } = await params,
    locale = await getLocale(),
    article = await getPublication(articleId);
  if (!article) notFound();
  const translated = locale === "en" && article.headline_en && article.body_en;
  return (
    <main className="public-shell">
      <SiteHeader currentPath={`/news/${articleId}`} locale={locale} />
      <article className="editorial-page" lang={translated ? "en" : "mn"}>
        <p className="eyebrow">Atlas · {article.published_at.slice(0, 10)}</p>
        <h1>{translated ? article.headline_en : article.headline_mn}</h1>
        {locale === "en" && !translated && (
          <p lang="en">
            Published in Mongolian. An English edition is not available.
          </p>
        )}
        <div className="article-body">
          {translated ? article.body_en : article.body_mn}
        </div>
        {article.external_url && (
          <a href={article.external_url} rel="noreferrer">
            {locale === "mn" ? "Эх нийтлэл" : "Original publication"} ↗
          </a>
        )}
        <details>
          <summary>
            {locale === "mn" ? "Эх сурвалж, нотолгоо" : "Sources and evidence"}
          </summary>
          <pre className="evidence-block">
            {JSON.stringify(article.source_facts, null, 2)}
          </pre>
        </details>
      </article>
    </main>
  );
}
