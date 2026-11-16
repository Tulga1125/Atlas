import { SiteHeader } from "@/components/atlas/site-header";
import { getLocale } from "@/modules/i18n/server";
export const metadata = { title: "About Atlas" };
export default async function About() {
  const locale = await getLocale();
  return (
    <main className="public-shell">
      <SiteHeader currentPath="/about" locale={locale} />
      <section className="editorial-page">
        <p className="eyebrow">Ulaanbaatar · Mongolia</p>
        <h1>{locale === "mn" ? "Atlas-ийн тухай" : "About Atlas"}</h1>
        <p>
          {locale === "mn"
            ? "Atlas нь Монголын хөгжмийн чартын түүхийг хадгалж, өөрчлөлтийг нотолгоотой тайлбарлах редакцийн платформ юм. Бид Apple Music-ийн Монгол дахь Топ 100-аас эхэлж байна."
            : "Atlas preserves Mongolia’s chart history and helps editors explain musical change with evidence. We begin with Apple Music’s Mongolia Top 100."}
        </p>
        <p>
          {locale === "mn"
            ? "Байр нь сонссон тоо биш. Atlas-ийн эрчийн оноо нь редакцийн эрэмбэлэх туслах үзүүлэлт бөгөөд эх сурвалжийн байрыг өөрчилдөггүй. Нийтлэл бүрийг хүн хянаж батална."
            : "Rank is not a stream count. Atlas momentum helps editors prioritize stories and never changes source rankings. Every article requires human approval."}
        </p>
        <a href="/methodology">
          {locale === "mn" ? "Аргачлал унших" : "Read the methodology"} →
        </a>
      </section>
    </main>
  );
}
