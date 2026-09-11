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

export type CommandTheme = "dark" | "light";

interface CommandThemeContextValue {
  theme: CommandTheme;
  setTheme: (theme: CommandTheme) => void;
  toggle: () => void;
}

const StorageKey = "stls.command.theme";
const Ctx = createContext<CommandThemeContextValue | null>(null);

export function CommandThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<CommandTheme>("dark");

  useEffect(() => {
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

  const setTheme = useCallback((next: CommandTheme) => {
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

  const value = useMemo(() => ({ theme, setTheme, toggle }), [theme, setTheme, toggle]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCommandTheme(): CommandThemeContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useCommandTheme must be used inside <CommandThemeProvider>");
  }
  return ctx;
}
