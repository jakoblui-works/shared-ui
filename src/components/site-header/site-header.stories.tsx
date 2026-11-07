/// <reference types="vite/client" />
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, type Mock, screen, waitFor } from "storybook/test";

import { speculationRulesText } from "../../index";
import { type Site, sites } from "../../lib/sites";
import { SiteHeader } from "./site-header";

// What an app's router link renders to: a plain anchor with the app's own href and attributes.
const testHref = "/test-home";
const testAttribute = "data-test-link";

// ---------------------------------------------------------------------------------------------
// Site transitions (T2.3, C1, C4). The mark's names are written out (the C1 strings) rather than
// imported, so these stories don't depend on the transition module's file to load.

const root = document.documentElement;
const MARK = "data-site-transition";
const MARK_TO = "data-site-transition-to";
const speculationRules = () => document.head.querySelectorAll<HTMLScriptElement>('script[type="speculationrules"]');

/** Whether something before the page's last click listener prevented the last link click. */
let lastLinkClick: { prevented: boolean } | null = null;

/**
 * Every story starts and ends with no mark on `<html>` and no speculation rules (the header inserts them
 * once per page and leaves them), so stories don't affect each other. A last click listener on `window`
 * notes whether a link click was already prevented, then prevents it, so the story never leaves the page
 * (also when the header lets the browser handle a click, or doesn't handle it at all yet).
 */
const resetTransitions = () => {
  const reset = () => {
    root.removeAttribute(MARK);
    root.removeAttribute(MARK_TO);
    speculationRules().forEach((script) => script.remove());
    lastLinkClick = null;
  };
  const guard = (event: MouseEvent) => {
    if (!(event.target instanceof Element) || !event.target.closest("a[href]")) return;
    lastLinkClick = { prevented: event.defaultPrevented };
    event.preventDefault();
  };
  reset();
  window.addEventListener("click", guard);
  return () => {
    window.removeEventListener("click", guard);
    reset();
  };
};

const meta: Meta<typeof SiteHeader> = {
  title: "SiteHeader",
  component: SiteHeader,
  beforeEach: resetTransitions,
  args: {
    current: "www",
    // Stories never leave the page: the header's transitions navigate through this stub.
    navigate: fn(),
    children: (
      <button type="button" className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground">
        work
      </button>
    ),
  },
};
export default meta;

type Story = StoryObj<typeof SiteHeader>;

export const Default: Story = {
  play: async ({ canvas }) => {
    // Without `homeLink`, `.jakoblui` is a plain link to the site's root.
    const home = canvas.getByRole("link", { name: "jakoblui home" });
    await expect(home.tagName).toBe("A");
    await expect(home).toHaveAttribute("href", "/");
    await expect(canvas.getByRole("button", { name: "work" })).toBeVisible();
  },
};

export const WithHomeLink: Story = {
  args: {
    homeLink: <a href={testHref} {...{ [testAttribute]: "" }} />,
  },
  play: async ({ canvas }) => {
    // The app's element is the link, its own attributes intact, with the header's name.
    const home = canvas.getByRole("link", { name: "jakoblui home" });
    await expect(home.tagName).toBe("A");
    await expect(home).toHaveAttribute("href", testHref);
    await expect(home).toHaveAttribute(testAttribute);
    await expect(canvas.getByRole("button", { name: "work" })).toBeVisible();
  },
};

const siteFor = (subdomain: string) => {
  const site = sites.find((candidate) => candidate.subdomain === subdomain);
  if (!site) throw new Error(`No site with subdomain "${subdomain}"`);
  return site;
};

type PlayContext = Parameters<NonNullable<Story["play"]>>[0];

/** Opens the switcher; its items are portalled outside the canvas. */
const openSwitcher = async ({ canvas, userEvent }: Pick<PlayContext, "canvas" | "userEvent">) => {
  await userEvent.click(canvas.getByRole("button", { name: "Switch site" }));
  return screen.findAllByRole("menuitem");
};

