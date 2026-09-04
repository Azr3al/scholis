import { build } from 'esbuild';

// The API had no production build at all: `start` ran tsx against TypeScript
// with dotenv-cli reading ../../.env, and all three are dev-only.
//
// Bundling rather than tsc because the workspace packages export TypeScript
// source on purpose ("no stale dist, no build ordering") — the web app solves
// the same problem with Next's transpilePackages. So @scholis/* gets inlined
// here, and everything from npm stays external and is installed normally in the
// runtime image. That keeps the bundle small and leaves packages with native
// bindings or dynamic requires untouched.
// Nothing external. Leaving dependencies out and resolving them from
// node_modules at runtime failed for real: drizzle-orm's entry points mix CJS
// and ESM, and under pnpm's deploy layout Node hit ERR_REQUIRE_CYCLE_MODULE on
// boot. esbuild resolves those entry points itself at build time, which sidesteps
// the whole problem — and the runtime image then needs no node_modules at all.
await build({
  entryPoints: ['src/index.ts', 'src/migrate.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  // .mjs so Node knows it's ESM without a package.json sitting next to it. The
  // runtime image has no manifest, and without this Node reparses and warns.
  outExtension: { '.js': '.mjs' },
  // Node built-ins stay external automatically on platform: 'node'.
  logLevel: 'info',
});
