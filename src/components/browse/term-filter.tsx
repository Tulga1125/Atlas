import Link from "next/link";
import { getTerms } from "@/modules/context/browse-data";
import type { TermFilter } from "@/modules/context/browse-data";
import { getDictionary } from "@/modules/i18n/dictionaries";
import type { Locale } from "@/modules/i18n/config";

/** Genre, theme and scene pickers; one filter at a time, verified tags only. */
export async function TermFilterForm({ action, locale, active, keep = {} }: { action: string; locale: Locale; active: TermFilter | null; keep?: Record<string, string> }) {
  const copy = getDictionary(locale).browse;
  const [genres, themes, scenes] = await Promise.all([getTerms("genre", locale), getTerms("theme", locale), getTerms("scene", locale)]);
  const groups = [
    { param: "genre", section: "genres" as const, terms: genres },
    { param: "theme", section: "themes" as const, terms: themes },
    { param: "scene", section: "scenes" as const, terms: scenes },
  ];
  return (
    <div>
      <form className="filter-form browse-filter" action={action}>
        {Object.entries(keep).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        {groups.map((g) => (
          <label key={g.param}>
            {copy.sections[g.section]}
            <select name={g.param} defaultValue={active?.param === g.param ? active.slug : ""}>
              <option value="">{copy.any}</option>
              {g.terms.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button type="submit">{copy.filterBy}</button>
      </form>
      {active && (
        <p className="data-notice" role="status">
          {copy.showing}: <Link href={`/${active.section}/${active.slug}`}>{active.label}</Link> ·{" "}
          <Link href={`${action}${Object.keys(keep).length ? `?${new URLSearchParams(keep)}` : ""}`}>{copy.clear}</Link>
        </p>
      )}
    </div>
  );
}
