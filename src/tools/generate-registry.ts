#!/usr/bin/env node
/**
 * Build `data/cb-registry.json` from a MysteryBlocks jar.
 *
 *     npm run generate -- MysteryBlocks_1.8.9_v1.0.5.jar
 *     npm run generate -- ./some/unpacked/jar [out.json]
 *
 * The id arithmetic mirrors `ModBlocks`/`ModItems`:
 *
 *     block id = 2500 + <id from default_blocks.json>
 *     item  id = 2500 + highestBlockIdOffset + <id from default_items.json>
 *
 * Those are the ids the server puts on the wire once a client has completed the
 * `MM|CustomBlocks` handshake, so they are the registry's primary key.
 */

import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { readResources } from './resources'
import type { BlockEntry, ItemEntry, ItemGroup, RegistryFile } from '../types'

/** `ModBlocks.getBlockKey` / `ModItems.getItemKey`. */
const ID_BASE = 2500
/** `ModBlocks.CURRENT_PROTOCOL_VERSION`. */
const PROTOCOL = 5

const DEFAULT_OUT = path.resolve(__dirname, '..', '..', 'data', 'cb-registry.json')

/**
 * `ModBlocks.getLegacyReplacement`: what a vanilla 1.8 client is shown instead
 * of the custom block. The `name;damage` form means the damage value matters.
 */
const LEGACY_REPLACEMENT: Record<string, string> = {
  'minecraft:cobblestone_stairs': 'minecraft:stone_stairs',
  'minecraft:granite_stairs': 'minecraft:stone_stairs',
  'minecraft:diorite_stairs': 'minecraft:stone_stairs',
  'minecraft:andesite_stairs': 'minecraft:stone_stairs',
  'minecraft:stone_slab': 'minecraft:stone_slab;3',
  'minecraft:granite_slab': 'minecraft:stone_slab;3',
  'minecraft:diorite_slab': 'minecraft:stone_slab;3',
  'minecraft:andesite_slab': 'minecraft:stone_slab;3',
  'minecraft:cobblestone_slab': 'minecraft:stone_slab',
  'minecraft:dark_oak_planks': 'minecraft:planks;5',
  'minecraft:acacia_planks': 'minecraft:planks;4',
  'minecraft:jungle_planks': 'minecraft:planks;3',
  'minecraft:birch_planks': 'minecraft:planks;2',
  'minecraft:spruce_planks': 'minecraft:planks;1',
  'minecraft:bricks': 'minecraft:brick_block',
  'minecraft:spawner': 'minecraft:mob_spawner',
  'minecraft:oak_planks': 'minecraft:planks',
  'minecraft:stone_bricks': 'minecraft:stonebrick',
  'minecraft:end_stone_bricks': 'minecraft:end_stone',
  'minecraft:smooth_quartz_block': 'minecraft:quartz_block',
  'minecraft:nether_quartz_ore': 'minecraft:quartz_ore',
  'minecraft:polished_andesite': 'minecraft:stone;6',
  'minecraft:andesite': 'minecraft:stone;5',
  'minecraft:polished_diorite': 'minecraft:stone;4',
  'minecraft:diorite': 'minecraft:stone;3',
  'minecraft:polished_granite': 'minecraft:stone;2',
  'minecraft:granite': 'minecraft:stone;1',
  'minecraft:nether_bricks': 'minecraft:nether_brick',
  'minecraft:prismarine_bricks': 'minecraft:prismarine;1',
  'minecraft:dark_prismarine': 'minecraft:prismarine;2',
  'minecraft:smooth_red_sandstone': 'minecraft:red_sandstone;2',
  'minecraft:smooth_sandstone': 'minecraft:sandstone;2',
  'minecraft:smooth_stone': 'minecraft:stone',
  'minecraft:grass': 'minecraft:tallgrass',
  'minecraft:note_block': 'minecraft:noteblock',
  'minecraft:oak_fence': 'minecraft:fence',
  'minecraft:oak_fence_gate': 'minecraft:fence_gate',
  'minecraft:yellow_carpet': 'minecraft:carpet;4',
  'minecraft:grass_block': 'minecraft:grass',
  'minecraft:end_rod': 'minecraft:iron_bars',
  'minecraft:oak_leaves': 'minecraft:leaves',
  'minecraft:oak_slab': 'minecraft:wooden_slab',
  'minecraft:spruce_slab': 'minecraft:wooden_slab;1',
  'minecraft:birch_slab': 'minecraft:wooden_slab;2',
  'minecraft:jungle_slab': 'minecraft:wooden_slab;3',
  'minecraft:acacia_slab': 'minecraft:wooden_slab;4',
  'minecraft:dark_oak_slab': 'minecraft:wooden_slab;5',
  'minecraft:oak_button': 'minecraft:wooden_button',
  'minecraft:oak_pressure_plate': 'minecraft:wooden_pressure_plate',
  'minecraft:oak_door': 'minecraft:wooden_door',
  'minecraft:netherite_hoe': 'minecraft:diamond_hoe',
  'minecraft:oak_wood': 'minecraft:log;0',
  'minecraft:spruce_wood': 'minecraft:log;1',
  'minecraft:birch_wood': 'minecraft:log;2',
  'minecraft:jungle_wood': 'minecraft:log;3',
  'minecraft:acacia_wood': 'minecraft:log2;0',
  'minecraft:dark_oak_wood': 'minecraft:log2;1',
  'minecraft:soul_lantern': 'minecraft:wooden_slab',
  'minecraft:mossy_cobblestone_wall': 'minecraft:cobblestone_wall;1',
  'minecraft:chiseled_red_sandstone': 'minecraft:red_sandstone',
  'minecraft:barrel': 'minecraft:chest',
  'minecraft:red_sandstone_wall': 'minecraft:cobblestone_wall;0',
  'minecraft:cut_red_sandstone_slab': 'minecraft:stone_slab2;0',
  'minecraft:red_sandstone_slab': 'minecraft:stone_slab2;0',
  'minecraft:smooth_red_sandstone_stairs': 'minecraft:red_sandstone_stairs',
  'minecraft:cut_red_sandstone': 'minecraft:red_sandstone',
  'minecraft:stone_brick_wall': 'minecraft:cobblestone_wall;0',
  'minecraft:stone_brick_slab': 'minecraft:stone_slab;0',
  'minecraft:spruce_log': 'minecraft:log;1',
  'minecraft:red_wool': 'minecraft:wool;14',
  'minecraft:pointed_dripstone': 'minecraft:packed_ice',
  'minecraft:carved_pumpkin': 'minecraft:pumpkin'
}

