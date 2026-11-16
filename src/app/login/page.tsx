import type { Metadata } from "next";
import { AtlasMark } from "@/components/atlas/atlas-mark";
import { LanguageSwitch } from "@/components/atlas/language-switch";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getLocale } from "@/modules/i18n/server";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Team sign in",
};

type LoginPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const locale = await getLocale();
  const dictionary = getDictionary(locale);
  const parameters = await searchParams;
  const accessDenied = parameters.error === "access_denied";
  const currentPath = accessDenied ? "/login?error=access_denied" : "/login";

  return (
    <main className="login-page">
      <section className="login-page__brand">
        <AtlasMark locale={locale} />
        <div>
          <p className="eyebrow">{dictionary.login.dashboardEyebrow}</p>
          <h1>{dictionary.login.heroLead}<br />{dictionary.login.heroAccent}</h1>
          <p>{dictionary.login.heroBody}</p>
        </div>
        <small>47.92°N · 106.92°E</small>
      </section>
      <section className="login-page__form">
        <LanguageSwitch currentPath={currentPath} locale={locale} />
        <div>
          <p className="eyebrow">{dictionary.login.privateWorkspace}</p>
          <h2>{dictionary.login.signIn}</h2>
          <p>{dictionary.login.instructions}</p>
          {accessDenied && (
            <p className="login-form__message login-form__message--error">
              {dictionary.login.inactive}
            </p>
          )}
          <LoginForm
            labels={{
              sendLink: dictionary.login.sendLink,
              sending: dictionary.login.sending,
              workEmail: dictionary.login.workEmail,
            }}
          />
        </div>
      </section>
    </main>
  );
}
