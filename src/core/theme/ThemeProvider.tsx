import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ThemeMode = Exclude<ThemePreference, "system">;

const STORAGE_KEY = "dhrmis-theme-preference";

function readThemePreference(): ThemePreference {
  try {
    const preference = window.localStorage.getItem(STORAGE_KEY);
    return preference === "light" || preference === "dark" ? preference : "system";
  } catch {
    return "system";
  }
}

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readThemePreference);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const theme: ThemeMode = preference === "system" ? (media.matches ? "dark" : "light") : preference;
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
        "content",
        theme === "dark" ? "#000000" : "#1b347f",
      );
    };

    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [preference]);

  const value = useMemo<ThemeContextValue>(() => ({
    preference,
    setPreference(nextPreference) {
      setPreferenceState(nextPreference);
      try {
        window.localStorage.setItem(STORAGE_KEY, nextPreference);
      } catch {
        // The selected theme still applies for this session when storage is unavailable.
      }
    },
  }), [preference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
