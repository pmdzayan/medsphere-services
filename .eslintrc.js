/** Shared lint baseline for every app/package in the workspace. */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.json', './apps/*/tsconfig.json', './packages/*/tsconfig.json'],
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  env: { node: true, es2022: true },
  ignorePatterns: ['dist', 'node_modules', '**/*.js'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/apps/*/**', '../../../apps/*/**', '../../apps/*/**', '../apps/*/**'],
            message:
              'Cross-application imports are strictly prohibited. Import shared functionality from @medsphere/* packages.',
          },
        ],
      },
    ],
  },
};
