import type { Locale } from "@/modules/i18n/config";

const UB_TIME_ZONE = "Asia/Ulaanbaatar";

function intlLocale(locale: Locale) {
  return locale === "mn" ? "mn-MN" : "en-GB";
}

export function formatSnapshotDate(
  date: string,
  locale: Locale = "en",
  options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "long",
    year: "numeric",
  },
) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function formatUlaanbaatarTime(timestamp: string, locale: Locale = "en") {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: UB_TIME_ZONE,
  }).format(new Date(timestamp));
}

export function formatUlaanbaatarDate(timestamp: string, locale: Locale = "en") {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: UB_TIME_ZONE,
  }).format(new Date(timestamp));
}

export function formatCompactDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year.slice(-2)}`;
}
