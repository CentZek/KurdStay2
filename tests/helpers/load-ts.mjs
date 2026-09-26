import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'

// Load the application's actual TypeScript dictionaries in Node without a DOM.
export function loadTs(filename, mocks = {}) {
  const path = resolve(filename)
  const source = readFileSync(path, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const module = { exports: {} }
  const require = specifier => {
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier]
    if (!specifier.startsWith('.')) return createRequire(path)(specifier)
    const candidate = resolve(dirname(path), specifier)
    return loadTs(existsSync(`${candidate}.ts`) ? `${candidate}.ts` : `${candidate}/index.ts`, mocks)
  }
  new Function('require', 'module', 'exports', outputText)(require, module, module.exports)
  return module.exports
}

export function flatten(object, prefix = '') {
  return Object.fromEntries(Object.entries(object).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === 'string' ? [[path, value]] : Object.entries(flatten(value, path))
  }))
}
