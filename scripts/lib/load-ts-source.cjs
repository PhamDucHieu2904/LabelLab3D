const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');

/** Execute actual local TypeScript dependencies, including JSON and @/ imports. */
function createSourceLoader() {
  const cache = new Map();
  function load(filename) {
    const resolved = [filename, `${filename}.ts`, `${filename}.json`].find(
      candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
    );
    if (!resolved) throw new Error(`Cannot resolve ${filename}`);
    if (resolved.endsWith('.json')) return require(resolved);
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const loaded = new Module(resolved, module);
    loaded.filename = resolved;
    loaded.paths = module.paths;
    cache.set(resolved, loaded);
    const nativeRequire = loaded.require.bind(loaded);
    loaded.require = request => request.startsWith('@/')
      ? load(path.join(root, request.slice(2)))
      : request.startsWith('.') ? load(path.resolve(path.dirname(resolved), request)) : nativeRequire(request);
    loaded._compile(ts.transpileModule(fs.readFileSync(resolved, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText, resolved);
    return loaded.exports;
  }
  return load;
}
module.exports = { createSourceLoader };
