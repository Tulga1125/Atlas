"use client";

import { Moon, Sun } from "lucide-react";

// Light/dark switch. Without a choice the site follows the device setting;
// the choice is kept in the atlas_theme cookie so the server renders it
// directly (no flash on load). CSS shows the right icon, so no state is needed.
function isDark() {
  const chosen = document.documentElement.dataset.theme;
  return chosen ? chosen === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeToggle({ locale }: { locale: "mn" | "en" }) {
  const toggle = () => {
    const next = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.cookie = `atlas_theme=${next}; path=/; max-age=31536000; samesite=lax`;
  };
  const label = locale === "mn" ? "Цайвар / харанхуй горим" : "Light / dark mode";
  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label={label} title={label}>
      <Moon className="theme-toggle__moon" aria-hidden="true" size={16} />
      <Sun className="theme-toggle__sun" aria-hidden="true" size={16} />
    </button>
  );
}
