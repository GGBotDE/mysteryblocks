/**
 * Pulling the MysteryBlocks resources out of a jar, or out of a directory that
 * already holds them.
 *
 * The mod ships its whole block and item catalogue as JSON, so a jar plus the
 * id arithmetic in `ModBlocks`/`ModItems` is everything the registry needs.
 */

import * as fs from 'fs'
import * as path from 'path'
import { Jar } from './jar'

export const PATHS = {
  blocks: 'customblocks/default_blocks.json',
  items: 'customblocks/default_items.json',
  groups: 'customblocks/default_item_groups.json',
  lang: 'assets/cb/lang/en_us.json',
  info: 'mcmod.info'
}

export interface ModResources {
  /** Where these came from, for the `generatedFrom` field. */
  source: string
  modVersion: string
  minecraftVersion: string
  blocks: any[]
  items: any[]
  groups: any[]
  /** Translation keys to display names. Empty when the jar has no lang file. */
  lang: Record<string, string>
  /** The raw files, keyed by their jar path, for anyone who wants to dump them. */
  files: Record<string, string>
}

/**
 * Read the resources from a `.jar`, or from a directory laid out like one (an
 * unpacked or decompiled jar works).
 *
 * @throws When the required block, item or group JSON is missing.
 */
export function readResources (source: string): ModResources {
  const read = fs.statSync(source).isDirectory() ? directoryReader(source) : jarReader(source)

  const files: Record<string, string> = {}
  for (const name of Object.values(PATHS)) {
    const text = read(name)
    if (text !== null) files[name] = text
  }

  const required = (name: string): any => {
    const text = files[name]
    if (text === undefined) throw new Error(`${source} has no ${name}`)
    return JSON.parse(text)
  }

  const info = files[PATHS.info] ? JSON.parse(files[PATHS.info]!)[0] : null
  if (!files[PATHS.lang]) console.warn(`[cb] no ${PATHS.lang}, display names fall back to prettyName`)

  return {
    source: path.basename(source),
    modVersion: info?.version ?? 'unknown',
    minecraftVersion: info?.mcversion ?? '1.8.9',
    blocks: required(PATHS.blocks),
    items: required(PATHS.items),
    groups: required(PATHS.groups),
    lang: files[PATHS.lang] ? JSON.parse(files[PATHS.lang]!) : {},
    files
  }
}

function jarReader (file: string): (name: string) => string | null {
  const jar = Jar.open(file)
  return name => jar.readText(name)
}

function directoryReader (dir: string): (name: string) => string | null {
  return name => {
    const p = path.join(dir, ...name.split('/'))
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null
  }
}
