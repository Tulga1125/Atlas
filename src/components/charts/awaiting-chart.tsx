import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";
import type { Locale } from "@/modules/i18n/config";

export function AwaitingChart({ locale }: { locale: Locale }) {
  return (
    <section className="chart-empty-state">
      <Clock3 aria-hidden="true" size={28} />
      <p className="eyebrow">Apple Music · Mongolia</p>
      <h2>{locale === "mn" ? "Анхны чарт удахгүй." : "The first chart is on its way."}</h2>
      <p>{locale === "mn"
        ? "Баталгаажсан чарт хараахан алга. Эх сурвалжаас өгөгдөл цуглуулж, шалгасны дараа байр болон түүхийг энд нийтэлнэ."
        : "No approved chart has been published yet. Rankings and history will appear here once source data has been collected and checked."}</p>
      <Link className="text-link" href="/artists">
        {locale === "mn" ? "Уран бүтээлчидтэй танилцах" : "Explore Mongolian artists"}
        <ArrowRight aria-hidden="true" size={16} />
      </Link>
    </section>
  );
}
