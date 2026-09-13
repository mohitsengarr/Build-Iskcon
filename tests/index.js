// Node 22.8 resolves `node --test tests/` to a module path, not a directory,
// so it loads this file. Import every *.test.ts beside it so that command runs
// the whole suite. `node --experimental-strip-types --test tests/*.test.ts`
// runs the same files directly.
const { readdirSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const files = readdirSync(__dirname).filter((f) => f.endsWith(".test.ts")).sort();
  for (const f of files) await import(pathToFileURL(join(__dirname, f)).href);
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
