# shared-ui

`@jakoblui-works/shared-ui` on GitHub Packages: the code every jakoblui.com site must share exactly (header and site switcher, theme and fonts, `NotFound`, `ThemeToggle`, site transitions). Built in this repo's Storybook; the apps install it. Static files every site serves (favicons) belong in `web-template`, not here.

## Commands
```sh
pnpm install
pnpm storybook         # :6006
pnpm lint
pnpm typecheck
pnpm test              # Vitest in headless Chromium: storybook (every story) and unit (src/**/*.test.ts)
pnpm exec vitest run --project unit
pnpm build             # tsdown → dist/
pnpm check-package     # publint; run after build
```

## Layout
- `src/index.ts`: the package's exports; anything an app imports goes through here.
- `src/components/<name>/`: one folder per component: `<name>.tsx` (no `index.tsx`), its stories, any tests.
- `src/lib/`: logic without React, with ordinary Vitest tests beside it.
- `src/lib/sites.ts`: the sites in the switcher, each with its palette.
- `src/theme.css`: tokens, fonts, utilities and the transition cover; shipped as source in `dist/theme.css`.
- `vite.config.ts`, `.storybook/`: Storybook and Vitest only; the package is built by `tsdown.config.ts`.

## Rules
- Relative imports only inside `src/` (no `@/` alias).
- Libraries a second copy would break (`react`, `react-dom`, `@base-ui/react`, `tailwindcss`) are `peerDependencies`, also in dev dependencies; peer ranges start at the oldest version the apps run or the components need. Small libraries where a duplicate is harmless, and the fonts `theme.css` imports, are `dependencies`.
- shadcn's own CSS (`tw-animate-css`, `shadcn/tailwind.css`) stays in the apps; don't depend on `shadcn`.
- Components work in light and dark; check both in Storybook.
- Stories are the tests: every component has stories, with a `play` function for behaviour. Logic outside components gets ordinary Vitest tests.
- A new site goes in `sites.ts`; a new palette also needs SiteSwitcher's class map and theme.css's cover rules.
- `SITE_TRANSITION_ATTRIBUTE`, `SITE_TRANSITION_STATES`, `SITE_TRANSITION_TO_ATTRIBUTE`, `SITE_TRANSITION_COOKIE` and `siteTransitionCookie` are a contract with `web-template`'s head script and its tests; keep them exported, and change a value only together with `theme.css`, which repeats it literally, and `web-template`.
- Never build the speculation rules' text anywhere but `speculationRulesText`: sites put its hash in their CSP.
- **Site transitions:**
  - Links stay real `<a href>`: the click handler only delays a navigation, never rewrites or replaces a link.
  - The cover never takes pointer events, and is drawn by CSS from the mark on `<html>` alone.
  - Reduced motion fades instead of sliding.
  - Modified clicks (ctrl, meta, shift, alt, other buttons), a `target` other than `_self` and `download` links are the browser's.
  - Only `web-template`'s head script reads or deletes the arrival cookie; this package only writes it.
  - Animations stay well under the 500 ms fallback, the reduced-motion fade included.

## Publishing
- Bump `version` in `package.json`, merge, then tag `main` with `v<version>`. The tag publishes, builds the Storybook image and deploys it; a push without a tag deploys nothing.
- A published version can't be replaced; fix forward with a new one. If a job fails after the publish, use "Re-run failed jobs", never re-run all.
- Installing needs a token even though the package is public. An app's committed `.npmrc` holds only `@jakoblui-works:registry=https://npm.pkg.github.com`; the token never goes in a repo's `.npmrc`:
  - locally: a classic PAT with `read:packages`, via `pnpm config set "//npm.pkg.github.com/:_authToken" <token>`;
  - an app's CI: `GITHUB_TOKEN`, once this package's "Manage Actions access" gives the app's repo read access;
  - Docker builds: a BuildKit secret, never a build arg.
