import { TermIndexPage } from "@/components/browse/term-pages";

export const dynamic = "force-dynamic";
export const metadata = { title: "Themes" };

export default function Page() {
  return <TermIndexPage section="themes" />;
}
