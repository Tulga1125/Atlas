import { ThemeToggle } from "@/components/atlas/theme-toggle";
import { LanguageSwitch } from "@/components/atlas/language-switch";
import type { Locale } from "@/modules/i18n/config";

export function DashboardHeader({
  title,
  eyebrow,
  status,
  currentPath,
  locale,
}: {
  title: string;
  eyebrow?: string;
  status?: React.ReactNode;
  currentPath: string;
  locale: Locale;
}) {
  return (
    <header className="dashboard-header">
      <div className="dashboard-header__title">
        <p>
          {eyebrow ??
            (locale === "mn" ? "Atlas · Ажлын орчин" : "Atlas · Workspace")}
        </p>
        <h1>{title}</h1>
      </div>
      <div className="dashboard-header__tools">
        {status && <div className="dashboard-header__status">{status}</div>}
        <LanguageSwitch currentPath={currentPath} locale={locale} />
        <ThemeToggle locale={locale} />
      </div>
    </header>
  );
}
