/**
 * Stack NBT, which is where the interesting part of an item actually lives.
 *
 * None of this is MysteryBlocks specific. The server sends the same NBT whether
 * or not the connection completed the handshake, so what you read here is the
 * item's real server side data, not a downgraded copy.
 */

import type { AttributeModifier, Enchantment, StackMetadata } from './types'

/** The bits of a prismarine registry this module can use. All optional. */
export interface EnchantmentLookup {
  enchantments?: Record<number, { name?: string, displayName?: string }>
}

/**
 * Pull everything a 1.8 `ItemStack` can carry out of its NBT.
 *
 * @param nbt Plain NBT, as returned by {@link simplifyNbt}.
 * @param registry Anything with an `enchantments` table, used to name the
 *   enchantment ids. Pass `null` to get ids only.
 */
export function readStackMetadata (
  nbt: Record<string, any> | null | undefined,
  registry?: EnchantmentLookup | null
): StackMetadata {
  const out: StackMetadata = {
    customName: null,
    lore: [],
    enchantments: [],
    storedEnchantments: [],
    attributeModifiers: [],
    unbreakable: false,
    hideFlags: 0,
    repairCost: 0,
    canDestroy: [],
    canPlaceOn: [],
    skullOwner: null
  }
  if (!nbt) return out

  const display = nbt.display || {}
  if (typeof display.Name === 'string') out.customName = display.Name
  if (Array.isArray(display.Lore)) out.lore = display.Lore.slice()

  out.enchantments = readEnchantmentList(nbt.ench, registry)
  out.storedEnchantments = readEnchantmentList(nbt.StoredEnchantments, registry)

  if (Array.isArray(nbt.AttributeModifiers)) {
    out.attributeModifiers = nbt.AttributeModifiers.map((m: any): AttributeModifier => ({
      name: m.Name,
      attribute: m.AttributeName,
      slot: m.Slot || null,
      operation: m.Operation,
      amount: m.Amount
    }))
  }

  out.unbreakable = nbt.Unbreakable === 1 || nbt.Unbreakable === true
  out.hideFlags = nbt.HideFlags || 0
  out.repairCost = nbt.RepairCost || 0
  if (Array.isArray(nbt.CanDestroy)) out.canDestroy = nbt.CanDestroy.slice()
  if (Array.isArray(nbt.CanPlaceOn)) out.canPlaceOn = nbt.CanPlaceOn.slice()
  if (nbt.SkullOwner) out.skullOwner = nbt.SkullOwner

  return out
}

/** Read an `ench` or `StoredEnchantments` list, naming the ids where possible. */
export function readEnchantmentList (list: any, registry?: EnchantmentLookup | null): Enchantment[] {
  if (!Array.isArray(list)) return []
  return list.map((e: any): Enchantment => {
    const id = typeof e.id === 'number' ? e.id : parseInt(e.id, 10)
    const entry = registry?.enchantments ? registry.enchantments[id] : null
    return {
      id,
      name: entry?.name ?? null,
      displayName: entry?.displayName ?? null,
      lvl: typeof e.lvl === 'number' ? e.lvl : parseInt(e.lvl, 10)
    }
  })
}

/**
 * Flatten prismarine-nbt's tagged form into plain JavaScript.
 *
 * Longs come back as decimal strings, since they do not survive a `number`.
 */
export function simplifyNbt (tag: any): any {
  if (tag === null || tag === undefined) return null
  if (Array.isArray(tag)) return tag.map(simplifyNbt)
  if (typeof tag !== 'object') return tag

  if (tag.type !== undefined && tag.value !== undefined) {
    if (tag.type === 'compound') return simplifyNbt(tag.value)
    if (tag.type === 'list') return simplifyNbt(tag.value.value !== undefined ? tag.value.value : tag.value)
    if (tag.type === 'long' && Array.isArray(tag.value)) {
      return ((BigInt(tag.value[0] >>> 0) << 32n) | BigInt(tag.value[1] >>> 0)).toString()
    }
    return simplifyNbt(tag.value)
  }

  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(tag)) out[k] = simplifyNbt(v)
  return out
}
