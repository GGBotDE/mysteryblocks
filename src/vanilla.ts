/**
 * Resolving a `replacement` string against a vanilla registry.
 *
 * `replacement` is the block the mod itself copies hardness and material from,
 * per `VersionBlock` and `BlockPropertiesConverter`. That is all it is known to
 * mean. The client jar never says what a server sends to clients that did not
 * complete the handshake, so do not read this as "what a vanilla client sees".
 */

/** The bits of a prismarine registry this module reads. Both optional. */
export interface VanillaLookup {
  itemsByName?: Record<string, { id: number } | undefined>
  blocksByName?: Record<string, { id: number } | undefined>
}

/** A `replacement` string resolved against a vanilla registry. */
export interface VanillaRef {
  /** Always namespaced, for example `minecraft:log`. */
  name: string
  /** `null` when no registry was given, or when the name is not in it. */
  id: number | null
  /** The damage from the `name;damage` form, or `null` when there was none. */
  damage: number | null
  /** The registry entry itself, so callers can copy hardness, drops and so on. */
  entry: any | null
}

/**
 * Split a `minecraft:name` or `minecraft:name;damage` replacement and look the
 * name up.
 *
 * @param prefer Which table wins when a name exists as both an item and a block.
 */
export function resolveVanillaRef (
  replacement: string | null | undefined,
  registry?: VanillaLookup | null,
  prefer: 'item' | 'block' = 'item'
): VanillaRef | null {
  if (!replacement) return null

  const [namePart, metaPart] = replacement.split(';')
  const name = (namePart ?? '').replace(/^minecraft:/, '')
  const damage = metaPart !== undefined ? parseInt(metaPart, 10) : null

  let entry: any = null
  if (registry) {
    const asItem = registry.itemsByName?.[name]
    const asBlock = registry.blocksByName?.[name]
    entry = (prefer === 'block' ? asBlock || asItem : asItem || asBlock) ?? null
  }

  return { name: `minecraft:${name}`, id: entry ? entry.id : null, damage, entry }
}
