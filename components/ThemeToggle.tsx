"use client";

// Light / dark switch for the header. Everyone starts in light; a
// pick is saved in this browser (localStorage "drive-theme") and applied
// before the page draws by the script in app/layout.tsx (THEME_SCRIPT), so
// there's no flash of the other theme.
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

export const THEME_KEY = "drive-theme";
const EVENT = "drive-theme-change";
const THEME_COLORS = { dark: "#252621", light: "#f2f0eb" };

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
  // Counted for the admin Leads page (app/api/theme); best-effort.
  const body = JSON.stringify({ theme, path: location.pathname });
  if (!navigator.sendBeacon?.("/api/theme", new Blob([body], { type: "application/json" }))) {
    fetch("/api/theme", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(
      () => {}
    );
  }
}

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, current, () => "light" as Theme);
  const next = theme === "light" ? "dark" : "light";
  const label = next === "dark" ? "Switch to dark mode" : "Switch to light mode";
  return (
    <button
      type="button"
      onClick={() => apply(next)}
      aria-label={label}
      title={label}
      className={`btn btn-icon btn-sm border-line-hover text-fg hover:border-fg ${className}`}
    >
      {theme === "light" ? <Moon /> : <Sun />}
    </button>
  );
}
