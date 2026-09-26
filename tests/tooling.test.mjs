import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
const require = createRequire(import.meta.url)

test('patched asset tooling can load and resize the existing icon', async () => {
  const { Project } = require('@capacitor/assets/dist/project.js')
  const project = new Project(process.cwd(), {}, 'assets')
  const input = await project.loadInputAssets()
  assert.ok(input.icon)
  const sharp = require('sharp')
  const buffer = await sharp(await readFile('assets/icon-only.png')).resize(64, 64).png().toBuffer()
  assert.equal((await sharp(buffer).metadata()).width, 64)
  const nativeProject = require('xcode').project('ios/App/App.xcodeproj/project.pbxproj')
  nativeProject.parseSync()
  assert.match(nativeProject.generateUuid(), /^[A-F0-9]{24}$/)
})
