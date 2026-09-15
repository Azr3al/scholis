import type { NextConfig } from 'next';

const config: NextConfig = {
  // Railway runs the app as a Node process, so ship the standalone output and
  // keep the image small.
  output: 'standalone',

  // Internal packages export TypeScript source rather than a built `dist`, so
  // Next compiles them alongside app code. No stale dist, no build ordering.
  //
  // scoring and db are deliberately absent — the frontend doesn't depend on
  // them, which is what keeps answer keys out of the browser bundle.
  transpilePackages: ['@scholis/schema', '@scholis/engine'],

  // The browser talks only to this origin; /api/* is forwarded to the API
  // service from the server side.
  //
  // This exists for the session cookie. Web and API sit on separate
  // *.up.railway.app subdomains, and up.railway.app is on the Public Suffix
  // List, so browsers treat them as different sites and a SameSite=Lax cookie
  // set by the API is never sent back from the web origin. Proxying makes the
  // cookie first-party, which is stricter than loosening SameSite — the cookie
  // settings themselves are untouched.
  //
  // Next evaluates rewrites() at build time and writes the destination into
  // routes-manifest.json, so API_PROXY_TARGET has to be present when the image
  // is built — the web Dockerfile takes it as a build ARG. Changing the target
  // means a rebuild, not just a variable edit. Falls back to the local API for
  // development.
  async rewrites() {
    const target = process.env.API_PROXY_TARGET ?? 'http://localhost:3001';
    return [{ source: '/api/:path*', destination: `${target}/api/:path*` }];
  },

  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },

  // Top level rather than under `experimental`, which Next 15.5 deprecated and
  // warned about on every build.
  typedRoutes: true,
};

export default config;
