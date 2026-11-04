import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { cn } from "cn";
import { useCallback, useRef } from "react";

import { type Site } from "../../lib/sites";

const boxClassName =
  "inline-flex min-h-6 items-center rounded-md py-0.75 font-logo text-xl leading-none font-semibold tracking-[-0.02em]";

// The current site's box uses the app's `primary`.
const triggerColourClassName = "bg-primary text-primary-foreground";

// Each site's own colours for its box in the menu, mirroring `primary` (700 in light mode, 400 in
// dark mode; highlighted 800 and 300). Full class names, as Tailwind only generates what it finds as text.
const paletteClassNames = {
  violet:
    "bg-violet-700 text-white group-data-highlighted/site:bg-violet-800 dark:bg-violet-400 dark:text-violet-950 dark:group-data-highlighted/site:bg-violet-300",
  emerald:
    "bg-emerald-700 text-white group-data-highlighted/site:bg-emerald-800 dark:bg-emerald-400 dark:text-emerald-950 dark:group-data-highlighted/site:bg-emerald-300",
  amber:
    "bg-amber-700 text-white group-data-highlighted/site:bg-amber-800 dark:bg-amber-400 dark:text-amber-950 dark:group-data-highlighted/site:bg-amber-300",
} satisfies Record<Site["palette"], string>;

type SiteSwitcherProps = {
  sites: readonly Site[];
  current: Site;
};

/**
 * The logo's box: shows the current subdomain and opens the other sites, as more boxes sliding out
 * from under it, so they read as part of the same choice. They line up with its right edge, so their
 * labels line up with the rest of the logo. Near the window's left edge they line up with its left
 * edge instead, so none runs off the window.
 */
export const SiteSwitcher = ({ sites, current }: SiteSwitcherProps) => {
  const others = sites.filter((site) => site.url !== current.url);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Boxes wider than the trigger stick out to its left, outside the popup's own box, so Base UI's
  // collision handling can't see them. Measured once as the popup mounts (before it paints): if the
  // widest box, right-aligned, would come within 1rem of the window's left edge, all boxes left-align.
  const alignBoxes = useCallback((popup: HTMLDivElement | null) => {
    const trigger = triggerRef.current;
    if (!popup || !trigger) return;
    const boxes = popup.querySelectorAll("[data-site-box]");
    const widest = Math.max(0, ...Array.from(boxes, (box) => box.getBoundingClientRect().width));
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    popup.toggleAttribute("data-align-left", trigger.getBoundingClientRect().right - widest < rem);
  }, []);
  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger
        ref={triggerRef}
        aria-label="Switch site"
        className={cn(
          boxClassName,
          triggerColourClassName,
          "notch cursor-pointer pr-3 pl-1.75 outline-none hover:[--notch-color:var(--foreground)] focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:[--notch-color:var(--foreground)]",
        )}
      >
        {current.subdomain}
      </MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        {/* Clips the list at the box's bottom edge (only there: a box wider than the trigger sticks out
            to the left), so it slides out from under it. The gap above the first box is padding, the
            same as the gap between boxes (wider on touch screens, so they're easier to tap). */}
        <MenuPrimitive.Positioner
          align="start"
          sideOffset={0}
          className="isolate z-50 pt-(--gap) [clip-path:inset(0_-100vw_-100vh_-100vw)] outline-none [--gap:--spacing(1.5)] pointer-coarse:[--gap:--spacing(3)]"
        >
          {/* The boxes' column is the trigger's width (left-aligned, at least that), and the column gap
              is the logo's. */}
          <MenuPrimitive.Popup
            ref={alignBoxes}
            className="group/menu grid grid-cols-[var(--anchor-width)_auto] data-align-left:grid-cols-[minmax(var(--anchor-width),max-content)_auto] gap-x-1.75 gap-y-(--gap) outline-none data-open:animate-[slide-out_150ms_ease-out] data-closed:animate-[slide-out_100ms_ease-in_reverse] motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none"
          >
            {others.map((site) => (
              <MenuPrimitive.LinkItem
                key={site.url}
                href={site.url}
                label={site.label}
                className="group/site col-span-2 grid cursor-pointer grid-cols-subgrid items-center outline-none"
              >
                <span
                  data-site-box
                  className={cn(
                    boxClassName,
                    // Highlighted boxes turn darker in light mode, lighter in dark mode.
                    paletteClassNames[site.palette],
                    "px-1.75 whitespace-nowrap [justify-self:unsafe_end] group-data-align-left/menu:justify-self-start",
                  )}
                >
                  {site.subdomain}
                </span>
                <span className="text-[15px] text-muted-foreground group-data-highlighted/site:text-foreground">
                  {site.label}
                </span>
              </MenuPrimitive.LinkItem>
            ))}
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
};
