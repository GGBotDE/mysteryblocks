/** Offline checks. No network, no bot, no mineflayer. */

import { describe, expect, it } from 'vitest'
import prismarineRegistry from 'prismarine-registry'
import prismarineBlock from 'prismarine-block'
import prismarineItem from 'prismarine-item'

import {
  DECODERS, NEIGHBOUR_DERIVED, loadRegistry, patchRegistry, readMcString, readStackMetadata,
  resolveVanillaRef, simplifyNbt, writeMcString
} from '../src'

const cb = loadRegistry()

describe('registry', () => {
  it('has id ranges matching the ModBlocks and ModItems arithmetic', () => {
    expect(cb.idBase).toBe(2500)
    expect(cb.blockIdRange).toEqual([2500, 3327]) // 2500 + highest block offset (827)
    expect(cb.itemIdRange).toEqual([3328, 3335]) // 2500 + 827 + item offsets 1..8
  })

  it('gives every block the id 2500 + offset', () => {
    for (const b of cb.blocks) expect(b.id, b.key).toBe(2500 + b.offset)
  })

  it('gives every item the id 2500 + 827 + offset', () => {
    for (const i of cb.items) expect(i.id, i.key).toBe(3327 + i.offset)
  })

  it('has a decoder for every blockClass it contains', () => {
    const missing = new Set<string>()
    for (const b of cb.blocks) if (!DECODERS[b.blockClass]) missing.add(b.blockClass)
    expect([...missing]).toEqual([])
  })

  it('agrees between lookup by name and lookup by id', () => {
    const table = cb.block('cb:oak_table')!
    expect(table).toBeTruthy()
    expect(cb.block(table.id)!.key).toBe('oak_table')
    expect(cb.block('oak_table')!.id).toBe(table.id)
  })

  it('returns null for names and ids it does not know', () => {
    expect(cb.block('cb:not_a_block')).toBeNull()
    expect(cb.item(999999)).toBeNull()
    expect(cb.describeBlock(35, 0)).toBeNull()
  })
})

