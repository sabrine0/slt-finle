"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type StudioTheme = "dark" | "light";

interface StudioThemeContextValue {
  theme: StudioTheme;
  toggle: () => void;
  setTheme: (theme: StudioTheme) => void;
}

const StorageKey = "stls.studio.theme";

const Ctx = createContext<StudioThemeContextValue | null>(null);

export function StudioThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<StudioTheme>("dark");

  useEffect(() => {
    // Read saved preference after hydration to avoid SSR / client mismatch.
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(StorageKey);
    } catch {
      return;
    }
    if (stored === "dark" || stored === "light") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setThemeState(stored);
    }
  }, []);

  const setTheme = useCallback((next: StudioTheme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(StorageKey, next);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    setThemeState((current) => {
      const next = current === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(StorageKey, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, toggle, setTheme }), [theme, toggle, setTheme]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStudioThemeContext(): StudioThemeContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useStudioThemeContext must be used inside StudioThemeProvider");
  }
  return ctx;
}
