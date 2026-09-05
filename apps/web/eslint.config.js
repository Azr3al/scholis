import nextPlugin from '@next/eslint-plugin-next';
import { base } from '@scholis/config/eslint';

export default [
  {
    // Next.js generates and rewrites next-env.d.ts on every build; it is not
    // ours to lint. public/ is static assets served verbatim — sw.js runs in a
    // worker scope with its own globals and sits outside the TS project the
    // typed rules are configured against.
    ignores: ['next-env.d.ts', '.next/**', 'public/**'],
  },
  ...base,
  {
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  {
    // Next.js requires default exports from route, page, layout, and config
    // files. This is the only sanctioned exception to §4's named-exports rule.
    files: [
      'app/**/page.tsx',
      'app/**/layout.tsx',
      'app/**/error.tsx',
      'app/**/loading.tsx',
      'app/**/not-found.tsx',
      'app/**/route.ts',
      'middleware.ts',
      '*.config.ts',
    ],
    rules: {
      'import-x/no-default-export': 'off',
    },
  },
  {
    // CLI scripts talk to an operator through stdout. That is their interface,
    // not a stray debug statement.
    files: ['scripts/**'],
    rules: { 'no-console': 'off' },
  },
  {
    // Belt-and-braces alongside the dependency-cruiser rule. depcruise sees the
    // import graph; ESLint reports at the offending line while you type.
    files: ['app/take/**', 'components/take/**', 'lib/take/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@scholis/scoring', '@scholis/scoring/*', '@scholis/db', '@/data/*'],
              message:
                'The take flow must never reach answer keys or the database. Go through an API route.',
            },
          ],
        },
      ],
    },
  },
];