describe('metadata decoding', () => {
  it('orders FurnitureHorizontalBlock facing as north, south, west, east', () => {
    const chair = cb.block('cb:oak_chair')!
    expect(chair.blockClass).toBe('categories.ChairBlock')
    const facings = [0, 1, 2, 3].map(m => cb.describeBlock(chair.id, m)!.properties.facing)
    expect(facings).toEqual(['north', 'south', 'west', 'east'])
  })

  it('decodes StairsBlock through Direction.getFront(5 - (meta & 3))', () => {
    const stairs = cb.blocks.find(b => b.blockClass === 'general.StairsBlock')!
    // meta & 3: 0 east, 1 west, 2 south, 3 north. Bit 4 is the top half.
    expect([0, 1, 2, 3].map(m => cb.describeBlock(stairs.id, m)!.properties.facing))
      .toEqual(['east', 'west', 'south', 'north'])
    expect(cb.describeBlock(stairs.id, 0)!.properties.half).toBe('bottom')
    expect(cb.describeBlock(stairs.id, 4)!.properties.half).toBe('top')
  })

  it('orders SlabBlock type as top, bottom, double', () => {
    const slab = cb.blocks.find(b => b.blockClass === 'general.SlabBlock')!
    expect([0, 1, 2].map(m => cb.describeBlock(slab.id, m)!.properties.type))
      .toEqual(['top', 'bottom', 'double'])
  })

  it('packs VerticalSlabBlock axis in bit 0 and type in bits 1 and 2', () => {
    const vs = cb.blocks.find(b => b.blockClass === 'general.VerticalSlabBlock')!
    const d = cb.describeBlock(vs.id, 0b101)! // axis = 1 (z), type = (5 >> 1) & 3 = 2 (double)
    expect(d.properties.axis).toBe('z')
    expect(d.properties.type).toBe('double')
  })

  it('splits DoorBlock on bit 8 and rotates the lower facing counter-clockwise', () => {
    const door = cb.blocks.find(b => b.blockClass === 'general.DoorBlock')!

    const lower = cb.describeBlock(door.id, 0b0100)! // north rotated CCW is west, open
    expect(lower.properties).toMatchObject({ half: 'lower', facing: 'west', open: true })

    const upper = cb.describeBlock(door.id, 0b1011)!
    expect(upper.properties).toMatchObject({ half: 'upper', hinge: 'right', powered: true })
  })

  it('maps DirectionBlock as 0 down, 1 east, 2 west, 3 south, 4 north', () => {
    const dir = cb.blocks.find(b => b.blockClass === 'general.DirectionBlock')!
    expect([0, 1, 2, 3, 4, 5].map(m => cb.describeBlock(dir.id, m)!.properties.facing))
      .toEqual(['down', 'east', 'west', 'south', 'north', 'up'])
  })

  it('takes DoubleBlock part from meta / 4 and facing from meta % 4', () => {
    const dbl = cb.blocks.find(b => b.blockClass === 'type.DoubleBlock')!
    const d = cb.describeBlock(dbl.id, 6)! // part = 6 / 4 = 1 (right), facing = 6 % 4 = 2 (west)
    expect(d.properties).toMatchObject({ part: 'right', facing: 'west' })
  })

  it('puts ActivatableBlock activated above meta 3', () => {
    const act = cb.blocks.find(b => b.blockClass === 'type.ActivatableBlock')!
    expect(cb.describeBlock(act.id, 2)!.properties.activated).toBe(false)
    expect(cb.describeBlock(act.id, 6)!.properties).toMatchObject({ activated: true, facing: 'west' })
  })

  it('decodes bit 0x4 as open for openable blocks', () => {
    const openable = cb.blocks.find(b => b.flags.openable && b.blockClass === 'type.DefaultHorizontalBlock')
    if (!openable) return // no such block in this registry build
    expect(cb.describeBlock(openable.id, 0)!.properties.open).toBe(false)
    expect(cb.describeBlock(openable.id, 4)!.properties.open).toBe(true)
  })

  it('flags neighbour-derived classes as incomplete', () => {
    const table = cb.block('cb:oak_table')! // type.InfiniteExtensionBlock
    expect(cb.describeBlock(table.id, 0)!.derivedFromNeighbours).toBe(true)
    const chair = cb.block('cb:oak_chair')!
    expect(cb.describeBlock(chair.id, 0)!.derivedFromNeighbours).toBe(false)
  })

  it('lists exactly the classes whose getActualState reads the world', () => {
    // Read off the decompiled jar: every class that overrides getActualState and
    // touches the world parameter, plus subclasses that inherit one. Regenerate
    // this list when the mod updates, do not guess at it.
    expect([...NEIGHBOUR_DERIVED].sort()).toEqual([
      'categories.ParkBenchBlock',
      'general.DoorBlock',
      'general.StairsBlock',
      'general.TrampolineBlock',
      'kitchen.KitchenCounterBlock',
      'office.DeskBlock',
      'office.DeskCabinetBlock',
      'small.BlindsBlock',
      'small.CoffeeTableBlock',
      'type.CornerExtensionBlock',
      'type.HorizontalExtensionBlock',
      'type.InfiniteExtensionBlock',
      'type.VerticalExtensionBlock'
    ])
  })

  it('only names classes that the registry actually contains', () => {
    const present = new Set(cb.blocks.map(b => b.blockClass))
    for (const name of NEIGHBOUR_DERIVED) expect(present.has(name), name).toBe(true)
  })

  it('ignores metadata bits above the low nibble', () => {
    const chair = cb.block('cb:oak_chair')!
    expect(cb.describeBlock(chair.id, 0b10011)!.properties.facing)
      .toBe(cb.describeBlock(chair.id, 0b0011)!.properties.facing)
  })

  it('splits describeState into id and meta', () => {
    const chair = cb.block('cb:oak_chair')!
    const d = cb.describeState((chair.id << 4) | 3)!
    expect(d).toMatchObject({ id: chair.id, meta: 3 })
    expect(d.properties.facing).toBe('east')
  })

  it('does not mistake vanilla ids for custom blocks', () => {
    expect(cb.describeState((1 << 4) | 0)).toBeNull() // stone
    expect(cb.isBlockId(35)).toBe(false)
    expect(cb.isBlockId(2500)).toBe(true)
  })
})

