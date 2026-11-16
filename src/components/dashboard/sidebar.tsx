import Link from "next/link";
import {
  AlertTriangle,
  BookOpenText,
  ChartNoAxesCombined,
  Database,
  Gauge,
  Library,
  LogOut,
  Music2,
  RadioTower,
  type LucideIcon,
} from "lucide-react";
import { AtlasMark } from "@/components/atlas/atlas-mark";
import type { Locale } from "@/modules/i18n/config";
import { getDictionary } from "@/modules/i18n/dictionaries";
import type {
  DashboardData,
  DashboardProfile,
} from "@/modules/dashboard/types";
import { signOut } from "@/app/dashboard/actions";

type NavigationItem = {
  icon: LucideIcon;
  href:
    | "/dashboard"
    | "/dashboard/artists"
    | "/dashboard/charts"
    | "/dashboard/signals"
    | "/dashboard/anomalies"
    | "/dashboard/catalog"
    | "/dashboard/newsroom"
    | "/dashboard/data-health";
  section: string;
  countKey?: keyof DashboardData["counts"] | null;
  labelIndex?: number;
};

const baseNavigation: NavigationItem[] = [
  { icon: Gauge, href: "/dashboard", section: "home", countKey: null },
  { icon: ChartNoAxesCombined, href: "/dashboard/charts", section: "charts" },
  {
    icon: RadioTower,
    href: "/dashboard/signals",
    section: "signals",
    countKey: "signals",
  },
  {
    icon: AlertTriangle,
    href: "/dashboard/anomalies",
    section: "anomalies",
    countKey: "anomalies",
  },
  {
    icon: Library,
    href: "/dashboard/artists",
    section: "artists",
    countKey: "identityReviews",
  },
  { icon: Music2, href: "/dashboard/catalog", section: "catalog" },
  {
    icon: BookOpenText,
    href: "/dashboard/newsroom",
    section: "newsroom",
    labelIndex: 5,
    countKey: "stories",
  },
  {
    icon: Database,
    href: "/dashboard/data-health",
    section: "data-health",
    labelIndex: 6,
  },
];

type DashboardSidebarProps = {
  profile: DashboardProfile;
  counts: DashboardData["counts"];
  locale: Locale;
  activeSection?: string;
};

function initials(displayName: string) {
  return displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function DashboardSidebar({
  profile,
  counts,
  locale,
  activeSection = "home",
}: DashboardSidebarProps) {
  const dictionary = getDictionary(locale);

  return (
    <aside className="dashboard-sidebar">
      <AtlasMark inverse locale={locale} />
      <nav
        className="dashboard-navigation"
        aria-label={dictionary.dashboard.navigation}
      >
        {baseNavigation.map(({ icon: Icon, ...item }, index) => {
          const label =
            item.section === "catalog"
              ? locale === "mn"
                ? "Дууны сан"
                : "Song catalog"
              : item.section === "artists"
                ? locale === "mn"
                  ? "Уран бүтээлчид"
                  : "Artist review"
                : dictionary.dashboard.nav[item.labelIndex ?? index];
          const count =
            "countKey" in item && item.countKey
              ? counts[item.countKey]
              : undefined;
          const active = item.section === activeSection;

          return (
            <Link
              aria-label={label}
              aria-current={active ? "page" : undefined}
              title={label}
              className={active ? "active" : ""}
              href={item.href}
              key={label}
            >
              <Icon aria-hidden="true" size={17} />
              <span>{label}</span>
              {typeof count === "number" && count > 0 && <small>{count}</small>}
            </Link>
          );
        })}
      </nav>
      <div className="dashboard-sidebar__user">
        <span>{initials(profile.displayName) || "AT"}</span>
        <div>
          <strong>{profile.displayName}</strong>
          <small>{dictionary.dashboard.roles[profile.role]}</small>
        </div>
          <form action={signOut}>
            <button
              className="dashboard-sidebar__exit"
              title={dictionary.dashboard.signOut}
              type="submit"
            >
              <LogOut aria-hidden="true" size={15} />
              <span className="sr-only">{dictionary.dashboard.signOut}</span>
            </button>
          </form>
      </div>
    </aside>
  );
}
