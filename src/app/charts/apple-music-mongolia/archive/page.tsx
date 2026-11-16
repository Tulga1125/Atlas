import Link from "next/link";
import { SiteHeader } from "@/components/atlas/site-header";
import { getLocale } from "@/modules/i18n/server";
import { getArchive } from "@/modules/charts/history";
export const metadata = { title: "Chart archive" };
export default async function Archive({
  searchParams,
}: {
  searchParams: Promise<{ before?: string }>;
}) {
  const locale = await getLocale(),
    { before } = await searchParams,
    { snapshots, nextCursor } = await getArchive(before);
  return (
    <main className="public-shell">
      <SiteHeader
        currentPath="/charts/apple-music-mongolia/archive"
        locale={locale}
      />
      <section className="editorial-page">
        <h1>{locale === "mn" ? "Чартын архив" : "Chart archive"}</h1>
        <p>
          {locale === "mn"
            ? "Зөвхөн баталгаажсан өдрийн агшнууд. Алга болсон өдрийг нөхөж зохиодоггүй."
            : "Approved daily snapshots. Missing dates are never interpolated."}
        </p>
        <div className="operations-list">
          {snapshots.map((s) => (
            <Link
              key={s.id}
              href={`/charts/apple-music-mongolia?date=${s.snapshot_date}`}
            >
              <strong>{s.snapshot_date}</strong>
              <span>
                {s.entry_count} {locale === "mn" ? "дуу" : "songs"}
              </span>
            </Link>
          ))}
        </div>
        {nextCursor && (
          <Link
            href={`/charts/apple-music-mongolia/archive?before=${nextCursor}`}
          >
            {locale === "mn" ? "Өмнөх өдрүүд" : "Earlier dates"}
          </Link>
        )}
        <Link href="/charts/apple-music-mongolia/weekly">
          {locale === "mn" ? "Долоо хоногийн тойм" : "Weekly recap"} →
        </Link>
      </section>
    </main>
  );
}
