import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import { type ReactElement, type ReactNode, useEffect } from "react";

import { installSiteTransitions, SITE_TRANSITION_ATTRIBUTE } from "../../lib/site-transition";
import { sites, type SiteSubdomain } from "../../lib/sites";
import { SiteSwitcher } from "../site-switcher/site-switcher";
import { speculationRulesText } from "./speculation-rules";

type SiteHeaderProps = {
  /** The site this header is on: its box in the logo, and the one the switcher leaves out. */
  current: SiteSubdomain;
  /**
   * The element `.jakoblui` renders as, linking to the current site's root: an app passes its
   * router's link (`<Link to="/" />`), so the header doesn't depend on a router. Pass a bare element:
   * the header's classes are added to its own, but its own `aria-label` or children would replace the
   * header's label and text.
   */
  homeLink?: ReactElement;
  className?: string;
  /** The header's right-hand side, e.g. a menu or a theme toggle. */
  children?: ReactNode;
  /**
   * For stories and tests only, so a transition to another site never leaves the page: called with the
   * link's URL instead of navigating. Apps never pass it.
   */
  navigate?: (url: string) => void;
};

/** Adds the speculation rules for the other sites to `<head>`, unless a header already has. */
const insertSpeculationRules = (current: SiteSubdomain) => {
  if (document.head.querySelector(`script[type="speculationrules"][${SITE_TRANSITION_ATTRIBUTE}]`)) return;
  const script = document.createElement("script");
  script.type = "speculationrules";
  script.setAttribute(SITE_TRANSITION_ATTRIBUTE, "");
  // Exactly the exported text: a CSP site allows it by its hash.
  script.textContent = speculationRulesText(current);
  document.head.append(script);
};

// The logo reads as the domain: the box is the current subdomain (and the switcher to the other
// sites), the rest links to the current site's root. It also runs the site transitions,
// since every page renders it.
export const SiteHeader = ({ current, homeLink = <a href="/" />, className, children, navigate }: SiteHeaderProps) => {
  const currentSite = sites.find((site) => site.subdomain === current);
  // Only reachable past the type (a cast); failing beats showing another site's box.
  if (!currentSite) throw new Error(`SiteHeader: no site with subdomain "${current}"`);
  // A new `navigate` reinstalls: the cleanup removes the old listeners first, and arrival again is a
  // no-op unless `<html>` still reads `covered`.
  useEffect(() => installSiteTransitions({ sites, current: currentSite, navigate }), [currentSite, navigate]);
  // Left on unmount: the page keeps its header, and a remount or a second header finds it.
  useEffect(() => insertSpeculationRules(current), [current]);
  const home = useRender({
    render: homeLink,
    props: {
      "aria-label": "jakoblui home",
      className: "rounded-md text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
      children: (
        <>
          <span className="text-primary">.</span>jakoblui
        </>
      ),
    },
  });
  return (
    <header className={cn("h-header pt-3", className)}>
      <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between px-4">
        {/* `data-slot` lets an app find the logo, e.g. site-web keeps it on solid frost over its x-ray. */}
        <div
          data-slot="site-logo"
          className="flex items-center gap-1.75 font-logo text-2xl leading-none font-semibold tracking-[-0.03em]"
        >
          <SiteSwitcher sites={sites} current={currentSite} />
          {home}
        </div>
        {children}
      </div>
    </header>
  );
};
