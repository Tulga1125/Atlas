"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { SiteHeader } from "@/components/atlas/site-header";
import { parseLocale } from "@/modules/i18n/config";
import { getDictionary } from "@/modules/i18n/dictionaries";

type ErrorPageProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

function subscribeToLocale() {
  return () => undefined;
}

function getClientLocale() {
  return parseLocale(document.documentElement.lang);
}

function getServerLocale() {
  return "en" as const;
}

export default function ErrorPage({ error, retry }: ErrorPageProps) {
  const locale = useSyncExternalStore(
    subscribeToLocale,
    getClientLocale,
    getServerLocale,
  );

  useEffect(() => {
    console.error(error);
  }, [error]);

  const dictionary = getDictionary(locale);

  return (
    <main className="public-shell">
      <SiteHeader currentPath="/" locale={locale} />
      <section className="error-state">
        <p className="eyebrow">{dictionary.error.eyebrow}</p>
        <h1>{dictionary.error.heroLead}<br /><span>{dictionary.error.heroAccent}</span></h1>
        <p>{dictionary.error.body}</p>
        <div className="hero-actions">
          <button className="button button--ink" onClick={() => retry()} type="button">
            {dictionary.error.retry} <RotateCcw aria-hidden="true" size={16} />
          </button>
          <Link className="text-link" href="/methodology">{dictionary.error.methodology}</Link>
        </div>
      </section>
    </main>
  );
}
