"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type StudioTheme = "dark" | "light";

interface ThemeContextValue {
  theme: StudioTheme;
  setTheme: (theme: StudioTheme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "stls.studio.theme";

function readInitialTheme(): StudioTheme {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* storage blocked — fall through */
  }
  const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches;
  return prefersLight ? "light" : "dark";
}

export function StudioThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<StudioTheme>("dark");

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      setThemeState(readInitialTheme());
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  const setTheme = useCallback((next: StudioTheme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore — persistence is best-effort */
    }
  }, []);

  const toggle = useCallback(() => {
    setThemeState((current) => {
      const next = current === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggle }),
    [theme, setTheme, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useStudioTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error(
      "useStudioTheme must be used inside a <StudioThemeProvider>",
    );
  }
  return context;
}
