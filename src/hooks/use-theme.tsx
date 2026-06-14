import { useEffect, useState, useCallback } from "react";

export type Theme = "light" | "dark";
const KEY = "erpjersey:theme";

function getInitial(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(KEY) as Theme | null;
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function apply(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getInitial());

  useEffect(() => {
    apply(theme);
    try { localStorage.setItem(KEY, theme); } catch {}
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggle = useCallback(() => setThemeState((t) => (t === "dark" ? "light" : "dark")), []);

  return { theme, setTheme, toggle };
}
