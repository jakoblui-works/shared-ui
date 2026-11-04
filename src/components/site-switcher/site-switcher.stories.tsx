import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, screen, waitFor, within } from "storybook/test";

import { type Site, sites } from "../../lib/sites";
import { SiteSwitcher } from "./site-switcher";

const meta: Meta<typeof SiteSwitcher> = {
  title: "SiteSwitcher",
  component: SiteSwitcher,
  args: { sites, current: sites[0] },
};
export default meta;

type Story = StoryObj<typeof SiteSwitcher>;

const opensWithTheOtherSites: Story["play"] = async ({ args, canvas, userEvent }) => {
  const trigger = canvas.getByRole("button", { name: "Switch site" });
  await expect(trigger.textContent?.trim()).toBe(args.current.subdomain);
  await userEvent.click(trigger);

  // The popup is portalled outside the canvas. The current site is the trigger, so it isn't listed.
  const others = args.sites.filter((site) => site.url !== args.current.url);
  const items = await screen.findAllByRole("menuitem");
  await expect(items.map((item) => item.getAttribute("href")).sort()).toEqual(
    others.map((site) => site.url).sort(),
  );
  for (const site of others) {
    const item = items.find((candidate) => candidate.getAttribute("href") === site.url);
    await expect(item).toHaveTextContent(site.subdomain);
    await expect(item).toHaveTextContent(site.label);
  }
};

export const OnTheHub: Story = {
  args: { current: sites[0] },
  play: opensWithTheOtherSites,
};

export const OnCv: Story = {
  args: { current: sites[1] },
  play: opensWithTheOtherSites,
};

// ---------------------------------------------------------------------------------------------
// Helpers for the colour and alignment stories.

const root = document.documentElement;

/**
 * Starts the story with `<html>` in the given theme and puts the class back afterwards (as in
 * theme-toggle's stories). The story also sets `themeOverride`, so the toolbar's decorator agrees.
 */
const startIn = (dark: boolean) => () => {
  const wasDark = root.classList.contains("dark");
  root.classList.toggle("dark", dark);
  return () => {
    root.classList.toggle("dark", wasDark);
  };
};

type Mode = "light" | "dark";

/**
 * Each palette at the step a site's box should have in each mode, as probe classes. Written out in
 * full so Tailwind generates them. Mirrors `primary`: 700 light / 400 dark, highlighted 800 / 300.
 */
const paletteProbes = {
  violet: {
    light: { box: "bg-violet-700", highlighted: "bg-violet-800" },
    dark: { box: "bg-violet-400", highlighted: "bg-violet-300" },
  },
  emerald: {
    light: { box: "bg-emerald-700", highlighted: "bg-emerald-800" },
    dark: { box: "bg-emerald-400", highlighted: "bg-emerald-300" },
  },
  amber: {
    light: { box: "bg-amber-700", highlighted: "bg-amber-800" },
    dark: { box: "bg-amber-400", highlighted: "bg-amber-300" },
  },
} satisfies Record<Site["palette"], Record<Mode, { box: string; highlighted: string }>>;

/** The computed value of a CSS property on a hidden element with the given classes, in the current theme. */
const probe = (className: string, property: "backgroundColor" | "color") => {
  const element = document.createElement("span");
  element.className = className;
  element.style.position = "absolute";
  element.style.visibility = "hidden";
  document.body.append(element);
  try {
    return getComputedStyle(element)[property];
  } finally {
    element.remove();
  }
};

const transparent = (color: string) => color === "transparent" || color === "rgba(0, 0, 0, 0)";

/** The painted box around a subdomain: the nearest element from its text up to `container` with a background. */
const boxOf = (container: HTMLElement, subdomain: string) => {
  let element: HTMLElement = within(container).getByText(subdomain);
  while (element !== container && transparent(getComputedStyle(element).backgroundColor)) {
    element = element.parentElement!;
  }
  return element;
};

