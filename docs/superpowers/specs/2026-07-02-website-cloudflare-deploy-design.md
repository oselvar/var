# Deploy website-starlight to var.oselvar.com

Date: 2026-07-02
Status: approved

## Goal

Build and deploy `typescript/packages/website-starlight` to https://var.oselvar.com
on every green build of `main`, deployed from GitHub via Cloudflare.

## Decisions

- **Target**: Cloudflare Worker with static assets (assets-only, no Worker script).
  The site is fully static (`astro build` → `dist/`).
- **Mechanism**: GitHub Actions + `wrangler deploy` (`cloudflare/wrangler-action`),
  not Cloudflare's git integration — the green-build gate must be explicit.
- **Green gate**: a `deploy-website` job appended to `.github/workflows/typescript.yml`
  with `needs: test`, running only on `push` to `main`. Every green build of main
  deploys; PRs never do.
- **Old site**: `.github/workflows/website.yml` (GitHub Pages deploy of the legacy
  `packages/website`) is deleted. The package itself stays for now.

## Components

- `typescript/packages/website-starlight/wrangler.jsonc`
  - Worker name `var-website`
  - `assets: { directory: "./dist", not_found_handling: "404-page" }`
    (Starlight emits `404.html`)
  - `routes: [{ pattern: "var.oselvar.com", custom_domain: true }]` — first deploy
    creates the DNS record and certificate on the oselvar.com zone.
- `astro.config.mjs`: add `site: 'https://var.oselvar.com'` for canonical URLs.
- `deploy-website` job: checkout → pnpm install →
  `pnpm --filter @oselvar/website-starlight... build` (builds workspace deps first) →
  `cloudflare/wrangler-action` with `workingDirectory` pointing at the package.
  Concurrency group `deploy-website` so overlapping merges don't race.

## One-time manual setup

1. Cloudflare dashboard: create an API token from the "Edit Cloudflare Workers"
   template.
2. GitHub repo secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

## Verification

Push to main, watch the TypeScript workflow's `deploy-website` job go green,
then `curl -I https://var.oselvar.com`.
