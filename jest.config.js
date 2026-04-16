/*
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/en/configuration.html
 */
module.exports = {
  // Automatically clear mock calls and instances between every test
  clearMocks: true,

  // Indicates which provider should be used to instrument code for coverage
  coverageProvider: "v8",

  // The test environment that will be used for testing
  testEnvironment: "jsdom",

  // A map from regular expressions to module names or to arrays of module names that allow to stub out resources with a single module
  moduleNameMapper: {
    "^game/(.*)": "<rootDir>/src/game/$1",

    ".+\\.(css|styl|less|sass|scss|png|jpg|ttf|woff|woff2)$":
      "identity-obj-proxy",
  },

  // A map from regular expressions to paths to transformers
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": "<rootDir>/test/importMetaTransformer.js",
  },

  setupFiles: ["<rootDir>/test/setup.ts"],

  // Memory Leak Fix - Cause unknown
  // https://github.com/kulshekhar/ts-jest/issues/1967
  globals: {
    "ts-jest": {
      isolatedModules: true,
    },
  },
};
