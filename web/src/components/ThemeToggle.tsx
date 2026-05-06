import { useEffect, useState } from "react";
import { loadPref, setPref, subscribe, type ThemePref } from "../lib/theme.ts";

const NEXT: Record<ThemePref, ThemePref> = {
  auto: "light",
  light: "dark",
  dark: "auto",
};

const ICON: Record<ThemePref, string> = {
  auto: "◐",
  light: "☀",
  dark: "☾",
};

const LABEL: Record<ThemePref, string> = {
  auto: "Auto",
  light: "Light",
  dark: "Dark",
};

export function ThemeToggle(): React.ReactElement {
  const [pref, setPrefState] = useState<ThemePref>(loadPref());

  useEffect(() => {
    return subscribe((next) => setPrefState(next));
  }, []);

  const cycle = () => {
    const next = NEXT[pref];
    setPref(next);
    setPrefState(next);
  };

  return (
    <button
      type="button"
      onClick={cycle}
      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-stone-50 dark:hover:bg-zinc-700 text-xs text-zinc-700 dark:text-zinc-200 px-2.5 py-1.5"
      title={`Theme: ${LABEL[pref]} — click to cycle`}
    >
      <span aria-hidden>{ICON[pref]}</span>
      <span className="hidden sm:inline">{LABEL[pref]}</span>
    </button>
  );
}
