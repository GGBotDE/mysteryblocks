#!/usr/bin/env node
/**
 * Dump the MysteryBlocks JSON resources out of a jar.
 *
 *     npm run extract -- MysteryBlocks_1.8.9_v1.0.5.jar [outDir]
 *
 * Writes `customblocks/*.json`, the lang file and `mcmod.info` into `outDir`
 * (default `./extracted`), keeping the jar's own paths. Useful for reading the
 * raw data, diffing two mod versions, or feeding `generate-registry` a
 * directory instead of a jar.
 */

import * as fs from 'fs'
import * as path from 'path'
import { readResources } from './resources'

function main (argv: string[]): void {
  const source = argv[0]
  if (!source) {
    console.error('usage: extract <mod.jar|dir> [outDir]')
    process.exit(1)
  }
  const outDir = path.resolve(argv[1] ?? 'extracted')
  const res = readResources(path.resolve(source))

  for (const [name, text] of Object.entries(res.files)) {
    const dest = path.join(outDir, ...name.split('/'))
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, text)
    console.log(`${name}  ${text.length} bytes`)
  }

  console.log(`\nMysteryBlocks ${res.modVersion} for ${res.minecraftVersion}`)
  console.log(`${res.blocks.length} blocks, ${res.items.length} items, ${res.groups.length} item groups`)
  console.log(`written to ${outDir}`)
}

main(process.argv.slice(2))
