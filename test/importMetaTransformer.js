// Custom jest transformer that wraps ts-jest and replaces
// `import.meta.env.*` before TypeScript parsing.
//
// Required because ts-jest 27.x cannot handle import.meta syntax
// (SyntaxError at parse time, before AST transformers can run).

const { TsJestTransformer } = require("ts-jest");

const tsJestInstance = new TsJestTransformer();

/** Replace Vite-specific import.meta.env references with constants */
function replaceImportMeta(src) {
  return src
    .replace(/import\.meta\.env\.DEV/g, "false")
    .replace(/import\.meta\.env\.PROD/g, "true")
    .replace(/import\.meta\.env\.MODE/g, '"test"')
    .replace(/import\.meta\.env/g, '({DEV:false,PROD:true,MODE:"test"})');
}

module.exports = {
  process(src, filename, config, transformOptions) {
    const patched = replaceImportMeta(src);
    return tsJestInstance.process(patched, filename, config, transformOptions);
  },
  getCacheKey(src, filename, config, transformOptions) {
    return tsJestInstance.getCacheKey(src, filename, config, transformOptions);
  },
};
