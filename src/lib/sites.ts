export type Site = {
  /** Shown in the logo's box, e.g. `cv` for cv.jakoblui.com. */
  subdomain: string;
  label: string;
  url: string;
};

/** The sites in the header's switcher. The hub is served at the apex domain but shown as `www`. */
export const sites = [
  { subdomain: "www", label: "Home", url: "https://jakoblui.com" },
  { subdomain: "cv", label: "CV assembler", url: "https://cv.jakoblui.com" },
  { subdomain: "ats", label: "ATS check", url: "https://ats.jakoblui.com" },
] as const satisfies readonly Site[];

export type SiteSubdomain = (typeof sites)[number]["subdomain"];
