/** @type {import('prettier').Config} */
export default {
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  semi: true,
  overrides: [
    {
      files: 'apps/{admin,student}/src/**/*.html',
      options: { parser: 'angular', printWidth: 120 },
    },
  ],
};