describe('items', () => {
  it('resolves a custom tool with its vanilla replacement', () => {
    const d = cb.describeItem(3328, 0, 1)!
    expect(d.key).toBe('cb:pickaxe_rgb')
    expect(d.kind).toBe('item')
    expect(d).toMatchObject({
      itemClass: 'type.PickaxeItem',
      replacement: 'minecraft:diamond_pickaxe'
    })
  })

  it('resolves a custom block held as an item as block-item', () => {
    const chair = cb.block('cb:oak_chair')!
    const d = cb.describeItem(chair.id, 0, 5)!
    expect(d).toMatchObject({ kind: 'block-item', key: 'cb:oak_chair', count: 5 })
  })

  it('applies the legacy replacement mapping', () => {
    const table = cb.block('cb:oak_table')!
    expect(table.replacement).toBe('minecraft:oak_wood')
    expect(table.legacyReplacement).toBe('minecraft:log;0')
  })

  it('returns null for an id in neither table', () => {
    expect(cb.describeItem(1, 0, 1)).toBeNull()
  })
})

describe('handshake wire format', () => {
  it('round-trips a PacketBuffer string', () => {
    const payload = JSON.stringify({ protocol: 5 })
    const buf = writeMcString(payload)
    expect(buf[0]).toBe(payload.length) // single byte VarInt for short strings
    expect(readMcString(buf)).toBe(payload)
  })

  it('reads back the server StartHandshake buffer', () => {
    expect(readMcString(writeMcString('StartHandshake'))).toBe('StartHandshake')
  })

  it('rejects a truncated buffer instead of throwing', () => {
    expect(readMcString(Buffer.from([0x40, 0x61]))).toBeNull()
  })

  it('round-trips a string long enough to need a multi-byte VarInt', () => {
    const long = 'x'.repeat(500)
    expect(readMcString(writeMcString(long))).toBe(long)
  })

  it('replies with exactly what the mod sends', () => {
    // ServerConnection.getJsonPayload() is {"protocol":5}
    expect(JSON.stringify({ protocol: cb.protocol })).toBe('{"protocol":5}')
  })
})

describe('registry patching', () => {
  it('makes prismarine-block resolve cb: blocks', () => {
    const registry = prismarineRegistry('1.8.9')
    patchRegistry(registry)
    const Block = prismarineBlock(registry)
    const chair = cb.block('cb:oak_chair')!
    const block = Block.fromStateId((chair.id << 4) | 3, 0)
    expect(block).toMatchObject({ name: 'cb:oak_chair', type: chair.id, metadata: 3 })
    expect(Array.isArray(block.shapes)).toBe(true)
  })

  it('makes prismarine-item resolve cb: items', () => {
    const registry = prismarineRegistry('1.8.9')
    patchRegistry(registry)
    const Item = prismarineItem(registry)
    const item = new Item(3328, 1, 0)
    expect(item.name).toBe('cb:pickaxe_rgb')
    // en_us.json wins over the German prettyName in default_items.json
    expect(item.displayName).toBe('Pickaxe RGB')
    expect(cb.item(3328)!.prettyName).toBe('Spezielle Spitzhacke')
  })

  it('leaves vanilla blocks alone', () => {
    const registry = prismarineRegistry('1.8.9')
    patchRegistry(registry)
    const Block = prismarineBlock(registry)
    const stone = Block.fromStateId(1 << 4, 0)
    expect(stone).toMatchObject({ name: 'stone', boundingBox: 'block' })
  })

  it('is a no-op the second time', () => {
    const registry = prismarineRegistry('1.8.9')
    patchRegistry(registry)
    const first = registry.blocks[2500]
    patchRegistry(registry)
    expect(registry.blocks[2500]).toBe(first)
  })
})

