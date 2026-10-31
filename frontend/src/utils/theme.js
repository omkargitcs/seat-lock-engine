import { useSyncExternalStore } from "react";

const KEY = "sd-theme";
const query = () => window.matchMedia("(prefers-color-scheme: dark)");

const stored = () => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
};

// First visit follows the system; after a manual toggle the saved choice wins.
const resolve = () => stored() ?? (query().matches ? "dark" : "light");

const listeners = new Set();
let current = typeof window === "undefined" ? "dark" : resolve();

const apply = (theme) => {
  document.documentElement.dataset.theme = theme;
};

const setTheme = (theme, persist) => {
  current = theme;
  apply(theme);
  if (persist) {
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* private mode: choice just won't survive a reload */
    }
  }
  listeners.forEach((l) => l());
};

if (typeof window !== "undefined") {
  apply(current);
  query().addEventListener("change", (e) => {
    if (!stored()) setTheme(e.matches ? "dark" : "light", false);
  });
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) setTheme(resolve(), false);
  });
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const useTheme = () => {
  const theme = useSyncExternalStore(subscribe, () => current, () => "dark");
  return { theme, toggle: () => setTheme(theme === "dark" ? "light" : "dark", true) };
};
