/**
 * The mineflayer adapter.
 *
 * This is one way to use the library, not the library itself. Everything it
 * does is built out of the core modules: it answers the handshake with
 * {@link handshake}, patches the bot's registry with {@link patchRegistry}, and
 * decodes what arrives with {@link CustomBlockRegistry}.
 *
 * ```ts
 * import mineflayer from 'mineflayer'
 * import cbPlugin from 'mysteryblocks/mineflayer'
 *
 * const bot = mineflayer.createBot({ host: 'example.net', version: '1.8.9' })
 * bot.loadPlugin(cbPlugin)
 * ```
 */

import { Vec3 } from 'vec3'
import { handshakeReply, isHandshakeRequest, REPLY_CHANNEL } from './handshake'
import { readStackMetadata, simplifyNbt } from './nbt'
import { patchRegistry } from './prismarine'
import { loadRegistry, type CustomBlockRegistry } from './registry'
import type { AnyItemDescription, BlockDescription, Position, StackMetadata } from './types'

export interface CbOptions {
  /** Answer the server's `StartHandshake`. Set `false` to receive whatever the server sends clients that stay quiet. */
  handshake?: boolean
  /** Register `cb:` ids with prismarine-block and prismarine-item. */
  patchRegistry?: boolean
  /** Log the handshake and the registry range. */
  verbose?: boolean
  /** Use a registry you generated yourself instead of the bundled one. */
  registry?: CustomBlockRegistry
}

export interface CbState {
  handshakeSent: boolean
  serverSupportsCustomBlocks: boolean
  protocol: number
}

/** Options for {@link CbApi.findBlocks}. */
export interface FindOptions {
  /** Centre of the search. Defaults to the bot's position. */
  point?: Vec3
  maxDistance?: number
  count?: number
  /** A `cb:` key, a list of keys, or a predicate on the description. */
  match?: string | string[] | ((desc: any) => boolean) | null
}

/** A block description with the prismarine Block attached, non-enumerably. */
export interface BotBlockDescription extends BlockDescription {
  position: Position
  /** prismarine `Block` for the `cb:` block. Skipped by `JSON.stringify`. */
  readonly block: any
}

/** An item description with its stack NBT parsed out and the prismarine Item attached. */
export type BotItemDescription = AnyItemDescription & StackMetadata & {
  slot?: number
  /** The tagged NBT, before flattening. Skipped by `JSON.stringify`. */
  readonly rawNbt: any
  /** prismarine `Item` as received. Skipped by `JSON.stringify`. */
  readonly item: any
}

/**
 * `entity.equipment` index to a readable name, in 1.8 order.
 *
 * The `entity_equipment` packet carries this index directly, and mineflayer
 * stores it unchanged, so index 0 is the held item and 1 to 4 go up the body.
 */
export const EQUIPMENT_SLOTS = ['hand', 'boots', 'leggings', 'chestplate', 'helmet']

/** A custom item seen on another entity. */
export interface EntityItem {
  entityId: number
  /** Player name when the entity is a player, otherwise `null`. */
  username: string | null
  entityType: string | null
  /** One of {@link EQUIPMENT_SLOTS}. */
  slot: string
  position: Position | null
  /** Blocks from the bot, or `null` when the entity has no position yet. */
  distance: number | null
  item: BotItemDescription
}

/** What the plugin hangs off `bot.cb`. */
export interface CbApi {
  registry: CustomBlockRegistry
  state: CbState
  protocol: number
  isCustomBlock (block: any): boolean
  isCustomItem (item: any): boolean
  blockAt (pos: Vec3 | Position): BotBlockDescription | null
  describeBlock (id: number, meta: number): BlockDescription | null
  describeState (stateId: number): BlockDescription | null
  describeItem (item: any): BotItemDescription | null
  inventory (window?: any): BotItemDescription[]
  findBlocks (options?: FindOptions): BotBlockDescription[]
  scanLoadedChunks (options?: { match?: FindOptions['match'], count?: number }): BlockDescription[]
  heldItem (entity: any): BotItemDescription | null
  equipment (entity: any): EntityItem[]
  nearbyItems (options?: { maxDistance?: number, match?: FindOptions['match'] }): EntityItem[]
}

/**
 * Load with `bot.loadPlugin(cbPlugin)`.
 *
 * Reads only. It answers the handshake, teaches the registry about the `cb:` id
 * space, and exposes `bot.cb`. It opens no sockets and sends nothing anywhere.
 *
 * Options go in under `cb` on the `createBot` call:
 * `mineflayer.createBot({ ..., cb: { verbose: true } })`.
 */
