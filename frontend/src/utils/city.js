import { useSyncExternalStore } from "react";

const KEY = "sd-city";
const listeners = new Set();
let current = (() => {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
})();

export const setCity = (city) => {
  current = city;
  try {
    localStorage.setItem(KEY, city);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
};

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

// "" means no city picked yet; the navbar fills it in from the API's first city.
export const useCity = () => useSyncExternalStore(subscribe, () => current, () => "");