const itemFor = (items: HTMLElement[], site: Site) => {
  const item = items.find((candidate) => candidate.getAttribute("href") === site.url);
  if (!item) throw new Error(`No menu item for ${site.url}`);
  return item;
};

/** Generous: only turns a navigation that never comes into a clear failure (not the animation's length). */
const patience = { timeout: 4000 };

// L4 (lasting): links stay links. The click handler only delays a navigation; every site link is a real
// <a href>, and the cover (a pseudo-element) never takes pointer events.
export const LinksStayLinks: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const items = await openSwitcher({ canvas, userEvent });
    const others = sites.filter((site) => site.subdomain !== args.current);
    await expect(items).toHaveLength(others.length);
    for (const site of others) {
      const item = itemFor(items, site);
      await expect(item.tagName, `${site.subdomain}'s link`).toBe("A");
      await expect(item).toHaveAttribute("href", site.url);
    }

    const trigger = canvas.getByRole("button", { name: "Switch site" });
    const marks: Array<Record<string, string>> = [
      { [MARK]: "leaving", [MARK_TO]: siteFor("cv").palette },
      { [MARK]: "covered" },
      { [MARK]: "revealing" },
    ];
    for (const mark of marks) {
      for (const [name, value] of Object.entries(mark)) root.setAttribute(name, value);
      await expect(getComputedStyle(root, "::after").pointerEvents, `the cover, ${mark[MARK]}`).toBe("none");
      if (mark[MARK] === "covered") {
        // Covering the whole window, it still lets clicks through to the page.
        const box = trigger.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        await expect(trigger.contains(hit), "what's under the cover at the trigger").toBe(true);
      }
      root.removeAttribute(MARK);
      root.removeAttribute(MARK_TO);
    }
  },
};

// A plain click on another site's link in the switcher starts the transition and navigates once,
// through the stub, to that site.
export const ClickingAnotherSiteLeaves: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const cv = siteFor("cv");
    const items = await openSwitcher({ canvas, userEvent });
    await userEvent.click(itemFor(items, cv));

    await expect(lastLinkClick, "the header delays the browser's navigation").toEqual({ prevented: true });
    await expect(root).toHaveAttribute(MARK, "leaving");
    await waitFor(() => expect(args.navigate).toHaveBeenCalled(), patience);
    await expect(args.navigate).toHaveBeenCalledTimes(1);
    const [url] = (args.navigate as Mock<(url: string) => void>).mock.calls[0];
    // The link's href or the site's URL as written: the same address either way.
    await expect(new URL(url).href).toBe(new URL(cv.url).href);
  },
};

// A ctrl-click (new tab) is the browser's: no mark, no navigation by the header.
export const ModifiedClickIsTheBrowsers: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const items = await openSwitcher({ canvas, userEvent });
    await userEvent.keyboard("{Control>}");
    await userEvent.click(itemFor(items, siteFor("cv")));
    await userEvent.keyboard("{/Control}");

    await expect(lastLinkClick, "the click reached the page").not.toBeNull();
    await expect(lastLinkClick, "the browser handles it").toEqual({ prevented: false });
    await expect(root).not.toHaveAttribute(MARK);
    await expect(args.navigate).not.toHaveBeenCalled();
  },
};

type SpeculationCondition = {
  href_matches?: string | string[];
  and?: SpeculationCondition[];
  or?: SpeculationCondition[];
  not?: SpeculationCondition;
};
type SpeculationRule = { source?: string; urls?: string[]; where?: SpeculationCondition; eagerness?: string };

type URLPatternLike = { test(input: string): boolean };
const URLPatternCtor = (globalThis as unknown as { URLPattern: new (pattern: string, base: string) => URLPatternLike })
  .URLPattern;

