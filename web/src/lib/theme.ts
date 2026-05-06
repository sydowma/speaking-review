// Theme management: user picks "light" | "dark" | "auto" (follow system).
// Resolved class is applied to <html>; subscribers are notified on changes.

export type ThemePref = "light" | "dark" | "auto";
export type Resolved = "light" | "dark";

const STORAGE_KEY = "speaking-review.theme";
const mq = window.matchMedia("(prefers-color-scheme: dark)");

const listeners = new Set<(pref: ThemePref, resolved: Resolved) => void>();

export function loadPref(): ThemePref {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" ? v : "auto";
}

export function resolvePref(pref: ThemePref): Resolved {
  if (pref === "auto") return mq.matches ? "dark" : "light";
  return pref;
}

export function applyTheme(pref: ThemePref): Resolved {
  const resolved = resolvePref(pref);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.dataset.theme = resolved;
  return resolved;
}

export function setPref(pref: ThemePref): Resolved {
  localStorage.setItem(STORAGE_KEY, pref);
  const resolved = applyTheme(pref);
  listeners.forEach((cb) => cb(pref, resolved));
  return resolved;
}

export function subscribe(cb: (pref: ThemePref, resolved: Resolved) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// React to system changes when in auto mode.
mq.addEventListener("change", () => {
  const pref = loadPref();
  if (pref !== "auto") return;
  const resolved = applyTheme(pref);
  listeners.forEach((cb) => cb(pref, resolved));
});

// Apply on import so the first paint matches.
applyTheme(loadPref());
