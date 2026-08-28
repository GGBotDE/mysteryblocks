/**
 * Every `ModBlock#getStateFromMeta` in MysteryBlocks 1.0.5, ported to TypeScript.
 *
 * On 1.8 the wire carries 4 bits of metadata per block, so this is the complete
 * set of state a receiving client can be told about a placed block. Anything not
 * listed here (fence and wall connections, stair shape, kitchen counter corner
 * type, desk type, coffee table connections) is not sent by the server: the
 * MysteryBlocks client recomputes it from the neighbouring blocks in
 * `ModBlock#getActualState`. {@link NEIGHBOUR_DERIVED} flags those classes, so a
 * consumer knows the state is incomplete unless it also has the surrounding
 * blocks.
 */

import type { BlockEntry, BlockProperties, DecodedMeta } from './types'

/** Ordinal order of `block.property.Direction`. */
export const DIRECTION = ['north', 'south', 'west', 'east']
/** Ordinal order of `block.property.EnumDirection`. */
export const ENUM_DIRECTION = ['north', 'south', 'west', 'east', 'up', 'down']
export const AXIS = ['x', 'y', 'z']

const SLAB_TYPE = ['top', 'bottom', 'double']
const V_SLAB_AXIS = ['x', 'z']
const BLOCK_HALF = ['upper', 'lower']
const DOUBLE_PART = ['left', 'right']
const TRIPLE_PART = ['middle', 'left', 'right']
const SCARECROW_PART = ['bottom', 'top', 'left_arm', 'right_arm']
const DIVING_BOARD_PART = ['base', 'board']
const LAYERS = ['one', 'two', 'three', 'four', 'five', 'six']
const TRACE = ['player', 'sleigh', 'sleigh_both']

/** `Direction.rotateYCCW()`. */
const ROTATE_YCCW: Record<string, string> = { north: 'west', south: 'east', west: 'south', east: 'north' }

/** Unpacks metadata into `out` and returns it. */
export type MetaDecoder = (entry: BlockEntry, meta: number, out: BlockProperties) => BlockProperties

function pick (arr: string[], i: number): string | null {
  const v = arr[i]
  return v !== undefined ? v : null
}

/** `Direction.getFront(index)`, which is `values()[Math.abs(index % 6) - 2]`. */
function directionFront (index: number): string | null {
  return pick(DIRECTION, Math.abs(index % 6) - 2)
}

/** `FurnitureBlock#getStateFromMeta`: bit `0x4` is open or activated, per the block's flags. */
function furniture (entry: BlockEntry, meta: number, out: BlockProperties): BlockProperties {
  if (entry.flags.openable) out.open = (meta & 0x4) !== 0
  else if (entry.flags.activatable) out.activated = (meta & 0x4) !== 0
  return out
}

/** `FurnitureHorizontalBlock#getStateFromMeta`. */
function furnitureHorizontal (entry: BlockEntry, meta: number, out: BlockProperties): BlockProperties {
  furniture(entry, meta, out)
  out.facing = pick(DIRECTION, meta & 0x3)
  return out
}

/** `type.DefaultHorizontalBlock#getStateFromMeta`. */
function defaultHorizontal (entry: BlockEntry, meta: number, out: BlockProperties): BlockProperties {
  if (!entry.flags.openable) return furnitureHorizontal(entry, meta, out)
  out.facing = pick(DIRECTION, meta & 0x3)
  out.open = (meta & 0x4) !== 0
  return out
}

/** `type.AxisBlock#getStateFromMeta`. */
function axisBlock (_entry: BlockEntry, meta: number, out: BlockProperties): BlockProperties {
  const v = meta & 0x3
  out.axis = v === 1 ? 'x' : v === 2 ? 'z' : 'y'
  return out
}

/** `general.DirectionBlock#getStateFromMeta`. */
function directionBlock (_entry: BlockEntry, meta: number, out: BlockProperties): BlockProperties {
  switch (meta & 0x7) {
    case 0: out.facing = 'down'; break
    case 1: out.facing = 'east'; break
    case 2: out.facing = 'west'; break
    case 3: out.facing = 'south'; break
    case 4: out.facing = 'north'; break
    default: out.facing = 'up'; break
  }
  return out
}

/** The `part = values[meta / 4], facing = values[meta % 4]` family. */
function partAndFacing (parts: string[], cap: number): MetaDecoder {
  return (_entry, meta, out) => {
    if (meta > cap) meta = cap
    out.part = pick(parts, Math.floor(meta / 4))
    out.facing = pick(DIRECTION, meta % 4)
    return out
  }
}

