import Link from "next/link";
export default function NotFound() {
  return (
    <main className="editorial-page">
      <p className="eyebrow">Atlas · 404</p>
      <h1>Page not found · Хуудас олдсонгүй</h1>
      <p>The requested page or chart date is unavailable.</p>
      <Link href="/">Home · Нүүр →</Link>
    </main>
  );
}
