"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    if (current === "light" || current === "dark") setTheme(current);
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("km-theme", next);
    } catch {
      // Private mode or blocked storage — the choice just won't persist.
    }
  }

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="flex items-center gap-0.5 rounded-full border border-line p-[3px]"
    >
      <button
        type="button"
        onClick={() => apply("dark")}
        aria-pressed={theme === "dark"}
        title="Dark"
        className={`grid size-[27px] place-items-center rounded-full transition-colors ${
          theme === "dark" ? "bg-surface-hi text-ink" : "text-ink-faint hover:text-ink-muted"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z" />
        </svg>
        <span className="sr-only">Dark</span>
      </button>
      <button
        type="button"
        onClick={() => apply("light")}
        aria-pressed={theme === "light"}
        title="Light"
        className={`grid size-[27px] place-items-center rounded-full transition-colors ${
          theme === "light" ? "bg-surface-hi text-ink" : "text-ink-faint hover:text-ink-muted"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.6v2.1M12 19.3v2.1M2.6 12h2.1M19.3 12h2.1M5.6 5.6l1.5 1.5M16.9 16.9l1.5 1.5M18.4 5.6l-1.5 1.5M7.1 16.9l-1.5 1.5" />
        </svg>
        <span className="sr-only">Light</span>
      </button>
    </div>
  );
}
