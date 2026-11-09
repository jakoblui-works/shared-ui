// The site transition: a click on another site's link covers the page in that site's colour, then
// navigates; the next page, marked `covered` by its head script, slides the cover off. No React, so
// SiteHeader only installs it; every function that touches the DOM takes its document, so tests can
// pass their own.
import type { Site } from "./sites";

// Shared with every site's head script: web-template's site-transition-head-script test checks it
// against these. theme.css's selectors repeat them as literals (CSS can't import them).
export const SITE_TRANSITION_ATTRIBUTE = "data-site-transition";
export const SITE_TRANSITION_TO_ATTRIBUTE = "data-site-transition-to";
export const SITE_TRANSITION_COOKIE = "site-transition";
/** The values of the mark on `<html>`. */
export const SITE_TRANSITION_STATES = {
  leaving: "leaving",
  covered: "covered",
  revealing: "revealing",
} as const;
export type SiteTransitionState = (typeof SITE_TRANSITION_STATES)[keyof typeof SITE_TRANSITION_STATES];

/** The arrival signal's lifetime, in seconds; also how long a leave that never commits stays covered. */
const SIGNAL_MAX_AGE = 10;

/**
 * The arrival cookie a leave from `hostname` to `destinationHref` writes, attributes included. Throws if
 * `destinationHref` isn't an absolute URL.
 */
export const siteTransitionCookie = (destinationHref: string, hostname: string): string => {
  const domain = cookieDomain(hostname);
  return [
    `${SITE_TRANSITION_COOKIE}=${new URL(destinationHref).host}`,
    ...(domain ? [`Domain=${domain}`] : []),
    "path=/",
    `max-age=${SIGNAL_MAX_AGE}`,
    "SameSite=Lax",
  ].join("; ");
};

/** Longer than the cover's 250 ms slide, so it only fires when no animation ends (theme.css missing). */
const FALLBACK_MS = 500;

/** A URL, or null where `new URL` throws (`URL.parse` is missing in Safari 17). */
const parseUrl = (url: string, base?: string): URL | null => {
  try {
    return new URL(url, base);
  } catch {
    return null;
  }
};

/** `document.prerendering` (Chromium; not yet in TypeScript's DOM types). */
const isPrerendering = (doc: Document) => (doc as Document & { prerendering?: boolean }).prerendering === true;

/** The cookie's Domain: the hostname's last two labels; null for a single label or an IP address. */
export const cookieDomain = (hostname: string): string | null => {
  if (hostname.includes(":") || /^\d+(\.\d+){3}$/.test(hostname)) return null;
  const labels = hostname.split(".");
  return labels.length < 2 ? null : labels.slice(-2).join(".");
};

/** The `<a href>` a click is on (its target or an ancestor), if any. */
const clickedLink = (event: MouseEvent): HTMLAnchorElement | null => {
  const target = event.target as Element | null;
  const link = target?.closest?.<HTMLAnchorElement>("a[href]") ?? null;
  // An SVG <a> has an object for `href`; it never transitions.
  return link && typeof link.href === "string" ? link : null;
};

/** The link a click is on, if the click is one the browser would follow in this tab. */
const transitioningLink = (event: MouseEvent): HTMLAnchorElement | null => {
  if (event.button !== 0 || event.defaultPrevented) return null;
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return null;
  const link = clickedLink(event);
  if (!link || link.hasAttribute("download")) return null;
  const target = link.getAttribute("target");
  return target && target.toLowerCase() !== "_self" ? null : link;
};

/** The site a link's URL is on, unless it's `current` or none of `sites`. */
const linkTarget = (link: HTMLAnchorElement, sites: readonly Site[], current: Site): Site | null => {
  const origin = parseUrl(link.href)?.origin;
  if (!origin || origin === parseUrl(current.url)?.origin) return null;
  return sites.find((site) => parseUrl(site.url)?.origin === origin) ?? null;
};

/** The site a click should transition to, or null to let the browser handle it. */
export const transitionTarget = (event: MouseEvent, sites: readonly Site[], current: Site): Site | null => {
  const link = transitioningLink(event);
  return link && linkTarget(link, sites, current);
};

/**
 * Calls `done` once, when the cover's animation on `<html>::after` ends or after the fallback,
 * whichever comes first. Other elements' animation events bubbling up to `<html>` don't count.
 * Returns a cancel.
 */
const afterCover = (doc: Document, done: () => void): (() => void) => {
  const root = doc.documentElement;
  const cancel = () => {
    root.removeEventListener("animationend", onAnimationEnd);
    clearTimeout(timeout);
  };
  const finish = () => {
    cancel();
    done();
  };
  const onAnimationEnd = (event: AnimationEvent) => {
    if (event.target === root && event.pseudoElement === "::after") finish();
  };
  root.addEventListener("animationend", onAnimationEnd);
  const timeout = setTimeout(finish, FALLBACK_MS);
  return cancel;
};

/** Each document's current leave: the mark it set on `<html>`, and its cancel. */
const leaves = new WeakMap<Document, { mark: Attr | null; cancel: () => void }>();