/** Decoder per Java class name, keyed exactly as `blockClass` in the registry. */
export const DECODERS: Record<string, MetaDecoder> = {
  'type.DefaultBlock': furniture,
  'type.ItemOnlyBlock': furniture,
  'type.DefaultHorizontalBlock': defaultHorizontal,

  'type.ActivatableBlock': (_e, meta, out) => {
    out.activated = meta > 3
    if (meta > 3) meta -= 4
    out.facing = pick(DIRECTION, meta)
    return out
  },
  'type.ActivatableOnlyBlock': (_e, meta, out) => {
    out.activated = meta > 3
    return out
  },
  'type.AxisBlock': axisBlock,
  'type.PipeBlock': (e, meta, out) => {
    axisBlock(e, meta, out)
    out.activated = (meta & 0x4) === 4
    return out
  },
  'type.DoubleBlock': partAndFacing(DOUBLE_PART, 7),
  'type.TripleBlock': partAndFacing(TRIPLE_PART, 15),
  'type.DoubleVerticalBlock': (_e, meta, out) => {
    if (meta > 7) meta = 7
    out.half = pick(BLOCK_HALF, Math.floor(meta / 4))
    out.facing = pick(DIRECTION, meta % 4)
    return out
  },
  'type.LitBlock': (e, meta, out) => {
    furniture(e, meta, out)
    out.lit = (meta & 0x4) !== 0
    return out
  },
  'type.LayeredExtensionBlock': (e, meta, out) => {
    furnitureHorizontal(e, meta, out)
    out.layer = 8
    return out
  },
  'type.RandomVariantBlock': (e, meta, out) => {
    furnitureHorizontal(e, meta & 0x3, out)
    out.variant = meta >> 2
    return out
  },

  // Connection shape comes from the neighbours, only facing is on the wire.
  'type.CornerExtensionBlock': furnitureHorizontal,
  'type.HorizontalExtensionBlock': furnitureHorizontal,
  'type.VerticalExtensionBlock': furnitureHorizontal,
  'type.InfiniteExtensionBlock': furniture,

  'general.SlabBlock': (_e, meta, out) => {
    out.type = pick(SLAB_TYPE, meta & 0x3)
    return out
  },
  'general.VerticalSlabBlock': (_e, meta, out) => {
    out.axis = pick(V_SLAB_AXIS, meta & 0x1)
    out.type = pick(SLAB_TYPE, (meta >> 1) & 0x3)
    return out
  },
  'general.StairsBlock': (_e, meta, out) => {
    out.half = (meta & 0x4) > 0 ? 'top' : 'bottom'
    out.facing = directionFront(5 - (meta & 0x3))
    return out
  },
  'general.WallBlock': furniture,
  'general.TrampolineBlock': furniture,
  'general.DoorBlock': (_e, meta, out) => {
    if ((meta & 0x8) > 0) {
      out.half = 'upper'
      out.hinge = (meta & 0x1) > 0 ? 'right' : 'left'
      out.powered = (meta & 0x2) > 0
    } else {
      out.half = 'lower'
      const facing = pick(DIRECTION, meta & 0x3)
      out.facing = facing !== null ? ROTATE_YCCW[facing] ?? null : null
      out.open = (meta & 0x4) > 0
    }
    return out
  },
  'general.TrapDoorBlock': (_e, meta, out) => {
    switch (meta & 0x3) {
      case 0: out.facing = 'north'; break
      case 1: out.facing = 'south'; break
      case 2: out.facing = 'west'; break
      default: out.facing = 'east'; break
    }
    out.open = (meta & 0x4) !== 0
    out.half = (meta & 0x8) === 0 ? 'bottom' : 'top'
    return out
  },
  'general.ButtonBlock': (e, meta, out) => {
    directionBlock(e, meta, out)
    out.powered = (meta & 0x8) > 0
    return out
  },
  'general.DirectionBlock': directionBlock,
  'general.TransferHopperBlock': directionBlock,
  'general.PressurePlateBlock': (_e, meta, out) => {
    out.powered = (meta & 0x1) > 0
    return out
  },
  'general.StackedBlock': (_e, meta, out) => {
    out.layers = pick(LAYERS, meta & 0x7)
    out.axis = (meta & 0x8) === 8 ? 'z' : 'x'
    return out
  },

  'fence.UpgradedFenceBlock': furniture,
  'fence.PicketFenceBlock': furniture,
  'fence.UpgradedGateBlock': (_e, meta, out) => {
    out.facing = pick(DIRECTION, meta & 0x3)
    out.hinge = (meta & 0x4) !== 0 ? 'right' : 'left'
    out.open = (meta & 0x8) !== 0
    // DOUBLE is bit 0x10, unreachable on 1.8 where metadata is 4 bits.
    out.double = (meta & 0x10) !== 0
    return out
  },

  'kitchen.KitchenCounterBlock': furnitureHorizontal,
  'kitchen.KitchenDrawerBlock': defaultHorizontal,
  'kitchen.KitchenSinkBlock': defaultHorizontal,
  'office.DeskBlock': furnitureHorizontal,
  'office.DeskCabinetBlock': furnitureHorizontal,
  'small.CoffeeTableBlock': furniture,
  'small.HedgeBlock': furniture,
  'small.BlindsBlock': (_e, meta, out) => {
    out.open = meta > 3
    if (meta > 3) meta -= 4
    out.facing = pick(DIRECTION, meta)
    return out
  },
  'multi.DivingBoardBlock': (_e, meta, out) => {
    out.part = pick(DIVING_BOARD_PART, meta > 3 ? 1 : 0)
    if (meta > 3) meta -= 4
    out.facing = pick(DIRECTION, meta)
    return out
  },
  'multi.FreezerBlock': defaultHorizontal,
  'multi.FridgeBlock': defaultHorizontal,

  'plants.LogBlock': (_e, meta, out) => {
    switch (meta & 0xC) {
      case 4: out.axis = 'x'; break
      case 8: out.axis = 'z'; break
      default: out.axis = 'y'; break
    }
    return out
  },
  'plants.NewLeaveBlock': (_e, meta, out) => {
    out.decayable = (meta & 0x1) === 1
    out.check_decay = ((meta >> 1) & 0x1) === 1
    return out
  },
  'plants.DoublePlantBlock': (_e, meta, out) => {
    out.half = (meta & 0x1) > 0 ? 'upper' : 'lower'
    return out
  },
  'plants.BushBlock': furniture,
  'plants.GrassBlock': furniture,
  'plants.LeavesBlock': furniture,
  'plants.PlantBlock': furniture,
  'plants.SaplingBlock': furniture,
  'plants.TallGrassBlock': furniture,
  'plants.PlantHorizontalBlock': defaultHorizontal,

  'special.BeaconBlock': furniture,
  'special.DragonEggBlock': furniture,
  'special.HopperBlock': furniture,
  'special.SpawnerBlock': furniture,
  'special.RedstoneLampBlock': (e, meta, out) => {
    furniture(e, meta, out)
    out.lit = (meta & 0x4) !== 0
    return out
  },
  'special.MiniStatueBlock': (_e, meta, out) => {
    out.rotation = meta
    return out
  },
  'special.PumpkinScarecrowBlock': partAndFacing(SCARECROW_PART, 7),
  'special.SnowWithTracesBlock': (e, meta, out) => {
    furnitureHorizontal(e, meta & 0x3, out)
    out.layer = 8
    out.trace = pick(TRACE, meta >> 2)
    return out
  }
}

