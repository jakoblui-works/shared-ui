// T2.1: the transition core, in headless Chromium (the "unit" project), against the real DOM,
// cookies and CSS animations. Navigation is always injected, so the test page never leaves.
//
// The tests don't load theme.css (T2.2): with no cover animation, leave() and arrive() finish on their
// fallback. Where a test needs a cover animation it adds its own, so neither the duration nor the
// easing of the real one matters here.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as pkg from "../index";
import {
  arrive,
  cookieDomain,
  installSiteTransitions,
  leave,
  SITE_TRANSITION_ATTRIBUTE,
  SITE_TRANSITION_COOKIE,
  SITE_TRANSITION_TO_ATTRIBUTE,
  transitionTarget,
} from "./site-transition";
import { type Site, sites } from "./sites";

const [www, cv, ats] = sites;
const root = document.documentElement;

/** Generous: only turns an outcome that never comes into a clear failure, never a pass/fail threshold. */
const patience = { timeout: 4000, interval: 10 };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------------------------
// Shared setup: every test starts and ends with no mark, no cookie, no test elements and no test CSS.

const deleteCookie = () => {
  document.cookie = `${SITE_TRANSITION_COOKIE}=; path=/; max-age=0`;
};

const resetMarks = () => {
  root.removeAttribute(SITE_TRANSITION_ATTRIBUTE);
  root.removeAttribute(SITE_TRANSITION_TO_ATTRIBUTE);
};

let container: HTMLElement;
const cleanups: Array<() => void> = [];

beforeEach(() => {
  resetMarks();
  deleteCookie();
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  container.remove();
  resetMarks();
  deleteCookie();
});

/** A link in the test page. */
const link = (href: string | null, attributes: Record<string, string> = {}) => {
  const a = document.createElement("a");
  if (href !== null) a.setAttribute("href", href);
  for (const [name, value] of Object.entries(attributes)) a.setAttribute(name, value);
  a.textContent = "a link";
  container.append(a);
  return a;
};

/**
 * Dispatches a click as the browser would (bubbling, cancelable, primary button unless `init` says
 * otherwise). A last listener on `window` notes whether anything before it prevented the default, then
 * prevents it itself, so the test page never follows a link.
 */
const click = (element: Element, init: MouseEventInit = {}) => {
  let prevented = false;
  const guard = (event: Event) => {
    prevented = event.defaultPrevented;
    event.preventDefault();
  };
  window.addEventListener("click", guard);
  try {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }));
  } finally {
    window.removeEventListener("click", guard);
  }
  return { prevented };
};

/**
 * A cover animation on `html[data-site-transition]::after`, standing in for theme.css's. Any length
 * works for the outcome; tests that tell the animation's end from the fallback make it shorter than the
 * measured fallback.
 */
const addCoverAnimation = (durationMs = 60) => {
  const style = document.createElement("style");
  style.textContent = `
    @keyframes test-cover { from { opacity: 0 } to { opacity: 1 } }
    html[${SITE_TRANSITION_ATTRIBUTE}]::after {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      animation: test-cover ${Math.round(durationMs)}ms linear both;
    }`;
  document.head.append(style);
  cleanups.push(() => style.remove());
};

/** The values `data-site-transition` takes from now on, in order (null: removed). */
const recordMarks = () => {
  // Each mutation's old value is the state before it; the current value is the last state. Old values
  // are exact even when several changes land in one batch (reading the attribute in the callback isn't).
  const oldValues: Array<string | null> = [];
  const observer = new MutationObserver((records) => {
    for (const record of records) oldValues.push(record.oldValue);
  });
  observer.observe(root, { attributes: true, attributeFilter: [SITE_TRANSITION_ATTRIBUTE], attributeOldValue: true });
  cleanups.push(() => observer.disconnect());
  /** The states after the starting one, in order, ending with the current one (null: removed). */
  return () => {
    for (const record of observer.takeRecords()) oldValues.push(record.oldValue);
    return [...oldValues.slice(1), root.getAttribute(SITE_TRANSITION_ATTRIBUTE)];
  };
};

/** Stubs `document.prerendering` (real prerendering can't happen under Playwright). */
const stubPrerendering = (initial: boolean) => {
  let prerendering = initial;
  Object.defineProperty(document, "prerendering", { configurable: true, get: () => prerendering });
  cleanups.push(() => {
    delete (document as { prerendering?: boolean }).prerendering;
  });
  return {
    activate: () => {
      prerendering = false;
      document.dispatchEvent(new Event("prerenderingchange"));
    },
  };
};

