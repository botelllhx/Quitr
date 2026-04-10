/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require('./base'),
  env: {
    node: true,
    es2022: true,
  },
}