const itemFor = (items: HTMLElement[], site: Site) => {
  const item = items.find((candidate) => candidate.getAttribute("href") === site.url);
  if (!item) throw new Error(`No menu item for ${site.url}`);
  return item;
};

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Waits for the popup's opening animation to finish and its items' positions to stop changing. */
const settled = async (elements: Element[]) => {
  const menu = await screen.findByRole("menu");
  await Promise.all(menu.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
  const layout = () => JSON.stringify(elements.map((element) => element.getBoundingClientRect()));
  let before = layout();
  for (;;) {
    await nextFrame();
    const after = layout();
    if (after === before) return;
    before = after;
  }
};

type PlayContext = Parameters<NonNullable<Story["play"]>>[0];

const openMenu = async ({ canvas, userEvent }: Pick<PlayContext, "canvas" | "userEvent">) => {
  const trigger = canvas.getByRole("button", { name: "Switch site" });
  await userEvent.click(trigger);
  const items = await screen.findAllByRole("menuitem");
  return { trigger, items };
};

// ---------------------------------------------------------------------------------------------
// T2: each item's box is in its own site's palette; the trigger stays `primary`.

const boxesInTheirSitesPalettes =
  (mode: Mode): Story["play"] =>
  async ({ args, canvas, userEvent }) => {
    const { trigger, items } = await openMenu({ canvas, userEvent });
    const others = args.sites.filter((site) => site.url !== args.current.url);

    // The trigger keeps the app's `primary`, whichever site is current.
    await expect(getComputedStyle(boxOf(trigger, args.current.subdomain)).backgroundColor).toBe(
      probe("bg-primary", "backgroundColor"),
    );

    const mutedForeground = probe("text-muted-foreground", "color");
    const backgrounds = new Set<string>();
    for (const site of others) {
      await expect(Object.keys(paletteProbes), `${site.subdomain} has a known palette`).toContain(site.palette);
      const item = itemFor(items, site);
      const box = boxOf(item, site.subdomain);
      const background = getComputedStyle(box).backgroundColor;
      await expect(background, `${site.subdomain}'s box`).toBe(
        probe(paletteProbes[site.palette][mode].box, "backgroundColor"),
      );
      backgrounds.add(background);
      await expect(getComputedStyle(within(item).getByText(site.label)).color, `${site.label}'s label`).toBe(
        mutedForeground,
      );
    }
    // Different sites, different boxes.
    await expect(backgrounds.size).toBe(others.length);

    // Highlighted, a box takes its palette's highlight step.
    for (const site of others) {
      const item = itemFor(items, site);
      await userEvent.hover(item);
      const highlighted = probe(paletteProbes[site.palette][mode].highlighted, "backgroundColor");
      await waitFor(() => {
        const background = getComputedStyle(boxOf(item, site.subdomain)).backgroundColor;
        expect(background, `${site.subdomain}'s highlighted box`).toBe(highlighted);
      });
    }
  };

// Current site is not the hub, so a trigger in the current site's palette would differ from `primary`.
export const SiteColoursLight: Story = {
  args: { current: sites[1] },
  parameters: { themes: { themeOverride: "light" } },
  beforeEach: startIn(false),
  play: boxesInTheirSitesPalettes("light"),
};

export const SiteColoursDark: Story = {
  args: { current: sites[2] },
  parameters: { themes: { themeOverride: "dark" } },
  beforeEach: startIn(true),
  play: boxesInTheirSitesPalettes("dark"),
};

// ---------------------------------------------------------------------------------------------
// T3: boxes right-align under the trigger, unless one would come within 1rem of the window's left
// edge; then they all left-align with the trigger.

/** A site whose box is much wider than the trigger's (invented for the stories). */
const withLongSubdomain: readonly Site[] = [
  ...sites,
  {
    subdomain: "playground-lab",
    label: "Playground",
    url: "https://playground-lab.example.test",
    palette: "violet",
  },
];

const tolerance = 1; // px, for sub-pixel rounding

const rem = () => parseFloat(getComputedStyle(root).fontSize);

const measure = async ({ args, canvas, userEvent }: PlayContext) => {
  const { trigger, items } = await openMenu({ canvas, userEvent });
  const others = args.sites.filter((site) => site.url !== args.current.url);
  const boxes = others.map((site) => boxOf(itemFor(items, site), site.subdomain));
  const labels = others.map((site) => within(itemFor(items, site)).getByText(site.label));
  await settled([trigger, ...boxes, ...labels]);
  const triggerRect = trigger.getBoundingClientRect();
  const boxRects = boxes.map((box) => box.getBoundingClientRect());
  const labelRects = labels.map((label) => label.getBoundingClientRect());
  // The case only means something if a box is wider than the trigger.
  await expect(Math.max(...boxRects.map((rect) => rect.width)), "the widest box's width").toBeGreaterThan(
    triggerRect.width + tolerance,
  );
  return { triggerRect, boxRects, labelRects };
};

/** Labels line up with each other, to the right of every box. */
const labelsInAColumnRightOfTheBoxes = async (boxRects: DOMRect[], labelRects: DOMRect[]) => {
  const labelLeft = labelRects[0].left;
  for (const rect of labelRects) await expect(Math.abs(rect.left - labelLeft)).toBeLessThanOrEqual(tolerance);
  for (const rect of boxRects) await expect(rect.right).toBeLessThanOrEqual(labelLeft + tolerance);
};

export const AlignedRightWithRoom: Story = {
  args: { sites: withLongSubdomain, current: sites[0] },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ paddingLeft: "50vw", paddingTop: "1rem" }}>
        <Story />
      </div>
    ),
  ],
  play: async (context) => {
    const { triggerRect, boxRects, labelRects } = await measure(context);
    // Room to the left: right-aligned, the widest box keeps more than 1rem from the window's edge.
    const widest = Math.max(...boxRects.map((rect) => rect.width));
    await expect(triggerRect.right - widest, "room for the widest box, right-aligned").toBeGreaterThan(
      rem() + tolerance,
    );
    for (const rect of boxRects) {
      await expect(Math.abs(rect.right - triggerRect.right), "a box's right edge vs the trigger's").toBeLessThanOrEqual(
        tolerance,
      );
    }
    await labelsInAColumnRightOfTheBoxes(boxRects, labelRects);
  },
};

export const AlignedLeftNearTheEdge: Story = {
  args: { sites: withLongSubdomain, current: sites[0] },
  parameters: { layout: "fullscreen" },
  // Like the header's `px-4`.
  decorators: [
    (Story) => (
      <div style={{ paddingLeft: "1rem", paddingTop: "1rem" }}>
        <Story />
      </div>
    ),
  ],
  play: async (context) => {
    const { triggerRect, boxRects, labelRects } = await measure(context);
    const fromEdge = Math.abs(triggerRect.left - rem());
    await expect(fromEdge, "the trigger sits 1rem from the window's edge").toBeLessThanOrEqual(tolerance);
    for (const rect of boxRects) {
      await expect(rect.left, "a box's distance from the window's left edge").toBeGreaterThanOrEqual(rem() - tolerance);
    }
    for (const rect of boxRects) {
      await expect(Math.abs(rect.left - triggerRect.left), "a box's left edge vs the trigger's").toBeLessThanOrEqual(
        tolerance,
      );
    }
    await labelsInAColumnRightOfTheBoxes(boxRects, labelRects);
  },
};
