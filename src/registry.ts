/**
 * Id arithmetic and lookups over the generated registry.
 *
 * Nothing here touches a network or a bot. Give it a `stateId` off any 1.8
 * chunk, or an item id and damage out of any Slot, and it tells you what the
 * MysteryBlocks client would have made of it.
 */

import * as fs from 'fs'
import * as path from 'path'
import { decodeMeta } from './meta'
import type {
  BlockDescription, BlockEntry, BlockItemDescription, ItemDescription, ItemEntry,
  ItemGroup, RegistryFile
} from './types'

/** Default location of the generated data file, next to the compiled output. */
export const DEFAULT_REGISTRY_PATH = path.join(__dirname, '..', 'data', 'cb-registry.json')

/**
 * Everything MysteryBlocks registers, indexed by id and by name.
 *
 * ```ts
 * const cb = loadRegistry()
 * cb.describeState(40259)
 * // { key: 'cb:oak_chair', meta: 3, properties: { facing: 'east' }, ... }
 * ```
 */
export class CustomBlockRegistry {
  /** The parsed data file, if you need a field this class does not expose. */
  readonly data: RegistryFile
  /** `ModBlocks.CURRENT_PROTOCOL_VERSION`, the number sent in the handshake reply. */
  readonly protocol: number
  /** SHA-1 over blocks and items. Compare it to spot a MysteryBlocks version mismatch. */
  readonly hash: string
  readonly idBase: number
  readonly blockIdRange: [number, number]
  readonly itemIdRange: [number, number]
  readonly blocks: BlockEntry[]
  readonly items: ItemEntry[]
  readonly itemGroups: Record<string, ItemGroup>

  private readonly blocksById = new Map<number, BlockEntry>()
  private readonly blocksByName = new Map<string, BlockEntry>()
  private readonly itemsById = new Map<number, ItemEntry>()
  private readonly itemsByName = new Map<string, ItemEntry>()

  constructor (data: RegistryFile) {
    this.data = data
    this.protocol = data.protocol
    this.hash = data.hash
    this.idBase = data.idBase
    this.blockIdRange = data.blockIdRange
    this.itemIdRange = data.itemIdRange
    this.blocks = data.blocks
    this.items = data.items
    this.itemGroups = data.itemGroups

    for (const b of data.blocks) {
      this.blocksById.set(b.id, b)
      this.blocksByName.set(b.name, b)
      this.blocksByName.set(b.key, b)
    }
    for (const i of data.items) {
      this.itemsById.set(i.id, i)
      this.itemsByName.set(i.name, i)
      this.itemsByName.set(i.key, i)
    }
  }

  /** Is this numeric block id one of MysteryBlocks' blocks? */
  isBlockId (id: number): boolean {
    return id >= this.blockIdRange[0] && id <= this.blockIdRange[1] && this.blocksById.has(id)
  }

  /**
   * Is this numeric item id one of MysteryBlocks' items?
   *
   * Custom blocks also have an ItemBlock registered under the same numeric id,
   * so the item range spans both tables.
   */
  isItemId (id: number): boolean {
    return id >= this.blockIdRange[0] && id <= this.itemIdRange[1] &&
      (this.blocksById.has(id) || this.itemsById.has(id))
  }

  /** Look a block up by numeric id, by `cb:key`, or by bare `key`. */
  block (idOrName: number | string): BlockEntry | null {
    const entry = typeof idOrName === 'number' ? this.blocksById.get(idOrName) : this.blocksByName.get(idOrName)
    return entry ?? null
  }

  /** Look an item up by numeric id, by `cb:key`, or by bare `key`. */
  item (idOrName: number | string): ItemEntry | null {
    const entry = typeof idOrName === 'number' ? this.itemsById.get(idOrName) : this.itemsByName.get(idOrName)
    return entry ?? null
  }

  /**
   * Resolve a 1.8 chunk block state (`id << 4 | meta`).
   *
   * @returns `null` when the state is not a MysteryBlocks block.
   */
  describeState (stateId: number): BlockDescription | null {
    return this.describeBlock(stateId >> 4, stateId & 0xF, stateId)
  }

  /**
   * Resolve a block id plus its metadata nibble.
   *
   * @param stateId Overrides the `stateId` field, which is otherwise derived.
   * @returns `null` when the id is not a MysteryBlocks block.
   */
  describeBlock (id: number, meta: number, stateId?: number): BlockDescription | null {
    const entry = this.blocksById.get(id)
    if (!entry) return null
    const decoded = decodeMeta(entry, meta)
    return {
      id: entry.id,
      key: entry.name,
      stateId: stateId !== undefined ? stateId : (id << 4) | meta,
      meta,
      blockClass: entry.blockClass,
      displayName: entry.displayName,
      prettyName: entry.prettyName,
      itemGroup: entry.itemGroup,
      material: entry.material,
      soundType: entry.soundType,
      replacement: entry.replacement,
      legacyReplacement: entry.legacyReplacement,
      properties: decoded.properties,
      derivedFromNeighbours: decoded.derivedFromNeighbours,
      decoder: decoded.decoder,
      flags: entry.flags,
      data: entry.data
    }
  }

  /**
   * Describe a custom item stack from its raw numbers.
   *
   * Stack NBT is not parsed here; pass it through and use
   * {@link readStackMetadata} if you want the name, lore and enchantments.
   *
   * @param id Numeric item id from the Slot.
   * @param damage The damage short. For a custom block held as an item this is
   *   the placement metadata.
   * @returns `null` when the id belongs to neither table.
   */
  describeItem (
    id: number,
    damage = 0,
    count = 1,
    nbt: Record<string, any> | null = null
  ): ItemDescription | BlockItemDescription | null {
    const item = this.itemsById.get(id)
    if (item) {
      return {
        kind: 'item',
        id: item.id,
        key: item.name,
        damage,
        count,
        itemClass: item.itemClass,
        displayName: item.displayName,
        prettyName: item.prettyName,
        replacement: item.replacement,
        legacyReplacement: item.legacyReplacement,
        toolMaterialName: item.toolMaterialName,
        attackDamage: item.attackDamage,
        attackSpeed: item.attackSpeed,
        effectiveBlocks: item.effectiveBlocks,
        nbt
      }
    }

    const block = this.describeBlock(id, damage & 0xF)
    if (!block) return null
    return Object.assign({ kind: 'block-item' as const, count, damage, nbt }, block)
  }
}

let cached: CustomBlockRegistry | null = null

/**
 * Load a registry from disk.
 *
 * With no argument this reads the bundled `data/cb-registry.json` once and
 * caches it. Pass a path to use a file you generated yourself, for example from
 * a newer MysteryBlocks build.
 */
export function loadRegistry (file?: string): CustomBlockRegistry {
  if (file === undefined) {
    if (!cached) cached = new CustomBlockRegistry(readRegistryFile(DEFAULT_REGISTRY_PATH))
    return cached
  }
  return new CustomBlockRegistry(readRegistryFile(file))
}

function readRegistryFile (file: string): RegistryFile {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as RegistryFile
}