describe('stack metadata', () => {
  it('pulls name, lore, enchantments and flags out of NBT', () => {
    const registry = prismarineRegistry('1.8.9')
    const meta = readStackMetadata({
      display: { Name: 'Test', Lore: ['a', 'b'] },
      ench: [{ id: 32, lvl: 5 }, { id: 34, lvl: 3 }],
      Unbreakable: 1,
      RepairCost: 7,
      HideFlags: 63,
      CanPlaceOn: ['minecraft:stone']
    }, registry)

    expect(meta).toMatchObject({
      customName: 'Test',
      lore: ['a', 'b'],
      unbreakable: true,
      repairCost: 7,
      hideFlags: 63,
      canPlaceOn: ['minecraft:stone']
    })
    expect(meta.enchantments.map(e => `${e.name}:${e.lvl}`)).toEqual(['efficiency:5', 'unbreaking:3'])
  })

  it('copes with a stack that has no NBT at all', () => {
    const meta = readStackMetadata(null, null)
    expect(meta).toMatchObject({ customName: null, lore: [], enchantments: [], unbreakable: false })
  })

  it('returns enchantment ids even with no registry to name them', () => {
    const meta = readStackMetadata({ ench: [{ id: 32, lvl: 5 }] }, null)
    expect(meta.enchantments).toEqual([{ id: 32, name: null, displayName: null, lvl: 5 }])
  })
})

describe('replacement resolution', () => {
  it('resolves a replacement name to its 1.8 id', () => {
    const registry = prismarineRegistry('1.8.9')
    const ref = resolveVanillaRef('minecraft:diamond_pickaxe', registry, 'item')!
    expect(ref).toMatchObject({ name: 'minecraft:diamond_pickaxe', id: 278, damage: null })
  })

  it('splits the name;damage legacy form', () => {
    const registry = prismarineRegistry('1.8.9')
    const ref = resolveVanillaRef('minecraft:log;0', registry, 'block')!
    expect(ref).toMatchObject({ name: 'minecraft:log', id: 17, damage: 0 })
  })

  it('leaves the id null without a registry, and for names 1.8 does not have', () => {
    expect(resolveVanillaRef('minecraft:diamond_pickaxe')!.id).toBeNull()
    const registry = prismarineRegistry('1.8.9')
    // ModBlock.getFallbackReplacement values are modern names, and some of them
    // have no 1.8 equivalent at all.
    expect(resolveVanillaRef('minecraft:short_grass', registry, 'block')!.id).toBeNull()
  })

  it('applies the class fallback when default_blocks.json has no replacement', () => {
    // KitchenSinkBlock.getFallbackReplacement() returns minecraft:cauldron, and
    // none of those blocks carry a replacement in the JSON.
    const sink = cb.blocks.find(b => b.blockClass === 'kitchen.KitchenSinkBlock')!
    expect(sink.replacement).toBe('minecraft:cauldron')
    expect(sink.replacementFromClass).toBe(true)

    // CabinetBlock declares a fallback too, but every cabinet has its own
    // replacement in the JSON, so the fallback never applies.
    const cabinet = cb.blocks.find(b => b.blockClass === 'categories.CabinetBlock')!
    expect(cabinet.replacementFromClass).toBe(false)
    expect(cabinet.replacement).toBe('minecraft:oak_planks')
  })
})

describe('nbt', () => {
  it('flattens the tagged prismarine form', () => {
    const tagged = {
      type: 'compound',
      value: {
        display: { type: 'compound', value: { Name: { type: 'string', value: '§bCooles Sofa' } } },
        Damage: { type: 'short', value: 3 }
      }
    }
    expect(simplifyNbt(tagged)).toEqual({ display: { Name: '§bCooles Sofa' }, Damage: 3 })
  })

  it('turns longs into decimal strings', () => {
    expect(simplifyNbt({ type: 'long', value: [0, 42] })).toBe('42')
  })
})
