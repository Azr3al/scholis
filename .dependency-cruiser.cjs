/**
 * Layering rules, run by `pnpm arch` in CI.
 *
 * Every rule here has been watched rejecting a real violation (ticket 0.4).
 * If you change one, re-prove it — write a file that should fail, confirm it
 * does, delete it.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-scoring-in-client',
      severity: 'error',
      comment:
        'The take flow must never reach @scholis/scoring, directly or transitively. ' +
        'That package is the only code holding answer keys; if it reaches a client ' +
        'bundle, keys ship to the student.',
      from: {
        path: '^apps/web/(app/take|components/take|lib/take)',
      },
      to: {
        path: '^packages/scoring',
      },
    },
    {
      name: 'no-db-in-client',
      severity: 'error',
      comment:
        'apps/web is a pure frontend: it talks to apps/api over HTTP and holds no ' +
        'database dependency at all. Nothing in it may reach persistence or query ' +
        'modules, directly or transitively. Go through an API route.',
      from: {
        path: '^apps/web/',
      },
      to: {
        path: '^(packages/db|apps/api/data)',
      },
    },
    {
      name: 'no-db-in-http',
      severity: 'error',
      comment:
        'Route handlers own HTTP concerns only — parse, authorise, respond. They must ' +
        'call a service in apps/api/server rather than reaching persistence directly. ' +
        'This is what stops business logic slowly collapsing into HTTP handlers.',
      from: {
        path: '^apps/api/http',
      },
      to: {
        path: '^(packages/db|apps/api/data)',
      },
    },
    {
      name: 'no-service-to-service',
      severity: 'error',
      comment:
        'Services orchestrate; they do not compose. If two use cases need the same ' +
        'thing it is domain logic (-> engine/scoring), data access (-> data/), or a ' +
        'co-located private helper. Service-to-service is how a tangle starts, and by ' +
        'the time it is visible in review it is already load-bearing.',
      from: {
        path: '^apps/api/server/[^/]+/[^/]+\\.ts$',
        pathNot: '\\.test\\.ts$',
      },
      to: {
        path: '^apps/api/server/[^/]+/[^/]+\\.ts$',
      },
    },
    {
      name: 'no-service-logic-in-data',
      severity: 'error',
      comment:
        'data/ returns rows, never decisions. It may not reach back into a service, ' +
        'and it may not import the domain core — a query module that scores something ' +
        'is a service wearing a disguise.',
      from: {
        path: '^apps/api/data',
      },
      to: {
        path: '^(apps/api/server|packages/(engine|scoring))',
      },
    },
    {
      name: 'no-io-in-core',
      severity: 'error',
      comment:
        'The pure domain core (engine, scoring) must not import anything that performs ' +
        'I/O or knows about the framework. This is what keeps it testable without a ' +
        'database or a browser, forever.',
      from: {
        path: '^packages/(engine|scoring)/src',
      },
      to: {
        path: '^(packages/db|apps/)',
        dependencyTypes: ['local'],
      },
    },
    // NOTE: the external-package half of "no I/O in the core" (banning react,
    // next, drizzle-orm and friends) is enforced by ESLint's `no-restricted-imports`
    // in `packages/config/eslint.base.js` → `pure`, not here.
    //
    // Two reasons. It reports at the offending line rather than as a graph
    // violation, and it matches on the import specifier so it fires even when a
    // package is not installed — which is precisely the moment someone adds the
    // import. A depcruise equivalent was tried in ticket 0.4 and removed: an
    // allowlist of "zod only" also flags `vitest` in every legitimate test file.
    {
      name: 'engine-and-scoring-are-siblings',
      severity: 'error',
      comment:
        'engine and scoring are siblings, not layers. Scoring does not know about ' +
        'attempt state; the engine does not know about answer keys. Both speak only ' +
        'the vocabulary in @scholis/schema. A layered arrangement would hand the ' +
        'engine a path to answer keys.',
      from: {
        path: '^packages/(engine|scoring)/src',
      },
      to: {
        path: '^packages/(engine|scoring)/src',
        pathNot: '$1',
      },
    },
    {
      name: 'schema-depends-on-nothing',
      severity: 'error',
      comment:
        '@scholis/schema is the root of the dependency graph. It may import zod and ' +
        'nothing else. Everything else imports it.',
      from: {
        path: '^packages/schema/src',
      },
      to: {
        path: '^packages/',
        pathNot: '^packages/schema',
      },
    },
    {
      name: 'no-cycles',
      severity: 'error',
      comment:
        'Circular dependencies make module init order load-bearing. They are never worth it.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment:
        'Unreachable modules are usually leftovers. Delete them or wire them up. ' +
        'Framework entry points are exempt: Next.js invokes pages, layouts and routes ' +
        'by convention rather than by import, so they are orphans by construction.',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$',
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$',
          '(^|/)(eslint|vitest|next|drizzle|postcss|tailwind|playwright)\\.config\\.(js|ts|cjs|mjs)$',
          // Type-only modules. `tsPreCompilationDeps: false` (correctly) ignores
          // type-only imports, so these are orphans by construction.
          '\\.types\\.ts$',
          // Next.js file-convention entry points
          '(^|/)(page|layout|route|error|loading|not-found|template|default)\\.(ts|tsx)$',
          '^apps/web/middleware\\.ts$',
          // Package public entry points
          '^packages/[^/]+/src/index\\.ts$',
          // Static assets served verbatim. sw.js is fetched by URL from
          // navigator.serviceWorker.register, never imported, so it is an
          // orphan by construction like the entry points above.
          '^apps/web/public/',
        ],
      },
      to: {},
    },
  ],

  options: {
    // doNotFollow keeps external modules in the graph but stops traversal there.
    // exclude would drop them entirely and rules about external deps would
    // silently never fire. Ticket 0.4 caught exactly that.
    doNotFollow: {
      path: 'node_modules',
    },

    exclude: {
      path: '(^|/)(dist|\\.next|\\.turbo|coverage)/',
    },

    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    },

    // Resolve pnpm's workspace symlinks so rules can match on ^packages/scoring
    // rather than a node_modules path.
    preserveSymlinks: false,

    // Resolves the @/* alias. Without this depcruise silently fails to resolve
    // every aliased import, so no-service-to-service would pass a service
    // importing @/server/... while catching only the relative form.
    //
    // Caught by an orphan warning on a file that was demonstrably imported.
    tsConfig: {
      fileName: 'tsconfig.depcruise.json',
    },

    combinedDependencies: true,

    // Type-only imports are erased at build time, so they can't leak runtime code.
    tsPreCompilationDeps: false,

    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
