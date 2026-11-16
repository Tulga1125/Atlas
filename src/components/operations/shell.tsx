import { DashboardHeader } from "@/components/dashboard/header";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { staffContext } from "@/modules/operations/data";
import { getLocale } from "@/modules/i18n/server";
import { label } from "@/modules/operations/labels";
export async function OperationsShell({
  section,
  children,
  currentPath,
}: {
  section: string;
  children: React.ReactNode;
  currentPath?: string;
}) {
  const context = await staffContext(),
    locale = await getLocale();
  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        profile={context.profile}
        counts={{ signals: 0, anomalies: 0, stories: 0, identityReviews: 0 }}
        locale={locale}
        activeSection={section}
      />
      <section className="dashboard-main operations-main">
        <DashboardHeader
          title={label(section, locale)}
          currentPath={currentPath ?? `/dashboard/${section}`}
          locale={locale}
        />
        <div className="operations-content">{children}</div>
      </section>
    </main>
  );
}
