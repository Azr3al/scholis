# Schedjuice Reimagined

**Design authority:** [`DESIGN.md`](./DESIGN.md)  
**UI contracts & case studies:** [`docs/design/`](./docs/design/README.md)

## Deployment requirements
- deploy on Vercel
- Node version > 20.X (https://github.com/orgs/vercel/discussions/3061)

*We are now using `@napi-rs/canvas` to use the canvas module because `node-canvas` has problems with MacOS ARM users. (before this, we used `node-canvas`)*

## Local development

- `pnpm dev` — Next.js Turbopack (preferred; faster cold compile / HMR)
- `pnpm dev:webpack` — Webpack escape hatch if Turbopack breaks something

## Development configs
- https://www.reddit.com/r/nextjs/comments/1h7avw5/vscode_tailwind_intellisense_not_working_with_v4/