/**
 * How long to wait before concluding that nothing more will happen: twice the longer of leave()'s and
 * arrive()'s own fallback, as measured here (not a number from the implementation or the CSS).
 */
let quietPeriod = 0;
/** leave()'s and arrive()'s own fallbacks, as measured with no cover animation. */
const fallback = { leaving: 0, arriving: 0 };
const measureQuietPeriod = async () => {
  if (quietPeriod) return;
  let start = performance.now();
  const navigate = vi.fn();
  leave(cv.url, cv, { navigate });
  await vi.waitFor(() => expect(navigate).toHaveBeenCalled(), patience);
  const leaving = performance.now() - start;
  resetMarks();
  deleteCookie();

  root.setAttribute(SITE_TRANSITION_ATTRIBUTE, "covered");
  start = performance.now();
  arrive();
  await vi.waitFor(() => expect(root.hasAttribute(SITE_TRANSITION_ATTRIBUTE)).toBe(false), patience);
  const arriving = performance.now() - start;
  resetMarks();

  fallback.leaving = leaving;
  fallback.arriving = arriving;
  quietPeriod = 2 * Math.max(leaving, arriving) + 100;
};

/** Chromium's Cookie Store also reports a cookie's attributes (TypeScript's DOM types only name and value). */
type CookieWithAttributes = CookieListItem & {
  domain: string | null;
  path: string;
  expires: number | null;
  sameSite: string;
};

/**
 * A document at `url`: a real (detached) <html>, a location, and a cookie jar that keeps every string
 * written to `document.cookie`.
 */
const documentOn = (url: string) => {
  const written: string[] = [];
  const page = {
    documentElement: document.createElement("html"),
    defaultView: window,
    location: new URL(url),
    URL: url,
    baseURI: url,
    get cookie() {
      return "";
    },
    set cookie(value: string) {
      written.push(value);
    },
  } as unknown as Document;
  return { page, written };
};

// ---------------------------------------------------------------------------------------------

describe("the C1/C2 names", () => {
  it("are the contract's strings, exported from the package", () => {
    expect(pkg.SITE_TRANSITION_ATTRIBUTE).toBe("data-site-transition");
    expect(pkg.SITE_TRANSITION_TO_ATTRIBUTE).toBe("data-site-transition-to");
    expect(pkg.SITE_TRANSITION_COOKIE).toBe("site-transition");
  });

  it("the mark's states are the contract's strings, exported from the package", () => {
    expect(pkg.SITE_TRANSITION_STATES).toEqual({ leaving: "leaving", covered: "covered", revealing: "revealing" });
  });
});

describe("cookieDomain", () => {
  it.each([
    ["cv.jakoblui.com", "jakoblui.com"],
    ["jakoblui.com", "jakoblui.com"],
    ["a.b.example.com", "example.com"],
    ["cv.jakoblui.localhost", "jakoblui.localhost"],
  ])("%s → the last two labels (%s)", (hostname, domain) => {
    expect(cookieDomain(hostname)).toBe(domain);
  });

  it.each(["localhost", "127.0.0.1", "192.168.1.20", "[::1]"])("%s → null (host-only cookie)", (hostname) => {
    expect(cookieDomain(hostname)).toBeNull();
  });
});

