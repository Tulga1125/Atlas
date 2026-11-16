import type { Metadata } from "next";
import { SiteHeader } from "@/components/atlas/site-header";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getLocale } from "@/modules/i18n/server";

export const metadata: Metadata = {
  title: "Methodology",
};

export default async function MethodologyPage() {
  const locale = await getLocale();
  const dictionary = getDictionary(locale);

  return (
    <main className="public-shell methodology-page">
      <SiteHeader currentPath="/methodology" locale={locale} />
      <header className="methodology-hero">
        <p className="eyebrow">{dictionary.methodology.eyebrow}</p>
        <h1>
          {dictionary.methodology.heroLead}
          <br />
          {dictionary.methodology.heroAccent}
        </h1>
        <p>{dictionary.methodology.intro}</p>
      </header>
      <section className="methodology-principle">
        <strong>{dictionary.methodology.principleTitle}</strong>
        <p>{dictionary.methodology.principleBody}</p>
      </section>
      <section className="methodology-principle methodology-principle--artist">
        <strong>{dictionary.methodology.artistPrincipleTitle}</strong>
        <p>{dictionary.methodology.artistPrincipleBody}</p>
      </section>
      <section className="methodology-principle methodology-principle--artist">
        <strong>{dictionary.methodology.youtubeRetentionTitle}</strong>
        <p>{dictionary.methodology.youtubeRetentionBody}</p>
      </section>
      <section className="methodology-steps">
        {dictionary.methodology.steps.map((step) => (
          <article key={step.number}>
            <span>{step.number}</span>
            <h2>{step.title}</h2>
            <p>{step.body}</p>
          </article>
        ))}
      </section>
      <section className="editorial-page">
        <h2>{locale === "mn" ? "Тооцооллын дүрэм" : "Calculation rules"}</h2>
        <p>
          {locale === "mn"
            ? "Өдрийн өөрчлөлтийг өмнөх баталгаажсан агшинтай, долоо хоногийн өөрчлөлтийг яг 7 хоногийн өмнөх агшинтай харьцуулна. Дутуу өдрүүдийг нөхөж зохиохгүй. Чартад байгаагүй дууны байрыг 101 гэж үзэхгүй."
            : "Daily movement compares the previous approved snapshot; weekly movement compares exactly seven calendar days earlier. Missing days remain missing. An absent song is not assigned rank 101."}
        </p>
        <p>
          {locale === "mn"
            ? "Өдөр тоолохдоо дууг нэг өдөр нэг удаа тоолно. Нэг дууны олон хувилбараас хамгийн өндөр байрыг уран бүтээлчийн үзүүлэлтэд хэрэглэнэ. Шинэ оргил нь Atlas-д бүртгэгдсэн түүхийн хүрээнд хүчинтэй."
            : "Tenure counts distinct chart dates. Artist statistics use the best daily rank per canonical song when multiple recordings chart. A new peak refers to Atlas’s observed history."}
        </p>
        <p>
          {locale === "mn"
            ? "Эрчийн оноо 0–100: өдрийн өсөлт 30%, 7 хоногийн өсөлт 25%, одоогийн байр 20%, дараалсан өсөлт 15%, шинэ оргил 10%. Өсөлтийг 25/50 байр, дарааллыг 7 өдрөөр хязгаарлана. Өгөгдөлгүй хэсгийн жинг үлдсэн хэсгүүдэд хувь тэнцүүлнэ. Энэ нь сонссон тоо эсвэл албан ёсны чартын байр биш."
            : "Momentum is 0–100: daily gain 30%, seven-day gain 25%, current position 20%, consecutive gains 15%, and new peak 10%. Gains are capped at 25/50 positions and streaks at seven days. Missing components are omitted and remaining weights are renormalized. This score is neither a stream count nor an official chart rank."}
        </p>
        <p>
          {locale === "mn"
            ? "Эх сурвалжийн засварыг шинэ агшингаар бүртгэнэ. Өмнөх эх болон нийтлэлийн хувилбар хадгалагдана."
            : "Source corrections create a replacement snapshot. Earlier source evidence and published article revisions remain in the audit history."}
        </p>
      </section>
      <section className="methodology-version">
        <div>
          <span>{dictionary.methodology.currentVersion}</span>
          <strong>chart-metrics-v2 · signals-v2</strong>
        </div>
        <div>
          <span>{dictionary.methodology.effective}</span>
          <strong>{dictionary.methodology.effectiveDate}</strong>
        </div>
        <div>
          <span>{dictionary.methodology.timezone}</span>
          <strong>Asia/Ulaanbaatar</strong>
        </div>
      </section>
    </main>
  );
}
