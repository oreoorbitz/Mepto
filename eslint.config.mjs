import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import prettierRecommended from 'eslint-plugin-prettier/recommended'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      // third-party-derived plugin, legacy style — prettier formats it via lint-staged
      'plugins/**',
      // minified Mepto bundle vendored into the docs site
      'docs/site/assets/meptos.umd.cjs',
      '*.config.js',
      '*.config.ts',
      '*.config.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // TypeScript specific
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // Requires strictNullChecks; re-enable when the ts-transition turns it on
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'off',

      // General best practices
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'error',
      'object-shorthand': 'error',

      // DOM perf: innerHTML += re-serializes + reparses entire subtree (370×, O(N²)) — see dom-manip deep dive §2.2.1
      'no-restricted-syntax': [
        'error',
        {
          selector: 'AssignmentExpression[left.property.name="innerHTML"][operator="+="]',
          message: 'Do not use `el.innerHTML += ...` — it serializes the entire subtree, reparses everything, destroys listeners and is ~370× slower than append/insertAdjacentHTML. Use `el.insertAdjacentHTML("beforeend", ...)` to preserve listeners or `el.innerHTML = ...` single-assignment for bulk replace. See Kimi_Agent_Performance_deep_dive/dom-manipulation-performance.agent.final.md §2.2.1.',
        },
        {
          selector: 'AssignmentExpression[left.property.name="outerHTML"][operator="+="]',
          message: 'Do not use `outerHTML +=` — same serialization trap as innerHTML +=.',
        },
      ],

      // Code style
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: 'off',
      'no-throw-literal': 'error',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['tools/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  // Files outside tsconfig.json (tests, plain JS) can't use type-aware rules
  {
    files: ['test/**', '**/*.spec.ts', '**/*.test.ts', '**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  }
)