describe("transitionTarget", () => {
  /** What transitionTarget says about a click on `element`, with `current` as this site. */
  const classify = (element: Element, init: MouseEventInit = {}, current: Site = www) => {
    let result: Site | null | undefined;
    const listener = (event: MouseEvent) => {
      result = transitionTarget(event, sites, current);
    };
    document.addEventListener("click", listener);
    try {
      click(element, init);
    } finally {
      document.removeEventListener("click", listener);
    }
    return result;
  };

  it.each<[string, () => Element, Site]>([
    ["a link to another site", () => link(cv.url), cv],
    ["a link to a page on another site", () => link(`${ats.url}/some/page?q=1#top`), ats],
    ['a link with target="_self"', () => link(cv.url, { target: "_self" }), cv],
    ["a child element inside the link", () => link(cv.url).appendChild(document.createElement("span")), cv],
  ])("transitions: %s", (_, build, expected) => {
    expect(classify(build())).toEqual(expected);
  });

  it.each<[string, MouseEventInit]>([
    ["ctrl", { ctrlKey: true }],
    ["meta (cmd)", { metaKey: true }],
    ["shift", { shiftKey: true }],
    ["alt", { altKey: true }],
    ["middle button", { button: 1 }],
    ["secondary button", { button: 2 }],
  ])("lets the browser handle a modified click: %s", (_, init) => {
    expect(classify(link(cv.url), init)).toBeNull();
  });

  it("lets the browser handle a click something else already prevented", () => {
    const a = link(cv.url);
    a.addEventListener("click", (event) => event.preventDefault());
    expect(classify(a)).toBeNull();
  });

  it.each<[string, () => Element]>([
    ['target="_blank"', () => link(cv.url, { target: "_blank" })],
    ["download", () => link(cv.url, { download: "" })],
    ["a link to the current site", () => link(`${www.url}/about`)],
    ["a same-origin link", () => link("/about")],
    ["a link to an unrelated origin", () => link("https://example.com/")],
    ["another site over another scheme (another origin)", () => link(cv.url.replace("https:", "http:"))],
    ["an <a> without href", () => link(null)],
    ["a button", () => container.appendChild(document.createElement("button"))],
  ])("lets the browser handle: %s", (_, build) => {
    expect(classify(build())).toBeNull();
  });

  it("decides 'current' from its argument, not the page's location", () => {
    expect(classify(link(cv.url), {}, cv)).toBeNull();
    expect(classify(link(www.url), {}, cv)).toEqual(www);
  });
});

describe("leave", { timeout: 20_000 }, () => {
  beforeAll(measureQuietPeriod, 20_000);

  it("writes the arrival signal: the destination's host, path=/, 10 s, host-only on localhost", async () => {
    // A same-origin page deeper than "/" (whatever the server answers there), so a cookie without
    // path=/ would get that page's directory instead.
    const frame = document.createElement("iframe");
    container.append(frame);
    await new Promise((resolve) => {
      frame.addEventListener("load", resolve, { once: true });
      frame.src = "/a/deeper/page";
    });
    const page = frame.contentDocument!;
    const before = Date.now();
    const navigate = vi.fn();
    leave(`${cv.url}/some/page`, cv, { navigate, document: page });

    expect(page.cookie.split("; ")).toContain(`${SITE_TRANSITION_COOKIE}=${new URL(cv.url).host}`);
    // document.cookie hides the attributes; the Cookie Store API shows them.
    const cookie = (await frame.contentWindow!.cookieStore.get(SITE_TRANSITION_COOKIE)) as CookieWithAttributes | null;
    expect(cookie).toMatchObject({ value: new URL(cv.url).host, path: "/" });
    // The test page is on localhost, a single label: no Domain attribute.
    expect(cookie?.domain ?? null).toBeNull();
    // max-age=10 (C2), allowing a second for the clock between the two readings.
    expect(cookie?.expires).toBeGreaterThanOrEqual(before + 10_000 - 1000);
    expect(cookie?.expires).toBeLessThanOrEqual(Date.now() + 10_000 + 1000);
    // SameSite=Lax isn't checked: Chromium reports "lax" for a cookie written without SameSite too.
    // path=/: the whole site sees it, this page too.
    expect(document.cookie.split("; ")).toContain(`${SITE_TRANSITION_COOKIE}=${new URL(cv.url).host}`);

    await vi.waitFor(() => expect(navigate).toHaveBeenCalled(), patience);
  });

  it.each([
    ["with no cover animation (the fallback)", false],
    ["with a cover animation", true],
  ])("marks <html> leaving, then navigates exactly once to the href, %s", async (_, animated) => {
    if (animated) addCoverAnimation();
    const navigate = vi.fn();
    const href = `${ats.url}/some/page?q=1`;
    leave(href, ats, { navigate });

    expect(root.getAttribute(SITE_TRANSITION_ATTRIBUTE)).toBe("leaving");
    expect(root.getAttribute(SITE_TRANSITION_TO_ATTRIBUTE)).toBe(ats.palette);
    // Not straight away: the cover has to come in first.
    expect(navigate).not.toHaveBeenCalled();

    await vi.waitFor(() => expect(navigate).toHaveBeenCalled(), patience);
    expect(navigate).toHaveBeenCalledWith(href);
    // Neither a second animationend nor a still-pending fallback navigates again.
    await sleep(quietPeriod);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("doesn't take another element's animation (e.g. the switcher closing) for the cover's", async () => {
    const navigate = vi.fn();
    leave(cv.url, cv, { navigate });
    const menu = container.appendChild(document.createElement("div"));
    menu.dispatchEvent(new AnimationEvent("animationend", { bubbles: true, animationName: "slide-out" }));
    root.dispatchEvent(new AnimationEvent("animationend", { bubbles: true, animationName: "slide-out" }));
    expect(navigate).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(1), patience);
  });

  it("navigates when the cover's animation ends, before the fallback would", async () => {
    // A cover animation a fifth of the measured fallback: finishing well before the fallback can only
    // come from its animationend.
    addCoverAnimation(fallback.leaving / 5);
    const navigate = vi.fn();
    const start = performance.now();
    leave(cv.url, cv, { navigate });
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled(), patience);
    expect(performance.now() - start).toBeLessThan(fallback.leaving * 0.6);
  });

  it("writes Domain from its document's hostname (the platform's two last labels)", async () => {
    // A document on cv.jakoblui.com: a real (detached) <html>, a location, and a cookie jar that keeps
    // what was written. The test page itself is on localhost, where no Domain would be written.
    const { page, written } = documentOn(`${cv.url}/some/page`);
    const navigate = vi.fn();
    leave(`${ats.url}/`, ats, { navigate, document: page });

    const cookie = written.find((value) => value.startsWith(`${SITE_TRANSITION_COOKIE}=`));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/;\s*domain=\.?jakoblui\.com\s*(;|$)/i);
    // Its document, not the global one: nothing written here, no mark here.
    expect(document.cookie.split("; ").some((value) => value.startsWith(`${SITE_TRANSITION_COOKIE}=`))).toBe(false);
    expect(root.hasAttribute(SITE_TRANSITION_ATTRIBUTE)).toBe(false);
    expect(page.documentElement.getAttribute(SITE_TRANSITION_ATTRIBUTE)).toBe("leaving");
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled(), patience);
  });

  it("writes exactly the package's siteTransitionCookie for its href and its document's hostname", async () => {
    // web-template's tests read the signal from this function, so leave() must write nothing else.
    const { page, written } = documentOn(`${cv.url}/some/page`);
    const href = `${ats.url}/some/page?q=1`;
    const navigate = vi.fn();
    leave(href, ats, { navigate, document: page });

    expect(written).toEqual([pkg.siteTransitionCookie(href, page.location.hostname)]);
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled(), patience);
  });
});

