// Maintenance tool only. Deployment uses the committed browser bundle.
import { build, version as esbuildVersion } from 'esbuild'
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'

const root = resolve(import.meta.dirname, '..')
const upstream = JSON.parse(await readFile(join(root, 'node_modules/tus-js-client/package.json'), 'utf8'))
if (upstream.version !== '4.3.1') throw new Error('Review changes before updating the pinned tus-js-client version')
const target = join(root, 'src/vendor/tus')
await mkdir(target, { recursive: true })
const result = await build({
  absWorkingDir: root, entryPoints: ['node_modules/tus-js-client/lib.esm/browser/index.js'],
  bundle: true, platform: 'browser', format: 'esm', target: 'es2020', minify: true,
  legalComments: 'inline', metafile: true, write: false,
  banner: { js: '/*! tus-js-client 4.3.1 browser bundle. See THIRD_PARTY_LICENSES.txt and README.md in this directory. */' },
})
if (Object.values(result.metafile.outputs).some(output => output.imports.length)) throw new Error('Vendor bundle must have no external dependencies')
const packages = new Map()
for (const input of Object.keys(result.metafile.inputs)) {
  let folder = dirname(resolve(root, input))
  while (folder !== root) {
    try {
      const pkg = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'))
      packages.set(pkg.name, { folder, pkg }); break
    } catch { folder = dirname(folder) }
  }
}
const notices = [], dependencies = {}
for (const [name, { folder, pkg }] of [...packages].sort()) {
  const files = (await readdir(folder)).filter(f => /^(licen[sc]e|copying|copyright)(\.|$)/i.test(f))
  if (!files.length) throw new Error(`Missing license for ${name}; review before distributing`)
  notices.push(`${name} ${pkg.version}\n${files.map(f => f).join(', ')}\n${(await Promise.all(files.map(f => readFile(join(folder, f), 'utf8')))).join('\n')}`)
  dependencies[name] = pkg.version
}
const licenses = notices.join('\n\n' + '='.repeat(72) + '\n\n')
// Keep complete notices in deployed JS as well as the repository sidecar.
const bundle = Buffer.from(`/*!\n${licenses.replaceAll('*/', '* /')}\n*/\n${result.outputFiles[0].text}`)
await writeFile(join(target, 'tus.js'), bundle)
await writeFile(join(target, 'THIRD_PARTY_LICENSES.txt'), licenses.trimEnd() + '\n')
await writeFile(join(target, 'provenance.json'), JSON.stringify({ source: 'https://github.com/tus/tus-js-client', version: upstream.version,
  esbuild: esbuildVersion, dependencies, sha256: createHash('sha256').update(bundle).digest('hex') }, null, 2) + '\n')
console.log(`Vendored ${bundle.length} bytes with ${packages.size} package licenses`)
