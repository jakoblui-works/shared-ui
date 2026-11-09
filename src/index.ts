export { NotFound } from "./components/not-found/not-found";
export { SiteHeader } from "./components/site-header/site-header";
export { SiteSwitcher } from "./components/site-switcher/site-switcher";
export { THEME_STORAGE_KEY, ThemeToggle } from "./components/theme-toggle/theme-toggle";
export { sites, type Site, type SiteSubdomain } from "./lib/sites";
// What web-template's head script and its tests match; the module's other functions stay internal.
export {
  SITE_TRANSITION_ATTRIBUTE,
  SITE_TRANSITION_TO_ATTRIBUTE,
  SITE_TRANSITION_COOKIE,
  SITE_TRANSITION_STATES,
  siteTransitionCookie,
} from "./lib/site-transition";
export { speculationRulesText } from "./components/site-header/speculation-rules";
