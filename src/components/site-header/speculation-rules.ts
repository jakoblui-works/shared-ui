import type { Site } from "../../lib/sites";

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