/**
 * `getFallbackReplacement()` per block class, read off the decompiled jar.
 *
 * `ModBlock.getReplacement()` returns the JSON `replacement` when there is one
 * and this otherwise, so a block with no `replacement` in `default_blocks.json`
 * can still have one. `UpgradedGateBlock`'s value really is missing the
 * `minecraft:` prefix in the mod; it is kept verbatim.
 */
const FALLBACK_REPLACEMENT: Record<string, string> = {
  'categories.BedsideCabinetBlock': 'minecraft:note_block',
  'categories.CabinetBlock': 'minecraft:bookshelf',
  'categories.CoolerBlock': 'minecraft:iron_block',
  'categories.ParkBenchBlock': 'minecraft:oak_stairs',
  'categories.single.CerealsBlock': 'minecraft:short_grass',
  'categories.single.DoorMatBlock': 'minecraft:yellow_carpet',
  'categories.single.KnittersBlock': 'minecraft:ladder',
  'categories.single.PathBlock': 'minecraft:stone_pressure_plate',
  'fence.UpgradedFenceBlock': 'minecraft:oak_fence',
  'fence.UpgradedGateBlock': 'oak_fence_gate',
  'kitchen.KitchenDrawerBlock': 'minecraft:hopper',
  'kitchen.KitchenSinkBlock': 'minecraft:cauldron',
  'multi.FreezerBlock': 'minecraft:iron_block',
  'multi.FridgeBlock': 'minecraft:iron_block',
  'office.DeskBlock': 'minecraft:oak_stairs',
  'office.DeskCabinetBlock': 'minecraft:crafting_table',
  'small.BlindsBlock': 'minecraft:ladder',
  'small.CoffeeTableBlock': 'minecraft:stone_slab',
  'small.HedgeBlock': 'minecraft:oak_fence',
  'special.MiniStatueBlock': 'minecraft:player_head',
  'special.RedstoneLampBlock': 'minecraft:redstone_lamp',
  'type.ActivatableBlock': 'minecraft:daylight_detector'
}

function legacyReplacement (replacement: string | null): string | null {
  if (!replacement) return null
  return LEGACY_REPLACEMENT[replacement] ?? replacement
}

