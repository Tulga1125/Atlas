import { TermIndexPage } from "@/components/browse/term-pages";

export const dynamic = "force-dynamic";
export const metadata = { title: "Genres" };

export default function Page() {
  return <TermIndexPage section="genres" />;
}