export function cbPlugin (bot: any, options: { cb?: CbOptions } = {}): void {
  const opts: Required<Omit<CbOptions, 'registry'>> & { registry?: CustomBlockRegistry } = {
    handshake: true,
    patchRegistry: true,
    verbose: false,
    ...(options.cb || {})
  }
  const cb = opts.registry ?? loadRegistry()

  const state: CbState = {
    handshakeSent: false,
    serverSupportsCustomBlocks: false,
    protocol: cb.protocol
  }

  const api: CbApi = {
    registry: cb,
    state,
    protocol: cb.protocol,
    isCustomBlock: block => !!block && cb.isBlockId(block.type),
    isCustomItem: item => !!item && cb.isItemId(item.type),
    blockAt,
    describeBlock: (id, meta) => cb.describeBlock(id, meta),
    describeState: stateId => cb.describeState(stateId),
    describeItem,
    inventory,
    findBlocks,
    scanLoadedChunks,
    heldItem,
    equipment,
    nearbyItems
  }
  bot.cb = api

  // mineflayer runs plugins from inside its own 'inject_allowed' emit, so a
  // listener registered here would never fire for that emit. Patch right away;
  // bot.registry is already populated by the time plugins are injected.
  if (opts.patchRegistry) {
    if (bot.registry) patchRegistry(bot.registry, cb)
    else bot.once('inject_allowed', () => patchRegistry(bot.registry, cb))
  }

  // Deliberately raw: client.registerChannel() would let node-minecraft-protocol
  // re-parse packet.data in place, and we need the untouched PacketBuffer.
  if (opts.handshake) {
    bot._client.on('custom_payload', (packet: { channel: string, data: Buffer }) => {
      if (!isHandshakeRequest(packet.channel, packet.data)) return

      state.serverSupportsCustomBlocks = true
      bot._client.write('custom_payload', {
        channel: REPLY_CHANNEL,
        data: handshakeReply(cb.protocol)
      })
      state.handshakeSent = true
      if (opts.verbose) console.log(`[cb] handshake -> {"protocol":${cb.protocol}}`)
      bot.emit('cb_handshake', { protocol: cb.protocol, channel: packet.channel })
    })
  }

  /**
   * Like `bot.blockAt()`, but returns the full custom block description, or
   * `null` when the position does not hold one.
   */
  function blockAt (pos: Vec3 | Position): BotBlockDescription | null {
    const p = pos instanceof Vec3 ? pos.floored() : new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z))
    const stateId = bot.world.getBlockStateId(p)
    if (!stateId) return null
    const desc = cb.describeState(stateId) as BotBlockDescription | null
    if (!desc) return null
    desc.position = { x: p.x, y: p.y, z: p.z }

    hide(desc, 'block', () => bot.blockAt(p))
    return desc
  }

  /**
   * Describe a prismarine `Item` that came out of a window or inventory.
   *
   * The custom id and the stack NBT arrive in the same Slot packet, so this
   * returns the `cb:` identity together with everything the stack's NBT holds:
   * display name, lore, enchantments, attribute modifiers and the raw tag.
   *
   * All of that is the NBT of the stack this connection received. It is not a
   * reconstruction of anything another client would see.
   */
  function describeItem (item: any): BotItemDescription | null {
    if (!item) return null
    const nbt = item.nbt ? simplifyNbt(item.nbt) : null
    const base = cb.describeItem(item.type, item.metadata, item.count, nbt)
    if (!base) return null

    const desc = Object.assign(base, readStackMetadata(nbt, bot.registry), {
      slot: item.slot
    }) as BotItemDescription

    hide(desc, 'rawNbt', () => item.nbt || null)
    hide(desc, 'item', () => item)
    return desc
  }

  /** Every custom item in the bot's inventory, or in a given window. */
  function inventory (window: any = bot.inventory): BotItemDescription[] {
    if (!window) return []
    const out: BotItemDescription[] = []
    window.slots.forEach((item: any, slot: number) => {
      if (!item || !cb.isItemId(item.type)) return
      const desc = describeItem(item)
      if (!desc) return
      desc.slot = slot
      out.push(desc)
    })
    return out
  }

  /**
   * The custom item another entity is holding, or `null` when it holds nothing
   * custom.
   *
   * Held items arrive in `entity_equipment`, which the server sends for entities
   * in range, so this works on other players without any inventory access.
   */
  function heldItem (entity: any): BotItemDescription | null {
    const item = entity?.heldItem
    if (!item || !cb.isItemId(item.type)) return null
    return describeItem(item)
  }

  /** Every custom item an entity has equipped, held item included. */
  function equipment (entity: any): EntityItem[] {
    if (!entity?.equipment) return []
    const out: EntityItem[] = []

    entity.equipment.forEach((item: any, index: number) => {
      if (!item || !cb.isItemId(item.type)) return
      const desc = describeItem(item)
      if (!desc) return
      const position = entity.position ? { x: entity.position.x, y: entity.position.y, z: entity.position.z } : null
      out.push({
        entityId: entity.id,
        username: entity.username ?? null,
        entityType: entity.name ?? null,
        slot: EQUIPMENT_SLOTS[index] ?? String(index),
        position,
        distance: entity.position && bot.entity ? bot.entity.position.distanceTo(entity.position) : null,
        item: desc
      })
    })
    return out
  }

  /**
   * Every custom item equipped by an entity the bot can see.
   *
   * Only what the server chose to send: entities in range, and only their
   * equipment. It never includes anything from another player's inventory,
   * which the server does not send at all.
   */
  function nearbyItems (o: { maxDistance?: number, match?: FindOptions['match'] } = {}): EntityItem[] {
    const maxDistance = o.maxDistance ?? 32
    const match = buildMatcher(o.match)
    const out: EntityItem[] = []

    for (const entity of Object.values(bot.entities) as any[]) {
      if (entity === bot.entity) continue
      for (const found of equipment(entity)) {
        if (found.distance !== null && found.distance > maxDistance) continue
        if (!match(found.item)) continue
        out.push(found)
      }
    }
    return out.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
  }

  /** Search a cube around a point for custom blocks. */
  function findBlocks (o: FindOptions = {}): BotBlockDescription[] {
    const point = o.point || bot.entity.position
    const maxDistance = o.maxDistance || 32
    const count = o.count || 64
    const match = buildMatcher(o.match)

    const found: BotBlockDescription[] = []
    const cursor = new Vec3(0, 0, 0)
    const min = point.floored().offset(-maxDistance, -maxDistance, -maxDistance)
    const max = point.floored().offset(maxDistance, maxDistance, maxDistance)

    for (cursor.y = Math.max(0, min.y); cursor.y <= Math.min(255, max.y); cursor.y++) {
      for (cursor.x = min.x; cursor.x <= max.x; cursor.x++) {
        for (cursor.z = min.z; cursor.z <= max.z; cursor.z++) {
          const desc = blockAt(cursor)
          if (!desc || !match(desc)) continue
          found.push(desc)
          if (found.length >= count) return found
        }
      }
    }
    return found
  }

  /** Walk every loaded chunk column and collect the custom blocks in it. */
  function scanLoadedChunks (o: { match?: FindOptions['match'], count?: number } = {}): BlockDescription[] {
    const match = buildMatcher(o.match)
    const limit = o.count || Infinity
    const out: BlockDescription[] = []
    const cursor = new Vec3(0, 0, 0)

    for (const { chunkX, chunkZ, column } of bot.world.getColumns()) {
      const baseX = parseInt(chunkX, 10) * 16
      const baseZ = parseInt(chunkZ, 10) * 16
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 16; x++) {
          for (let z = 0; z < 16; z++) {
            cursor.x = x; cursor.y = y; cursor.z = z
            const stateId = column.getBlockStateId(cursor)
            if (stateId >> 4 < cb.blockIdRange[0]) continue
            const desc = cb.describeState(stateId)
            if (!desc || !match(desc)) continue
            desc.position = { x: baseX + x, y, z: baseZ + z }
            out.push(desc)
            if (out.length >= limit) return out
          }
        }
      }
    }
    return out
  }

  if (opts.verbose) {
    bot.once('spawn', () => {
      console.log(`[cb] registry ${cb.hash.slice(0, 8)}, blocks ${cb.blockIdRange.join('..')}, items ${cb.itemIdRange.join('..')}`)
    })
  }
}

function buildMatcher (match: FindOptions['match']): (desc: { key: string }) => boolean {
  if (!match) return () => true
  if (typeof match === 'function') return match
  const names = new Set(([] as string[]).concat(match).map(n => (n.startsWith('cb:') ? n : `cb:${n}`)))
  return desc => names.has(desc.key)
}

/** Define a lazily computed property that `JSON.stringify` will skip. */
function hide (target: object, key: string, compute: () => unknown): void {
  let cached: unknown
  let done = false
  Object.defineProperty(target, key, {
    enumerable: false,
    configurable: true,
    get () {
      if (!done) {
        try {
          cached = compute()
        } catch {
          cached = null
        }
        done = true
      }
      return cached
    }
  })
}

export default cbPlugin
