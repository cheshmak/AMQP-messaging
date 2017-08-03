module.exports = {
  "env": {
    "es6": true,
    "node": true,
    "mocha": true
  },
  "extends": "eslint:recommended",
  "rules": {
    "indent": [
      "error",
      2
    ],
    "strict": [
      "error"
    ],
    "no-unused-vars": [
      "error"
    ],
    "linebreak-style": [
      "error",
      "unix"
    ],
    "quotes": [
      "error",
      "single"
    ],
    "semi": [
      "error",
      "always"
    ],
    "curly": [
      "error"
    ],
    "accessor-pairs": [
      "error",
      {
        "getWithoutSet": true
      }
    ],
    "no-console": [
      "error",
      { "allow": ["log", "warn", "error"] }
    ],
    "no-multi-spaces": [
      "error"
    ],
    "no-whitespace-before-property": [
      "error"
    ],
    "space-before-blocks": [
      "error",
      "always"
    ],
    "space-before-function-paren": [
      "error",
      {"anonymous": "always", "named": "never"}
    ],
    "space-in-parens": [
      "error"
    ],
    "space-infix-ops": [
      "error",
      {
        "int32Hint": false
      }
    ],
    "space-unary-ops": [
      "error"
    ],
    "spaced-comment": [
      "error",
      "always",
      {
        "block": {
          "exceptions": ["-"]
        }
      }
    ],
    "object-curly-newline": [
      "error",
      {
        "minProperties": 1
      }
    ],
    "key-spacing": [
      "error",
      {
        "mode": "strict",
        "beforeColon": false,
        "afterColon": true,
      }
    ],
    "object-property-newline": [
      "error"
    ],
    "brace-style": [
      "error"
    ],
    "comma-dangle": [
      "error",
      "never"
    ],
    "object-curly-spacing": [
      "error",
      "always"
    ],
    "block-scoped-var": [
      "error"
    ],
    "no-undefined": [
      "error"
    ],
    "camelcase": [
      "error"
    ],
    "block-spacing": [
      "error"
    ],
    "padded-blocks": [
      "error",
      "never"
    ],
    "comma-style": [
      "error",
      "last"
    ],
    "operator-linebreak": [
      "error",
      "after"
    ],
    // Node.js
    "no-use-before-define": [
      "error",
      {
        "functions": true,
        "classes": true
      }
    ],
    "no-sync": [
      "error"
    ],
    "no-new-require": [
      "error"
    ],
    // ES6
    "prefer-const": [
      "error"
    ],
    "arrow-parens": [
      "error",
      "always"
    ],
    "arrow-spacing": [
      "error"
    ],
    "no-eval": [
      "error"
    ],
    "no-extra-bind": [
      "error"
    ],
    "no-lone-blocks": [
      "error"
    ]
  }
};
