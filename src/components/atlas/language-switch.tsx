"use client";

import { useState } from "react";
import type { Locale } from "@/modules/i18n/config";

type LanguageSwitchProps = {
  currentPath: string;
  inverse?: boolean;
  locale: Locale;
};

export function LanguageSwitch({
  currentPath,
  inverse = false,
  locale,
}: LanguageSwitchProps) {
  const [pendingLocale, setPendingLocale] = useState<Locale | null>(null);

  async function switchLanguage(nextLocale: Locale) {
    if (nextLocale === locale || pendingLocale) {
      return;
    }

    setPendingLocale(nextLocale);

    try {
      const response = await fetch("/api/language", {
        body: JSON.stringify({ locale: nextLocale }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`Language update failed with ${response.status}`);
      }

      if (window.location.pathname === currentPath) {
        window.location.reload();
      } else {
        window.location.assign(currentPath);
      }
    } catch (error) {
      console.error(error);
      setPendingLocale(null);
    }
  }

  return (
    <nav
      aria-label={locale === "mn" ? "Хэл сонгох" : "Language selection"}
      className={`language-switch ${inverse ? "language-switch--inverse" : ""}`}
    >
      <button
        aria-pressed={locale === "en"}
        aria-label="English"
        className={locale === "en" ? "language-switch__active" : undefined}
        disabled={pendingLocale !== null}
        onClick={() => switchLanguage("en")}
        type="button"
      >
        EN
      </button>
      <span aria-hidden="true">·</span>
      <button
        aria-pressed={locale === "mn"}
        aria-label="Монгол"
        className={locale === "mn" ? "language-switch__active" : undefined}
        disabled={pendingLocale !== null}
        onClick={() => switchLanguage("mn")}
        type="button"
      >
        MN
      </button>
    </nav>
  );
}
