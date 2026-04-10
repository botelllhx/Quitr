/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require('@repo/eslint-config/node'),
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
}