describe("arrive", { timeout: 20_000 }, () => {
  beforeAll(measureQuietPeriod, 20_000);

  it.each([
    ["with no cover animation (the fallback)", false],
    ["with a cover animation", true],
  ])("covered → revealing → both attributes gone, %s", async (_, animated) => {
    if (animated) addCoverAnimation();
    root.setAttribute(SITE_TRANSITION_ATTRIBUTE, "covered");
    root.setAttribute(SITE_TRANSITION_TO_ATTRIBUTE, cv.palette); // a stray one: both go
    const marks = recordMarks();
    arrive();
    await vi.waitFor(() => expect(root.hasAttribute(SITE_TRANSITION_ATTRIBUTE)).toBe(false), patience);
    expect(marks()).toEqual(["revealing", null]);
    expect(root.hasAttribute(SITE_TRANSITION_TO_ATTRIBUTE)).toBe(false);
  });

  it("finishes revealing when the cover's animation ends, before the fallback would", async () => {
    addCoverAnimation(fallback.arriving / 5);
    root.setAttribute(SITE_TRANSITION_ATTRIBUTE, "covered");
    const start = performance.now();
    arrive();
    await vi.waitFor(() => expect(root.hasAttribute(SITE_TRANSITION_ATTRIBUTE)).toBe(false), patience);
    expect(performance.now() - start).toBeLessThan(fallback.arriving * 0.6);
  });

  it("leaves a leave alone that started while revealing (clears only if still revealing)", async () => {
    root.setAttribute(SITE_TRANSITION_ATTRIBUTE, "covered");
    arrive();
    await vi.waitFor(() => expect(root.getAttribute(SITE_TRANSITION_ATTRIBUTE)).toBe("revealing"), patience);
    const navigate = vi.fn();
    leave(`${ats.url}/`, ats, { navigate });
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled(), patience);
    // Past arrive's own end too.
    await sleep(quietPeriod);
    expect(root.getAttribute(SITE_TRANSITION_ATTRIBUTE)).toBe("leaving");
    expect(root.getAttribute(SITE_TRANSITION_TO_ATTRIBUTE)).toBe(ats.palette);
  });

  it.each<[string, Record<string, string>]>([
    ["no mark (a cold load)", {}],
    ["leaving", { [SITE_TRANSITION_ATTRIBUTE]: "leaving", [SITE_TRANSITION_TO_ATTRIBUTE]: "emerald" }],
    ["revealing", { [SITE_TRANSITION_ATTRIBUTE]: "revealing" }],
  ])("does nothing unless covered: %s", async (_, attributes) => {
    for (const [name, value] of Object.entries(attributes)) root.setAttribute(name, value);
    arrive();
    await sleep(quietPeriod);
    for (const name of [SITE_TRANSITION_ATTRIBUTE, SITE_TRANSITION_TO_ATTRIBUTE]) {
      expect(root.getAttribute(name), name).toBe(attributes[name] ?? null);
    }
  });

  it("while prerendering, stays covered until activation, then reveals", async () => {
    const prerender = stubPrerendering(true);
    root.setAttribute(SITE_TRANSITION_ATTRIBUTE, "covered");
    const marks = recordMarks();
    arrive();
    await sleep(quietPeriod);
    expect(root.getAttribute(SITE_TRANSITION_ATTRIBUTE)).toBe("covered");

    prerender.activate();
    await vi.waitFor(() => expect(root.hasAttribute(SITE_TRANSITION_ATTRIBUTE)).toBe(false), patience);
    expect(marks()).toEqual(["revealing", null]);
  });

  it("while prerendering, doesn't reveal if the head script removed the mark at activation (no signal)", async () => {
    const prerender = stubPrerendering(true);
    root.setAttribute(SITE_TRANSITION_ATTRIBUTE, "covered");
    // The head script's listener, registered before shared-ui's.
    const headScript = () => root.removeAttribute(SITE_TRANSITION_ATTRIBUTE);
    document.addEventListener("prerenderingchange", headScript);
    cleanups.push(() => document.removeEventListener("prerenderingchange", headScript));
    const marks = recordMarks();
    arrive();

    prerender.activate();
    await sleep(quietPeriod);
    expect(marks()).toEqual([null]);
  });

  it.each([
    ["present", `${new URL(cv.url).host}`],
    ["absent", null],
  ])("never writes or deletes the cookie (%s)", async (_, value) => {
    if (value !== null) document.cookie = `${SITE_TRANSITION_COOKIE}=${value}; path=/; max-age=10; SameSite=Lax`;
    root.setAttribute(SITE_TRANSITION_ATTRIBUTE, "covered");
    arrive();
    await vi.waitFor(() => expect(root.hasAttribute(SITE_TRANSITION_ATTRIBUTE)).toBe(false), patience);
    expect((await cookieStore.get(SITE_TRANSITION_COOKIE))?.value ?? null).toBe(value);
  });
});

