import Link from "next/link";
import { SiteHeader } from "@/components/atlas/site-header";
import { getLocale } from "@/modules/i18n/server";
import { createPublicDataClient } from "@/lib/supabase/public-data";
import { z } from "zod";
import { getTerms } from "@/modules/context/browse-data";
import { getDictionary } from "@/modules/i18n/dictionaries";
export const metadata = { title: "Search" };
export default async function Search({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams,
    locale = await getLocale(),
    query = q.trim().slice(0, 80);
  let rows: Array<{ id: string; title: string; kind: string }> = [];
  const copy = getDictionary(locale).browse;
  // Genres, themes and scenes whose Mongolian or English name matches.
  const needle = query.toLocaleLowerCase();
  const terms =
    query.length >= 2
      ? (
          await Promise.all(
            (["genre", "theme", "scene"] as const).flatMap((d) =>
              (["mn", "en"] as const).map((l) => getTerms(d, l).then((list) => list.map((t) => ({ ...t, dimension: d })))),
            ),
          )
        )
          .flat()
          .filter((t, i, all) => t.label.toLocaleLowerCase().includes(needle) && all.findIndex((o) => o.slug === t.slug && o.dimension === t.dimension) === i)
      : [];
  if (query.length >= 2) {
      const { data, error } = await createPublicDataClient().rpc(
        "search_catalog",
        { p_query: query },
      );
      if (error) throw new Error("Search unavailable");
      rows = z
        .array(
          z.object({ id: z.string(), title: z.string(), kind: z.string() }),
        )
        .parse(data);
  }
  return (
    <main className="public-shell">
      <SiteHeader
        currentPath={`/search?q=${encodeURIComponent(query)}`}
        locale={locale}
      />
      <section className="editorial-page">
        <h1>{locale === "mn" ? "Хайх" : "Search"}</h1>
        <form className="filter-form">
          <label>
            {locale === "mn" ? "Дуу, уран бүтээлч" : "Song or artist"}
            <input name="q" defaultValue={query} minLength={2} maxLength={80} />
          </label>
          <button>{locale === "mn" ? "Хайх" : "Search"}</button>
        </form>
        {terms.length > 0 && (
          <ul className="browse-terms">
            {terms.map((t) => {
              const section = t.dimension === "genre" ? "genres" : t.dimension === "theme" ? "themes" : "scenes";
              return (
                <li key={`${t.dimension}:${t.slug}`}>
                  <Link href={`/${section}/${t.slug}`}>
                    <strong>{t.label}</strong>
                    <small>{copy.singular[section]}</small>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <div className="operations-list">
          {rows.map((row) => (
            <Link
              href={
                row.kind === "song" ? `/songs/${row.id}` : `/artists/${row.id}`
              }
              key={`${row.kind}:${row.id}`}
            >
              {row.title}
            </Link>
          ))}
        </div>
        {query.length >= 2 && !rows.length && !terms.length && (
          <p>{locale === "mn" ? "Үр дүн алга." : "No results."}</p>
        )}
      </section>
    </main>
  );
}
