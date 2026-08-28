/** Shapes of the generated registry file and of everything the decoders return. */

/** Flags mirrored from `ModBlock`/`FurnitureBlock.initBlockData`. */
export interface BlockFlags {
  /** Bit `0x4` of the metadata means "open". */
  openable: boolean
  /** Bit `0x4` of the metadata means "activated". */
  activatable: boolean
  waterlogged: boolean
  cutout: boolean
  redstone: boolean
  /** `-1` when the block has no random variants. */
  availableVariants: number
  /** `-1` when the block cannot be stacked vertically. */
  maxVerticalStack: number
  vanillaPlacementDirection: boolean
}

/** One entry of `customblocks/default_blocks.json`, with the numeric id resolved. */
export interface BlockEntry {
  /** Numeric id on the wire, `2500 + offset`. */
  id: number
  /** Id offset inside `default_blocks.json`. */
  offset: number
  /** Key without the namespace, for example `oak_chair`. */
  key: string
  /** Namespaced name, for example `cb:oak_chair`. */
  name: string
  /** Java class that owns `getStateFromMeta`, for example `categories.ChairBlock`. */
  blockClass: string
  versionBlockClass: string | null
  prettyName: string | null
  displayName: string
  itemGroup: string | null
  /**
   * Effective `ModBlock.getReplacement()`: the `replacement` from
   * `default_blocks.json`, or the class's `getFallbackReplacement()` when the
   * JSON has none. The mod copies hardness and material from this block.
   */
  replacement: string | null
  /** Same, mapped down to 1.8 as `name` or `name;damage`. */
  legacyReplacement: string | null
  /** True when `replacement` came from the class default rather than the JSON. */
  replacementFromClass: boolean
  material: string | null
  materialColor: string | null
  soundType: string | null
  /** Name of the `BlockProperties.Hardness` constant, used when there is no replacement. */
  hardness: string | null
  fullCube: boolean | null
  flags: BlockFlags
  data: Record<string, unknown>
}

/** One entry of `customblocks/default_items.json`, with the numeric id resolved. */
export interface ItemEntry {
  /** Numeric id on the wire, `2500 + highestBlockOffset + offset`. */
  id: number
  offset: number
  key: string
  name: string
  itemClass: string
  prettyName: string | null
  displayName: string
  replacement: string | null
  legacyReplacement: string | null
  /**
   * The `replacement.enchantments` object from `default_items.json`, passed
   * through as-is. Nothing in the client jar reads it, so what consumes it is
   * unknown. Empty for all 8 items in 1.0.5.
   */
  replacementEnchantments: Record<string, number>
  toolMaterialName: string | null
  attackDamage: number
  attackSpeed: number
  effectiveBlocks: string[]
}

export interface ItemGroup {
  id: number
  tag: string
  displayBlock: string
  prettyName: string
}

/** The whole of `data/cb-registry.json`. */
export interface RegistryFile {
  generatedFrom: string
  modId: string
  modVersion: string
  minecraftVersion: string
  /** `ModBlocks.CURRENT_PROTOCOL_VERSION`. */
  protocol: number
  pluginChannel: string
  idBase: number
  highestBlockOffset: number
  blockIdRange: [number, number]
  itemIdRange: [number, number]
  itemGroups: Record<string, ItemGroup>
  blocks: BlockEntry[]
  items: ItemEntry[]
  /** SHA-1 over blocks and items, so a consumer can detect a version mismatch. */
  hash: string
}

/** Named properties unpacked from the 4 metadata bits. */
export interface BlockProperties {
  facing?: string | null
  axis?: string | null
  half?: string | null
  hinge?: string | null
  part?: string | null
  type?: string | null
  layers?: string | null
  trace?: string | null
  open?: boolean
  activated?: boolean
  lit?: boolean
  powered?: boolean
  double?: boolean
  waterlogged?: boolean
  decayable?: boolean
  check_decay?: boolean
  layer?: number
  variant?: number
  rotation?: number
}

export interface DecodedMeta {
  properties: BlockProperties
  /** The class whose decoder ran, or `null` when there is none for this block. */
  decoder: string | null
  /** True when the visible shape also depends on the neighbouring blocks. */
  derivedFromNeighbours: boolean
}

export interface Position { x: number, y: number, z: number }

/** A placed custom block, decoded. */
export interface BlockDescription {
  id: number
  key: string
  stateId: number
  meta: number
  blockClass: string
  displayName: string
  prettyName: string | null
  itemGroup: string | null
  material: string | null
  soundType: string | null
  replacement: string | null
  legacyReplacement: string | null
  properties: BlockProperties
  derivedFromNeighbours: boolean
  decoder: string | null
  flags: BlockFlags
  data: Record<string, unknown>
  position?: Position
}

/** Everything a 1.8 `ItemStack` can carry in its NBT. */
export interface StackMetadata {
  customName: string | null
  lore: string[]
  enchantments: Enchantment[]
  storedEnchantments: Enchantment[]
  attributeModifiers: AttributeModifier[]
  unbreakable: boolean
  hideFlags: number
  repairCost: number
  canDestroy: string[]
  canPlaceOn: string[]
  skullOwner: unknown
}

export interface Enchantment {
  id: number
  name: string | null
  displayName: string | null
  lvl: number
}

export interface AttributeModifier {
  name: string
  attribute: string
  slot: string | null
  operation: number
  amount: number
}

/** A custom item stack, decoded. */
export interface ItemDescription {
  kind: 'item'
  id: number
  key: string
  damage: number
  count: number
  itemClass: string
  displayName: string
  prettyName: string | null
  replacement: string | null
  legacyReplacement: string | null
  toolMaterialName: string | null
  attackDamage: number
  attackSpeed: number
  effectiveBlocks: string[]
  nbt: Record<string, any> | null
  slot?: number
}

/** A custom block held as an item. Carries the block description alongside. */
export interface BlockItemDescription extends BlockDescription {
  kind: 'block-item'
  count: number
  damage: number
  nbt: Record<string, any> | null
  slot?: number
}

export type AnyItemDescription = ItemDescription | BlockItemDescription