describe("installSiteTransitions", { timeout: 20_000 }, () => {
  beforeAll(measureQuietPeriod, 20_000);

  const install = (navigate: (url: string) => void) => {
    const cleanup = installSiteTransitions({ sites, current: www, navigate });
    cleanups.push(cleanup);
    return cleanup;
  };

  const pageshow = (persisted: boolean) => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted }));

  it("arrives once installed: a covered page reveals", async () => {
    root.setAttribute(SITE_TRANSITION_ATTRIBUTE, "covered");
    const marks = recordMarks();
    install(vi.fn());
    await vi.waitFor(() => expect(root.hasAttribute(SITE_TRANSITION_ATTRIBUTE)).toBe(false), patience);
    expect(marks()).toEqual(["revealing", null]);
  });

  it("a pageshow from the back/forward cache clears both attributes; an ordinary pageshow doesn't", () => {
    install(vi.fn());
    root.setAttribute(SITE_TRANSITION_ATTRIBUTE, "leaving");
    root.setAttribute(SITE_TRANSITION_TO_ATTRIBUTE, cv.palette);

    pageshow(false);
    expect(root.getAttribute(SITE_TRANSITION_ATTRIBUTE)).toBe("leaving");
    expect(root.getAttribute(SITE_TRANSITION_TO_ATTRIBUTE)).toBe(cv.palette);

    pageshow(true);
    expect(root.hasAttribute(SITE_TRANSITION_ATTRIBUTE)).toBe(false);
    expect(root.hasAttribute(SITE_TRANSITION_TO_ATTRIBUTE)).toBe(false);
  });

  // Decision (interface-slice2.md): a transitioning click while already leaving is prevented and ignored.
  it.each([
    ["a second click on another site while leaving", 1, [cv, ats]],
    ["two installs (two headers) and one click", 2, [cv]],
  ] as const)("navigates once per leave: %s", async (_, installs, targets) => {
    const navigate = vi.fn();
    for (let i = 0; i < installs; i++) install(navigate);
    const links = targets.map((site) => link(site.url));

    for (const a of links) expect(click(a).prevented, a.href).toBe(true);
    expect(root.getAttribute(SITE_TRANSITION_TO_ATTRIBUTE)).toBe(cv.palette);

    await vi.waitFor(() => expect(navigate).toHaveBeenCalled(), patience);
    await sleep(quietPeriod);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(links[0].href);
  });

  // Decision (T2.1 review, round 2): transitioning clicks are swallowed for the whole leave (the cover
  // is opaque: a double click or a blind one). The leave ends at the cookie's expiry or a bfcache pageshow.
  it("swallows transitioning clicks for the whole leave, also after navigate; a bfcache pageshow ends it", async () => {
    const navigate = vi.fn();
    install(navigate);
    const first = link(cv.url);
    click(first);
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(1), patience);

    // The page is still here (the navigation hasn't committed): a double click's second click, and a
    // click on another site, are both prevented and change nothing.
    const other = link(`${ats.url}/`);
    for (const a of [first, other]) {
      expect(click(a).prevented, a.href).toBe(true);
      expect(root.getAttribute(SITE_TRANSITION_ATTRIBUTE)).toBe("leaving");
      expect(root.getAttribute(SITE_TRANSITION_TO_ATTRIBUTE)).toBe(cv.palette);
    }
    await sleep(quietPeriod);
    expect(navigate).toHaveBeenCalledTimes(1);

    // Back from the back/forward cache, the leave is over: a click starts a new one.
    pageshow(true);
    expect(click(other).prevented).toBe(true);
    expect(root.getAttribute(SITE_TRANSITION_TO_ATTRIBUTE)).toBe(ats.palette);
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(2), patience);
    expect(navigate).toHaveBeenLastCalledWith(other.href);
  });

  it(
    "clears both attributes if the page is still here when the signal's cookie expires; a click then starts a new leave",
    async () => {
      const navigate = vi.fn();
      install(navigate);
      click(link(cv.url));
      // The cookie's own expiry (its max-age), as the browser reports it.
      const cookie = (await cookieStore.get(SITE_TRANSITION_COOKIE)) as CookieWithAttributes | null;
      expect(cookie?.expires).toEqual(expect.any(Number));
      await vi.waitFor(() => expect(navigate).toHaveBeenCalled(), patience);
      expect(root.getAttribute(SITE_TRANSITION_ATTRIBUTE)).toBe("leaving");

      await sleep(Math.max(0, cookie!.expires! - Date.now()) + quietPeriod);
      expect(root.hasAttribute(SITE_TRANSITION_ATTRIBUTE)).toBe(false);
      expect(root.hasAttribute(SITE_TRANSITION_TO_ATTRIBUTE)).toBe(false);

      // The leave is over: a transitioning click starts a new one.
      const again = link(`${ats.url}/`);
      expect(click(again).prevented).toBe(true);
      expect(root.getAttribute(SITE_TRANSITION_ATTRIBUTE)).toBe("leaving");
      expect(root.getAttribute(SITE_TRANSITION_TO_ATTRIBUTE)).toBe(ats.palette);
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(2), patience);
      expect(navigate).toHaveBeenLastCalledWith(again.href);
    },
    // The cookie lives 10 s (C2); this only bounds a hang.
    40_000,
  );

  it("its cleanup removes the click and pageshow listeners", async () => {
    const navigate = vi.fn();
    const cleanup = install(navigate);
    const a = link(cv.url);

    // Installed, a click on another site's link transitions (the control for what follows).
    expect(click(a).prevented).toBe(true);
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(1), patience);
    resetMarks();
    deleteCookie();

    cleanup();
    expect(click(a).prevented).toBe(false);
    expect(root.hasAttribute(SITE_TRANSITION_ATTRIBUTE)).toBe(false);
    await sleep(quietPeriod);
    expect(navigate).toHaveBeenCalledTimes(1);

    root.setAttribute(SITE_TRANSITION_ATTRIBUTE, "leaving");
    pageshow(true);
    expect(root.getAttribute(SITE_TRANSITION_ATTRIBUTE)).toBe("leaving");
  });
});