/** Whether a document rule's condition matches a link to `url`, as the browser evaluates it. */
const conditionMatches = (condition: SpeculationCondition, url: string): boolean => {
  if (condition.href_matches !== undefined) {
    const patterns = [condition.href_matches].flat();
    if (!patterns.some((pattern) => new URLPatternCtor(pattern, document.baseURI).test(url))) return false;
  }
  if (condition.and && !condition.and.every((part) => conditionMatches(part, url))) return false;
  if (condition.or && !condition.or.some((part) => conditionMatches(part, url))) return false;
  if (condition.not && conditionMatches(condition.not, url)) return false;
  return true;
};

const ruleMatches = (rule: SpeculationRule, url: string) =>
  rule.urls ? rule.urls.some((listed) => new URL(listed, document.baseURI).href === url) : conditionMatches(rule.where ?? {}, url);

/** One header remounts on demand, beside a second one: still one set of speculation rules. */
const RemountableHeaders = (args: PlayContext["args"]) => {
  const [generation, setGeneration] = useState(0);
  return (
    <>
      <SiteHeader key={generation} {...args} />
      <SiteHeader {...args} />
      <button type="button" onClick={() => setGeneration((value) => value + 1)}>
        Remount
      </button>
    </>
  );
};

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

// C4: the page has exactly one speculation-rules script, prerendering links to the other sites
// (eagerness moderate), never the current one; however many headers render, or re-render.
export const SpeculationRulesOnce: Story = {
  args: { current: "cv" },
  render: (args) => <RemountableHeaders {...args} />,
  play: async ({ args, canvas, userEvent }) => {
    await waitFor(() => expect(speculationRules()).toHaveLength(1));

    await userEvent.click(canvas.getByRole("button", { name: "Remount" }));
    await nextFrame();
    await waitFor(() => expect(speculationRules()).toHaveLength(1));

    const rules = JSON.parse(speculationRules()[0].textContent ?? "") as { prerender?: SpeculationRule[] };
    const prerender = rules.prerender ?? [];
    await expect(prerender.length, "prerender rules").toBeGreaterThan(0);
    for (const rule of prerender) await expect(rule.eagerness).toBe("moderate");
    const prerendered = (url: string) => prerender.some((rule) => ruleMatches(rule, url));

    for (const site of sites) {
      const urls = [new URL(site.url).href, new URL("/some/page?q=1", site.url).href];
      for (const url of urls) {
        await expect(prerendered(url), url).toBe(site.subdomain !== args.current);
      }
    }
    await expect(prerendered(new URL("/elsewhere", document.baseURI).href), "this page's own origin").toBe(false);
  },
};

// C4 (lasting): the inserted text is exactly the package's `speculationRulesText`, character for
// character, since a site's CSP build allows it by its hash; any difference silently stops prerendering.
export const SpeculationRulesTextIsTheExportedText: Story = {
  args: { current: "ats" },
  play: async ({ args }) => {
    const selector = `script[type="speculationrules"][${MARK}]`;
    await waitFor(() => expect(document.head.querySelectorAll(selector)).toHaveLength(1));
    await expect(document.head.querySelector(selector)!.textContent).toBe(speculationRulesText(args.current));
  },
};

