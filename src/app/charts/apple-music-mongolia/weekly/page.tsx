import Link from "next/link";
import { SiteHeader } from "@/components/atlas/site-header";
import { getLocale } from "@/modules/i18n/server";
import { getArchive } from "@/modules/charts/history";
import { getAtlasBusinessDate } from "@/modules/collection/business-date";
import { shiftDate } from "@/modules/analytics/calculate";
import { z } from "zod";
export const metadata = { title: "Weekly recap" };
export default async function Weekly({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const locale = await getLocale(),
    query = await searchParams,
    parsed = z.iso.date().safeParse(query.date),
    date = parsed.success ? parsed.data : getAtlasBusinessDate();
  const day = new Date(date + "T00:00:00Z").getUTCDay(),
    monday = shiftDate(date, -(day === 0 ? 6 : day - 1)),
    sunday = shiftDate(monday, 6);
  const { snapshots } = await getArchive(shiftDate(sunday, 1));
  const week = snapshots.filter(
    (s) => s.snapshot_date >= monday && s.snapshot_date <= sunday,
  );
  return (
    <main className="public-shell">
      <SiteHeader
        currentPath={`/charts/apple-music-mongolia/weekly?date=${date}`}
        locale={locale}
      />
      <section className="editorial-page">
        <h1>{locale === "mn" ? "Долоо хоногийн тойм" : "Weekly recap"}</h1>
        <p>
          {monday} — {sunday}
        </p>
        <p>
          {locale === "mn"
            ? "Өдрийн эх сурвалжуудын тойм; шинэ долоо хоногийн чансаа биш."
            : "A review of daily observations; this does not create a separate weekly ranking."}
        </p>
        <div className="operations-list">
          {Array.from({ length: 7 }, (_, i) => shiftDate(monday, i)).map(
            (d) => {
              const s = week.find((s) => s.snapshot_date === d);
              return (
                <div key={d}>
                  {s ? (
                    <Link href={`/charts/apple-music-mongolia?date=${d}`}>
                      {d} · {s.entry_count}
                    </Link>
                  ) : (
                    <p>
                      {d} · {locale === "mn" ? "Агшин алга" : "No snapshot"}
                    </p>
                  )}
                </div>
              );
            },
          )}
        </div>
        <Link
          href={`/charts/apple-music-mongolia/weekly?date=${shiftDate(monday, -7)}`}
        >
          ← {locale === "mn" ? "Өмнөх долоо хоног" : "Previous week"}
        </Link>
      </section>
    </main>
  );
}
