import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { MoonIcon, SunIcon } from "lucide-react";
import { useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";

/**
 * Where the choice is stored. The app's inline script in `index.html` reads the same key and sets
 * `.dark` on `<html>` before the first paint, so the page never flashes the wrong theme.
 */
export const THEME_STORAGE_KEY = "theme";

const isDark = () => {
  return document.documentElement.classList.contains("dark");
};

const prefersReducedMotion = () => {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
};

/** A light/dark switch. It starts from the class the inline script set, so it needs no provider. */
export const ThemeToggle = () => {
  // Read after mounting, not while rendering: a prerendered page is rendered in Node, which has no
  // document, and the page's first render has to match it. A layout effect runs before the first
  // paint, so the switch never shows the wrong state.
  const [dark, setDark] = useState(false);
  useLayoutEffect(() => {
    setDark(isDark());
  }, []);

  const apply = (next: boolean) => {
    // flushSync so the switch has moved before the view transition captures the new state.
    flushSync(() => setDark(next));
    document.documentElement.classList.toggle("dark", next);
  };

  const onCheckedChange = (next: boolean) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // Storage can be blocked; the theme still applies for this page view.
    }

    // Crossfade the whole page; switch instantly where unsupported or unwanted.
    if (!document.startViewTransition || prefersReducedMotion()) {
      apply(next);
      return;
    }
    const transition = document.startViewTransition(() => apply(next));
    // A quick second toggle skips this animation; the theme is still applied.
    transition.ready.catch(() => {});
  };

  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <SunIcon className="size-4" aria-hidden />
      <SwitchPrimitive.Root
        checked={dark}
        onCheckedChange={onCheckedChange}
        aria-label="Dark theme"
        className="group/switch relative inline-flex h-[18.4px] w-[32px] shrink-0 cursor-pointer items-center rounded-full border border-transparent shadow-xs transition-all outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:bg-primary data-unchecked:bg-input dark:data-unchecked:bg-input/80"
      >
        <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-background ring-0 transition-transform data-checked:translate-x-[calc(100%-2px)] data-unchecked:translate-x-0 dark:data-checked:bg-primary-foreground dark:data-unchecked:bg-foreground" />
      </SwitchPrimitive.Root>
      <MoonIcon className="size-4" aria-hidden />
    </div>
  );
};
