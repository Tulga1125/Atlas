import { ThemeToggle } from "@/components/atlas/theme-toggle";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import type { Locale } from "@/modules/i18n/config";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { AtlasMark } from "./atlas-mark";
import { LanguageSwitch } from "./language-switch";

type SiteHeaderProps = {
  currentPath?: string;
  locale?: Locale;
};

export function SiteHeader({
  currentPath = "/",
  locale = "en",
}: SiteHeaderProps) {
  const dictionary = getDictionary(locale);
  const navigation = [
    ["/charts/atlas-mongolia", dictionary.common.charts],
    ["/artists", dictionary.common.artists],
    ["/methodology", dictionary.common.methodology],
    ["/news", locale === "mn" ? "Мэдээ" : "News"],
    ["/search", locale === "mn" ? "Хайх" : "Search"],
    ["/about", locale === "mn" ? "Тухай" : "About"],
  ] as const;
  const pathname = currentPath.split("?")[0];

  return (
    <header className="site-header">
      <AtlasMark locale={locale} />
      <nav
        aria-label={dictionary.common.primaryNavigation}
        className="site-nav"
      >
        {navigation.map(([href, title]) => (
          <Link
            key={href}
            href={href}
            aria-current={
              pathname === href || pathname.startsWith(`${href}/`) || (href.startsWith("/charts/") && pathname.startsWith("/charts/"))
                ? "page"
                : undefined
            }
          >
            {title}
          </Link>
        ))}
      </nav>
      <div className="site-header__tools">
        <Link className="dashboard-button" href="/dashboard" aria-label={dictionary.common.dashboard}>
          <LayoutDashboard aria-hidden="true" size={16} />
          <span>{dictionary.common.dashboard}</span>
        </Link>
        <LanguageSwitch currentPath={currentPath} locale={locale} />
        <ThemeToggle locale={locale} />
      </div>
    </header>
  );
}
