import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const forbiddenDynamicCode = [
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: 'dangerouslySetInnerHTML запрещён (SPEC §16.3).',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/dist/**',
      '**/next-env.d.ts',
      'apps/web/drizzle/**',
      'apps/web/public/**',
      'apps/web/playwright-report/**',
      'apps/web/test-results/**',
      'packages/importer/cache/**',
      'packages/importer/parsed/**',
      'packages/importer/.vendor/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-syntax': ['error', ...forbiddenDynamicCode],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Движок правил: чистые функции без I/O, React и Node-API (SPEC §8, CLAUDE.md).
    files: ['packages/rules-engine/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-dom', 'react/*'], message: 'Движок правил не зависит от React.' },
            { group: ['node:*', 'fs', 'path', 'os', 'child_process', 'http', 'https', 'crypto', 'url'], message: 'Движок правил не использует Node-API.' },
            { group: ['**/apps/**', '@ps/web', '@ps/web/*'], message: 'Движок правил не импортирует ничего из apps/.' },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'fetch', 'process', 'require', 'window', 'document', 'localStorage'],
    },
  },
);
