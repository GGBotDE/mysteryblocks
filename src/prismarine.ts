/**
 * Teaching a prismarine-registry about the `cb:` id space.
 *
 * This works on any `prismarine-registry('1.8.9')`, with or without a bot. Once
 * patched, plain prismarine-block and prismarine-item code resolves custom
 * blocks and items without knowing MysteryBlocks exists.
 */

import { loadRegistry, type CustomBlockRegistry } from './registry'
import { resolveVanillaRef } from './vanilla'

/**
 * `block.BlockProperties.Hardness`, used for the 256 blocks that have no vanilla
 * replacement. `PLANKS` is the field default.
 */
const HARDNESS: Record<string, [number, number]> = {
  PLANKS: [2.0, 5.0],
  LEAVES: [0.2, 1.0],
  SEA_LANTERN: [0.3, 1.5],
  CARPET: [0.1, 0.16666667],
  IRON_BLOCK: [5.0, 10.0],
  FENCE: [2.0, 5.0],
  FENCE_GATE: [2.0, 5.0],
  GRASS: [0.6, 3.0],
  LOG: [2.0, 10.0],
  PLANT: [0.0, 0.0],
  ORE: [3.0, 3.0]
}

/**
 * Register every `cb:` block and item into a prismarine registry, in place.
 *
 * prismarine-block resolves a block through `registry.blocksByStateId`, and
 * prismarine-item through `registry.items`. Without these entries every custom
 * block reads back as name `''` and every custom item as `unknown`.
 *
 * Where a block or item has a vanilla replacement, its properties are copied
 * from that replacement rather than invented. That mirrors the mod:
 * `VersionBlock` takes hardness and material from the replacement through
 * `BlockPropertiesConverter`, and falls back to the `Hardness` enum only when
 * there is no replacement. The practical effect is that `bot.digTime()`,
 * `bot.canDigBlock()` and item durability behave like the real thing.
 *
 * Calling this twice on the same registry is a no-op.
 *
 * @param registry A prismarine-registry, usually `bot.registry`.
 * @param cb Registry to take the custom blocks from. Defaults to the bundled one.
 */
export function patchRegistry (registry: any, cb: CustomBlockRegistry = loadRegistry()): void {
  if (!registry || registry.__cbPatched) return
  registry.__cbPatched = true

  const shapes = registry.blockCollisionShapes
  const fullCubeShapeId = shapes ? shapes.blocks.stone : undefined
  const emptyShapeId = shapes ? shapes.blocks.air : undefined

  // BlockPropertiesConverter.getBlock falls back to planks when a replacement
  // does not resolve to a real 1.8 block, so mirror that rather than inventing.
  const planks = registry.blocksByName?.planks ?? null

  for (const b of cb.blocks) {
    const minStateId = b.id << 4
    const ref = resolveVanillaRef(b.legacyReplacement || b.replacement, registry, 'block')
    const resolved = ref && ref.entry && ref.entry.boundingBox !== undefined ? ref.entry : null
    const vanilla = resolved ?? (b.replacement ? planks : null)
    // The Hardness enum only applies when getReplacement() is null.
    const fallback = (b.hardness ? HARDNESS[b.hardness] : undefined) ?? HARDNESS.PLANKS!

    const entry: any = {
      id: b.id,
      name: b.name,
      displayName: b.displayName,
      hardness: vanilla ? vanilla.hardness : fallback[0],
      resistance: vanilla ? vanilla.resistance : fallback[1],
      stackSize: 64,
      diggable: vanilla ? vanilla.diggable : true,
      // Exact hulls live in assets/cb/shapes_*.dat and are not decoded here, so
      // fall back to the replacement's box, which is what a client without the
      // handshake collides with anyway.
      boundingBox: vanilla ? vanilla.boundingBox : 'block',
      material: vanilla ? vanilla.material : (b.material || 'rock').toLowerCase(),
      drops: vanilla ? vanilla.drops || [] : [],
      transparent: vanilla ? vanilla.transparent : b.flags.cutout,
      emitLight: vanilla ? vanilla.emitLight : 0,
      filterLight: vanilla ? vanilla.filterLight : 15,
      minStateId,
      maxStateId: minStateId + 15,
      defaultState: minStateId,
      // Extras prismarine ignores, handy downstream.
      cb: b,
      vanillaReplacement: ref
    }

    // Copy harvestTools only when the replacement has one. An empty object means
    // "no tool can harvest this", which would slow digTime by 5x.
    if (vanilla && vanilla.harvestTools) entry.harvestTools = vanilla.harvestTools

    registry.blocks[b.id] = entry
    registry.blocksByName[b.name] = entry
    for (let meta = 0; meta < 16; meta++) registry.blocksByStateId[minStateId + meta] = entry

    // Registering the name here makes prismarine-block's shape-prep loop assign
    // a real shape every time a new Block class is built for this registry.
    if (shapes) {
      const source = vanilla && shapes.blocks[vanilla.name] !== undefined
        ? shapes.blocks[vanilla.name]
        : (entry.boundingBox === 'empty' ? emptyShapeId : fullCubeShapeId)
      shapes.blocks[b.name] = source
      const resolved = shapes.shapes[Array.isArray(source) ? source[0] : source]
      entry.shapes = resolved || shapes.shapes[fullCubeShapeId]
    }
  }

  for (const i of cb.items) {
    const ref = resolveVanillaRef(i.legacyReplacement || i.replacement, registry, 'item')
    const vanilla = ref ? ref.entry : null
    const entry: any = {
      id: i.id,
      name: i.name,
      displayName: i.displayName,
      stackSize: vanilla ? vanilla.stackSize : (i.itemClass === 'type.DefaultItem' ? 64 : 1),
      cb: i,
      vanillaReplacement: ref
    }
    // Tools replace vanilla tools, so durability behaves the same way.
    if (vanilla && vanilla.maxDurability !== undefined) entry.maxDurability = vanilla.maxDurability
    if (vanilla && vanilla.enchantCategories) entry.enchantCategories = vanilla.enchantCategories
    if (vanilla && vanilla.repairWith) entry.repairWith = vanilla.repairWith

    registry.items[i.id] = entry
    registry.itemsByName[i.name] = entry
  }

  // Custom blocks also exist as items, their ItemBlock sharing the block id.
  for (const b of cb.blocks) {
    if (registry.items[b.id]) continue
    const block = registry.blocks[b.id]
    const entry = {
      id: b.id,
      name: b.name,
      displayName: b.displayName,
      stackSize: 64,
      cb: b,
      vanillaReplacement: block ? block.vanillaReplacement : null
    }
    registry.items[b.id] = entry
    if (!registry.itemsByName[b.name]) registry.itemsByName[b.name] = entry
  }
}
