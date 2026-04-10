/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require('./base'),
  extends: [
    ...require('./base').extends,
    'next/core-web-vitals',
  ],
  rules: {
    ...require('./base').rules,
    '@next/next/no-html-link-for-pages': 'off',
  },
}
