# shared-ui

UI shared by the jakoblui.com sites (cv-web, site-web), published to GitHub Packages as `@jakoblui-works/shared-ui`: the site header and switcher, the theme (tokens, fonts). Components are built in this repo's Storybook and used by the apps from the package; code that must stay identical across sites lives here rather than in `web-template`. Static files every site serves (the favicons) come from `web-template` instead, since `copier update` keeps them in sync without a copy step.

## Commands
```sh
pnpm install
pnpm storybook         # :6006
pnpm lint
pnpm typecheck
pnpm test              # every story runs as a test in headless Chromium
pnpm build             # tsdown → dist/ (ESM, .d.ts, theme.css)
pnpm check-package     # publint on the built package; run after build```

## Layout
- `src/index.ts`: the package's exports. Anything an app imports goes through here.
- `src/components/<name>/`: one folder per component, holding `<name>.tsx`, its stories and any tests. Files are named after the component (no `index.tsx`).
- `src/components/site-header/`: `SiteHeader`. The right-hand side is `children`; `homeLink` is the element `.jakoblui` renders as (default `<a href="/" />`; apps pass their router's `<Link to="/" />`), merged with Base UI's `useRender`, so the package doesn't depend on a router. The logo group is `data-slot="site-logo"` for apps that need to find it (site-web's x-ray).
- `src/components/site-switcher/`: `SiteSwitcher`, the logo's box, on Base UI's `Menu`.
- `src/lib/sites.ts`: the sites in the switcher. A new site goes here, then every app picks it up with a version bump.
- `src/theme.css`: shipped as source in `dist/theme.css`. The token block every site shares (shadcn's light and dark tokens, Inter and Sora, `--spacing-header`, the `notch` utility, `slide-out`), plus an `@source` that points the app's Tailwind at the package's built components, which it would otherwise skip in `node_modules`. Its header comment shows how an app imports it and what it sets itself (the `--color-primary-*` palette; optionally `--font-heading`, `--font-mono`). Tokens are CSS, not a React provider: Tailwind needs them at build time.
- `vite.config.ts` and `.storybook/` are only for Storybook and Vitest; the package is built by tsdown (`tsdown.config.ts`). `.storybook/preview.css` stands in for an app's stylesheet (violet); the toolbar switches light and dark.

## Rules
- **Relative imports only** inside `src/` (no `@/` alias) for now: tsdown would resolve one, but it would have to be kept in step in `tsconfig.json` and `vite.config.ts` (Storybook, Vitest) as well.
- Libraries a second copy would break are `peerDependencies` (`react`, `react-dom`, `@base-ui/react`, `tailwindcss`; dev dependencies too, for Storybook), so the app's copy is used. Small libraries where a duplicate is harmless (`cn`) and the fonts `theme.css` imports go in `dependencies`. tsdown leaves both out of the bundle. Peer ranges start at the oldest version the apps run (Base UI 1.8) or the components need (Tailwind 4.1 for `pointer-coarse:`).
- shadcn's own CSS (`tw-animate-css`, `shadcn/tailwind.css`) stays in the apps, which own their shadcn setup; the `shadcn` package is a CLI too heavy to depend on. The components here don't need it.
- Components work in light and dark (cv-web has both); check both in Storybook.
- Stories are the tests: a story fails if its component throws, and a `play` function checks behaviour. Logic outside components gets ordinary Vitest tests.

## Publishing
- Bump `version` in `package.json`, merge, then tag `main` with `v<version>` (e.g. `v0.0.2`). The tag runs `publish.yml`: CI, then checks that the tag matches the version and is on `main`, then `pnpm publish` (which builds first, `prepack`) to GitHub Packages with `GITHUB_TOKEN`. A published version can't be replaced; fix forward with a new one.
- The same tag builds the Storybook image (`Dockerfile.storybook`, `nginx.conf`; pushed to GHCR as `shared-ui-storybook`) and triggers the infra deploy, so the hosted Storybook always shows a published version. storybook.jakoblui.com composes it through `refs`. A push to `main` without a tag deploys nothing. If the image or the deploy fails after the publish, use "Re-run failed jobs": re-running all jobs fails at the publish, since the version already exists.
- **Installing needs a token even though the package is public** (a GitHub Packages rule). An app commits an `.npmrc` with only the scope: `@jakoblui-works:registry=https://npm.pkg.github.com`. The token goes elsewhere, never in the repo's `.npmrc` (pnpm ignores tokens there):
  - locally: a classic PAT with `read:packages`, `pnpm config set "//npm.pkg.github.com/:_authToken" <token>`;
  - an app's CI: `GITHUB_TOKEN`, after this package's settings give the app's repo read access ("Manage Actions access");
  - Docker builds: as a BuildKit secret, never a build arg, so it stays out of the image.
