"use client";

// Light / dark switch for the header. The choice is saved in this browser
// (localStorage "drive-theme") and applied before the page draws by the
// script in app/layout.tsx (THEME_SCRIPT), so there's no flash of the other
// theme. Dark is the default.
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

export const THEME_KEY = "drive-theme";
const EVENT = "drive-theme-change";
const THEME_COLORS = { dark: "#060a14", light: "#f4f6fb" };

type Theme = "dark" | "light";

function current(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "light") root.dataset.theme = "light";
  else delete root.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // private mode: the choice just isn't remembered
  }
  window.dispatchEvent(new Event(EVENT));
}

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, current, () => "dark" as Theme);
  const next = theme === "light" ? "dark" : "light";
  return (
    <button
      type="button"
      onClick={() => apply(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={`btn btn-ghost btn-icon btn-sm ${className}`}
    >
      {theme === "light" ? <Moon /> : <Sun />}
    </button>
  );
}
