/** Local overrides for @medsphere/auth-service linting. */
const path = require('path');

module.exports = {
  extends: ['../../.eslintrc.js'],
  parserOptions: {
    project: [path.join(__dirname, 'tsconfig.eslint.json')],
  },
};
