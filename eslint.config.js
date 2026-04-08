import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      complexity: ['error', 8],
      'max-lines-per-function': ['error', { max: 30, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['src/**/*.test.ts'],
    rules: {
      'max-lines-per-function': 'off',
    },
  },
  {
    ignores: ['static/js/**'],
  },
);