// Plan rule (lasting): with reduced motion, the cover fades instead of sliding. CSS decides, so the
// browser's media is emulated (Chromium, through the test runner's CDP session); outside the test
// runner (the Storybook UI) there is no emulation and the story only renders.
export const ReducedMotionFades: Story = {
  play: async () => {
    if (import.meta.env.MODE !== "test") return;
    const { cdp } = await import("vitest/browser");
    // The Playwright provider's session; its types don't name `send` without Playwright's own.
    const session = cdp() as unknown as { send: (method: string, params: object) => Promise<unknown> };
    await session.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    try {
      await expect(matchMedia("(prefers-reduced-motion: reduce)").matches, "reduced motion emulated").toBe(true);
      const marks: Array<[string, Record<string, string>]> = [
        ["leaving", { [MARK]: "leaving", [MARK_TO]: siteFor("cv").palette }],
        ["revealing", { [MARK]: "revealing" }],
      ];
      for (const [state, mark] of marks) {
        for (const [name, value] of Object.entries(mark)) root.setAttribute(name, value);
        const cover = getComputedStyle(root, "::after");
        // A fade (one of the opacity keyframes), never a slide.
        await expect(["site-transition-fade-in", "site-transition-fade-out"], state).toContain(cover.animationName);
        await expect(cover.transform, state).toBe("none");
        root.removeAttribute(MARK);
        root.removeAttribute(MARK_TO);
      }
    } finally {
      await session.send("Emulation.setEmulatedMedia", { features: [] });
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Arrival and listener balance through the header (T2.3 review).

/** The mark's values from `beforeEach` on, in order: each change's old value, then the current one. */
let markHistory: Array<string | null> = [];

// A page arriving covered (the head script set the mark before the first paint): once the header
// mounts, the cover reveals and both marks go.
export const ArrivesThroughTheHeader: Story = {
  beforeEach: () => {
    markHistory = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) markHistory.push(record.oldValue);
    });
    root.setAttribute(MARK, "covered");
    observer.observe(root, { attributes: true, attributeFilter: [MARK], attributeOldValue: true });
    return () => observer.disconnect();
  },
  play: async () => {
    await waitFor(() => expect(root).not.toHaveAttribute(MARK), patience);
    await expect(root).not.toHaveAttribute(MARK_TO);
    // covered → revealing → removed.
    await expect([...markHistory, root.getAttribute(MARK)]).toEqual(["covered", "revealing", null]);
  },
};

/** A second navigate stub, for the header after it re-renders with a new one. */
const nextNavigate = fn();

/** The header, a button giving it a new `navigate`, a button unmounting it, and a link to another site. */
const Rewirable = (args: PlayContext["args"]) => {
  const [state, setState] = useState<"first" | "second" | "unmounted">("first");
  return (
    <>
      {state !== "unmounted" && <SiteHeader {...args} navigate={state === "first" ? args.navigate : nextNavigate} />}
      <button type="button" onClick={() => setState("second")}>
        New navigate
      </button>
      <button type="button" onClick={() => setState("unmounted")}>
        Unmount
      </button>
      <a href={siteFor("ats").url}>Another site</a>
    </>
  );
};

// Re-rendering with a new `navigate` swaps the listener (one click, one navigation, through the new
// function); unmounting removes it (a click is the browser's again).
export const ListenersFollowTheHeader: Story = {
  render: (args) => <Rewirable {...args} />,
  beforeEach: () => {
    nextNavigate.mockClear();
  },
  play: async ({ args, canvas, userEvent }) => {
    const other = canvas.getByRole("link", { name: "Another site" });
    await userEvent.click(canvas.getByRole("button", { name: "New navigate" }));

    await userEvent.click(other);
    await expect(lastLinkClick).toEqual({ prevented: true });
    await waitFor(() => expect(nextNavigate).toHaveBeenCalled(), patience);
    await expect(nextNavigate).toHaveBeenCalledTimes(1);
    await expect(args.navigate).not.toHaveBeenCalled();

    // The leave is over as far as this story goes: a fresh page state for the next click.
    root.removeAttribute(MARK);
    root.removeAttribute(MARK_TO);
    await userEvent.click(canvas.getByRole("button", { name: "Unmount" }));
    await waitFor(() => expect(canvas.queryByRole("button", { name: "Switch site" })).toBeNull());

    lastLinkClick = null;
    await userEvent.click(other);
    await expect(lastLinkClick, "the click reached the page").not.toBeNull();
    await expect(lastLinkClick, "no header, no listener").toEqual({ prevented: false });
    await expect(root).not.toHaveAttribute(MARK);
  },
};
