# shared-ui

UI shared by the jakoblui.com sites (cv-web, site-web), published to GitHub Packages as `@jakoblui-works/shared-ui`. Components are built in this repo's Storybook and used by the apps from the package; code that must stay identical across sites lives here rather than in `web-template`.

## Commands
```sh
pnpm install
pnpm storybook         # :6006
pnpm lint
pnpm typecheck
pnpm test              # every story runs as a test in headless Chromium
pnpm build             # tsdown → dist/ (ESM, .d.ts, styles.css)
pnpm check-package     # publint on the built package; run after build
```

## Layout
- `src/index.ts`: the package's exports. Anything an app imports goes through here.
- `src/components/<name>/`: one folder per component, holding `<name>.tsx`, its stories and any tests. Files are named after the component (no `index.tsx`).
- `src/styles.css`: shipped as source in `dist/styles.css`. Apps import it after Tailwind; its `@source` points their Tailwind at the package's built components, which it would otherwise skip in `node_modules`.
- `vite.config.ts` and `.storybook/` are only for Storybook and Vitest; the package is built by tsdown (`tsdown.config.ts`).

## Rules
- **Relative imports only** inside `src/` (no `@/` alias) for now: tsdown would resolve one, but it would have to be kept in step in `tsconfig.json` and `vite.config.ts` (Storybook, Vitest) as well.
- `react` and `react-dom` are `peerDependencies` (and dev dependencies for Storybook), so apps don't get a second React. Libraries the components use at runtime go in `dependencies`; tsdown leaves both out of the bundle.
- Stories are the tests: a story fails if its component throws, and a `play` function checks behaviour. Logic outside components gets ordinary Vitest tests.

## Publishing
- Bump `version` in `package.json`, merge, then tag `main` with `v<version>` (e.g. `v0.0.2`). The tag runs `publish.yml`: CI, then checks that the tag matches the version and is on `main`, then `pnpm publish` (which builds first, `prepack`) to GitHub Packages with `GITHUB_TOKEN`. A published version can't be replaced; fix forward with a new one.
- **Installing needs a token even though the package is public** (a GitHub Packages rule). An app commits an `.npmrc` with only the scope: `@jakoblui-works:registry=https://npm.pkg.github.com`. The token goes elsewhere, never in the repo's `.npmrc` (pnpm ignores tokens there):
  - locally: a classic PAT with `read:packages`, `pnpm config set "//npm.pkg.github.com/:_authToken" <token>`;
  - an app's CI: `GITHUB_TOKEN`, after this package's settings give the app's repo read access ("Manage Actions access");
  - Docker builds: as a BuildKit secret, never a build arg, so it stays out of the image.
