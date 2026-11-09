import { sites, type Site, type SiteSubdomain } from "../../lib/sites";

type SpeculationRules = {
  prerender: Array<{ where: { or: Array<{ href_matches: string }> }; eagerness: "moderate" }>;
};

/**
 * The speculation rules (C4 in platform-docs/transitions/plan.md) that prerender links to every site
 * other than `current`, once the pointer rests on one (`moderate`), so the next site's page is ready
 * when the cover is in.
 */
export const speculationRules = (sites: readonly Site[], current: Site): SpeculationRules => ({
  prerender: [
    {
      where: {
        or: sites
          .filter((site) => site.subdomain !== current.subdomain)
          .map((site) => ({ href_matches: `${new URL(site.url).origin}/*` })),
      },
      eagerness: "moderate",
    },
  ],
});

/**
 * The exact text `SiteHeader` inserts as its speculation rules, exported so a site's build can hash it
 * for its Content-Security-Policy (C4): Chromium ignores `'inline-speculation-rules'` when `script-src`
 * lists hashes, and a hash only matches this text character for character, as this package version
 * produces it.
 */
export const speculationRulesText = (current: SiteSubdomain): string => {
  const currentSite = sites.find((site) => site.subdomain === current);
  // Only reachable past the type (a cast), as in SiteHeader.
  if (!currentSite) throw new Error(`speculationRulesText: no site with subdomain "${current}"`);
  return JSON.stringify(speculationRules(sites, currentSite));
};
