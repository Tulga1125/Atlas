import Link from "next/link";
import type { Locale } from "@/modules/i18n/config";
import { getDictionary } from "@/modules/i18n/dictionaries";

type AtlasMarkProps = {
  compact?: boolean;
  inverse?: boolean;
  locale?: Locale;
};

export function AtlasMark({ compact = false, inverse = false, locale = "en" }: AtlasMarkProps) {
  const dictionary = getDictionary(locale);

  return (
    <Link
      aria-label={`Atlas Charts · ${dictionary.common.home}`}
      className={`atlas-mark ${compact ? "atlas-mark--compact" : ""} ${inverse ? "atlas-mark--inverse" : ""}`}
      href="/"
    >
      <span aria-hidden="true" className="atlas-mark__shadow">
        {compact ? "a" : "atlas"}
      </span>
      <span className="atlas-mark__face">{compact ? "a" : "atlas"}</span>
      {!compact && <span className="atlas-mark__descriptor">{dictionary.common.charts}</span>}
    </Link>
  );
}