/** Whether the mark is still the one a leave set (not removed, or set again since). */
const isCurrentMark = (doc: Document, mark: Attr | null) =>
  doc.documentElement.getAttributeNode(SITE_TRANSITION_ATTRIBUTE) === mark &&
  mark?.value === (SITE_TRANSITION_STATES.leaving);

/** Whether the document is in a leave: from the click until its expiry or a bfcache restore removes the mark. */
const isLeaving = (doc: Document) => {
  const current = leaves.get(doc);
  return current !== undefined && isCurrentMark(doc, current.mark);
};

/** Stops the document's current leave, if any: its pending navigate and its expiry. */
const cancelLeave = (doc: Document) => {
  leaves.get(doc)?.cancel();
  leaves.delete(doc);
};

const removeMarks = (root: Element) => {
  root.removeAttribute(SITE_TRANSITION_ATTRIBUTE);
  root.removeAttribute(SITE_TRANSITION_TO_ATTRIBUTE);
};

/** Leaving: writes the arrival signal, marks `<html>` leaving, navigates once the cover is in. */
export const leave = (
  href: string,
  site: Site,
  options?: { navigate?: (url: string) => void; document?: Document },
): void => {
  const doc = options?.document ?? document;
  const navigate = options?.navigate ?? ((url: string) => doc.location.assign(url));
  const root = doc.documentElement;

  cancelLeave(doc);

  // The destination's host, or the site's if the href doesn't parse.
  const destination = parseUrl(href, doc.baseURI)?.href ?? site.url;
  doc.cookie = siteTransitionCookie(destination, doc.location.hostname);

  root.setAttribute(SITE_TRANSITION_TO_ATTRIBUTE, site.palette);
  root.setAttribute(SITE_TRANSITION_ATTRIBUTE, SITE_TRANSITION_STATES.leaving);
  const mark = root.getAttributeNode(SITE_TRANSITION_ATTRIBUTE);

  const state = { mark, cancel: () => {} };
  const cancelCover = afterCover(doc, () => navigate(href));
  // A navigation that never commits (Esc, a 204, a download) leaves the page here: uncover it when the
  // signal expires, unless the mark is no longer this leave's (removed, or set again since).
  const expiry = setTimeout(() => {
    if (leaves.get(doc) === state) leaves.delete(doc);
    if (isCurrentMark(doc, mark)) removeMarks(root);
  }, SIGNAL_MAX_AGE * 1000);
  state.cancel = () => {
    cancelCover();
    clearTimeout(expiry);
  };
  leaves.set(doc, state);
};

/**
 * Arriving: slides the cover off a page its head script marked `covered`, after activation if
 * prerendered. Never reads or writes the cookie: the head script owns the signal.
 */
export const arrive = (options?: { document?: Document }): void => {
  const doc = options?.document ?? document;
  const root = doc.documentElement;
  const covered = () => root.getAttribute(SITE_TRANSITION_ATTRIBUTE) === SITE_TRANSITION_STATES.covered;

  const reveal = () => {
    // At activation the head script, registered first, has removed the mark if there was no signal.
    if (!covered()) return;
    root.setAttribute(SITE_TRANSITION_ATTRIBUTE, SITE_TRANSITION_STATES.revealing);
    afterCover(doc, () => {
      // Leave a new transition (a click while revealing) alone.
      if (root.getAttribute(SITE_TRANSITION_ATTRIBUTE) !== SITE_TRANSITION_STATES.revealing) return;
      removeMarks(root);
    });
  };

  if (!covered()) return;
  if (isPrerendering(doc)) doc.addEventListener("prerenderingchange", reveal, { once: true });
  else reveal();
};

/**
 * Wires the transition up for a page: clicks on other sites' links leave, a covered page arrives, and
 * a page restored from the back/forward cache never comes back covered. Returns the cleanup.
 */
export const installSiteTransitions = (options: {
  sites: readonly Site[];
  current: Site;
  navigate?: (url: string) => void;
  document?: Document;
}): (() => void) => {
  const { sites, current, navigate } = options;
  const doc = options.document ?? document;
  const root = doc.documentElement;
  const view = doc.defaultView;

  const onClick = (event: MouseEvent) => {
    const link = transitioningLink(event);
    const site = link && linkTarget(link, sites, current);
    if (!link || !site) return;
    event.preventDefault();
    // Swallowed for the whole leave, also after navigate (a double click, a click on the opaque cover, or
    // a second header's listener): navigate once per leave. After its expiry a click starts a new leave.
    if (isLeaving(doc)) return;
    leave(link.href, site, { navigate, document: doc });
  };

  const onPageShow = (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    cancelLeave(doc);
    removeMarks(root);
  };

  doc.addEventListener("click", onClick);
  view?.addEventListener("pageshow", onPageShow);
  arrive({ document: doc });

  return () => {
    doc.removeEventListener("click", onClick);
    view?.removeEventListener("pageshow", onPageShow);
  };
};