alias('fence.PicketGateBlock', 'fence.UpgradedGateBlock')

// categories.* are thin subclasses, so they reuse whichever base they extend.
alias('categories.ParkBenchBlock', 'type.HorizontalExtensionBlock')
alias('categories.single.OreBlock', 'type.DefaultBlock')
alias('categories.single.PathBlock', 'type.DefaultBlock')

for (const name of [
  'BedsideCabinetBlock', 'BedsideTableBlock', 'CabinetBlock', 'ChairBlock', 'ChestBlock',
  'ConsoleBlock', 'CoolerBlock', 'CrateBlock', 'DrumsetBlock', 'FirewoodBlock',
  'MailBoxBlock', 'MoneyBagBlock'
]) alias(`categories.${name}`, 'type.DefaultHorizontalBlock')

for (const name of [
  'BirdsCageBlock', 'CerealsBlock', 'DoorMatBlock', 'FishBlock', 'FlamingoBlock',
  'GardengnomeBlock', 'GardenToolsBlock', 'GargoyleBlock', 'IngotBlock', 'IngotStacksBlock',
  'KnittersBlock', 'OvenBlock', 'PhoneBlock', 'PostBoxBlock', 'RadioBlock', 'RankenBlock',
  'RubberduckBlock', 'ScaleBlock', 'SecurityCamBlock', 'SkateboardBlock', 'TeapotBlock',
  'TrellisBlock', 'WallShelveBlock'
]) alias(`categories.single.${name}`, 'type.DefaultHorizontalBlock')

/** Point one class name at another class's decoder. */
function alias (from: string, to: string): void {
  const decoder = DECODERS[to]
  if (decoder) DECODERS[from] = decoder
}

/**
 * Classes whose full visual state depends on neighbouring blocks, not on metadata.
 *
 * These are exactly the classes whose `getActualState` reads the world, directly
 * or through a helper, counting inherited implementations. `ModBlock`'s base
 * version returns the state untouched, and overrides that only copy values
 * around (`AxisBlock`, `LitBlock`, `PipeBlock`, `StackedBlock`, `LogBlock`) do
 * not count.
 *
 * Walls and fences are deliberately absent. `WallBlock` declares
 * `WALL_HEIGHT_*` properties but nothing in the mod computes them from
 * neighbours, and the fence classes have no `getActualState` at all.
 */
export const NEIGHBOUR_DERIVED: ReadonlySet<string> = new Set([
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

/**
 * Decode the 4 metadata bits of a placed custom block into named properties.
 *
 * @param entry Registry entry for the block.
 * @param meta Low nibble of the 1.8 chunk block state, 0 to 15.
 * @returns The properties, which decoder ran, and whether neighbours are needed.
 */
export function decodeMeta (entry: BlockEntry, meta: number): DecodedMeta {
  const fn = DECODERS[entry.blockClass]
  const out: BlockProperties = {}
  if (entry.flags.waterlogged) out.waterlogged = false // stripped from legacy states
  if (fn) fn(entry, meta & 0xF, out)
  return {
    properties: out,
    decoder: fn ? entry.blockClass : null,
    derivedFromNeighbours: NEIGHBOUR_DERIVED.has(entry.blockClass)
  }
}