/** Build the registry from a jar or an unpacked jar directory. */
export function buildRegistry (source: string): RegistryFile {
  const res = readResources(source)

  const rawBlocks = res.blocks.filter(b => b.id !== undefined && b.blockClass).sort((a, b) => a.id - b.id)
  const rawItems = res.items.filter(i => i.id !== undefined && i.itemClass).sort((a, b) => a.id - b.id)

  /** `ModBlocks.getHighestIdOffset()`. */
  const highestBlockOffset = rawBlocks.reduce((max, b) => Math.max(max, b.id), 0)

  const blocks: BlockEntry[] = rawBlocks.map(b => {
    const props = b.properties || {}
    // ModBlock.getReplacement(): the JSON value, or the class default.
    const replacement = b.replacement || FALLBACK_REPLACEMENT[b.blockClass] || null
    // ModBlocks merges properties.data with the waterlogged and redstone flags.
    const data: Record<string, any> = { ...(props.data || {}) }
    if (props.waterlogged !== undefined) data.waterlogged = props.waterlogged
    if (props.redstone !== undefined) data.redstone = props.redstone

    return {
      id: ID_BASE + b.id,
      offset: b.id,
      key: b.key,
      name: `cb:${b.key}`,
      blockClass: b.blockClass,
      versionBlockClass: b.versionBlockClass || null,
      prettyName: b.prettyName || null,
      displayName: res.lang[`block.cb.${b.key}`] || b.prettyName || b.key,
      itemGroup: b.itemGroup || null,
      replacement,
      legacyReplacement: legacyReplacement(replacement),
      replacementFromClass: !b.replacement && replacement !== null,
      material: props.material || null,
      materialColor: props.materialColor || null,
      soundType: props.soundType || null,
      hardness: props.hardness || null,
      fullCube: props.fullCube !== undefined ? props.fullCube : null,
      // Decoder-relevant flags, mirrored from ModBlock/FurnitureBlock.initBlockData.
      flags: {
        openable: !!data.openable,
        activatable: !!(data.active || data.activatable),
        waterlogged: !!data.waterlogged,
        cutout: !!data.cutout,
        redstone: !!data.redstone,
        availableVariants: data.availableVariants !== undefined ? data.availableVariants : -1,
        maxVerticalStack: data.maxVerticalStack !== undefined ? data.maxVerticalStack : -1,
        vanillaPlacementDirection: !!data.vanillaPlacementDirection
      },
      data
    }
  })

  const items: ItemEntry[] = rawItems.map(i => {
    const replacement = i.replacement && typeof i.replacement === 'object'
      ? i.replacement.item
      : i.replacement || null
    return {
      id: ID_BASE + highestBlockOffset + i.id,
      offset: i.id,
      key: i.key,
      name: `cb:${i.key}`,
      itemClass: i.itemClass,
      prettyName: i.prettyName || null,
      displayName: res.lang[`item.cb.${i.key}`] || i.prettyName || i.key,
      replacement,
      legacyReplacement: legacyReplacement(replacement),
      // Enchantments the server may inject into the replacement stack shown to
      // non-CB clients. Not the enchantments on any actual stack.
      replacementEnchantments: (i.replacement && i.replacement.enchantments) || {},
      toolMaterialName: i.toolMaterialName || null,
      attackDamage: i.attackDamage !== undefined ? i.attackDamage : 0,
      attackSpeed: i.attackSpeed !== undefined ? i.attackSpeed : 0,
      effectiveBlocks: i.effectiveBlocks || []
    }
  })

  const itemGroups = res.groups.reduce<Record<string, ItemGroup>>((acc, g) => {
    acc[g.tag] = { id: g.id, tag: g.tag, displayBlock: g.displayBlock, prettyName: g.prettyName }
    return acc
  }, {})

  const highestItemOffset = items.reduce((max, i) => Math.max(max, i.offset), 0)

  const registry: RegistryFile = {
    generatedFrom: res.source,
    modId: 'cb',
    modVersion: res.modVersion,
    minecraftVersion: res.minecraftVersion,
    protocol: PROTOCOL,
    pluginChannel: 'MM|CustomBlocks',
    idBase: ID_BASE,
    highestBlockOffset,
    blockIdRange: [ID_BASE, ID_BASE + highestBlockOffset],
    itemIdRange: [ID_BASE + highestBlockOffset + 1, ID_BASE + highestBlockOffset + highestItemOffset],
    itemGroups,
    blocks,
    items,
    hash: ''
  }

  registry.hash = crypto.createHash('sha1')
    .update(JSON.stringify({ blocks: registry.blocks, items: registry.items }))
    .digest('hex')

  return registry
}

function main (argv: string[]): void {
  const source = argv[0]
  if (!source) {
    console.error('usage: generate-registry <mod.jar|dir> [out.json]')
    process.exit(1)
  }
  const outFile = path.resolve(argv[1] ?? DEFAULT_OUT)
  const registry = buildRegistry(path.resolve(source))

  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, JSON.stringify(registry, null, 1))

  console.log(`wrote ${outFile}`)
  console.log(`${registry.blocks.length} blocks  ids ${registry.blockIdRange.join('..')}`)
  console.log(`${registry.items.length} items    ids ${registry.itemIdRange.join('..')}`)
  console.log(`hash ${registry.hash}`)
}

if (require.main === module) main(process.argv.slice(2))
