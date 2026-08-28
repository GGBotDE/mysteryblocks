/**
 * End to end against a real 1.8.9 protocol server.
 *
 * A mineflayer bot connects to the fake server in `fake-server.ts`, answers the
 * handshake, and receives a chunk and inventory containing `cb:` blocks and
 * items. Everything below reads what actually came off the wire.
 */

import mineflayer, { type Bot } from 'mineflayer'
import prismarineBlock from 'prismarine-block'
import { Vec3 } from 'vec3'
import WebSocket from 'ws'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadRegistry } from '../src'
import cbPlugin from '../src/mineflayer'
import { createBridge } from '../examples/bridge/bridge'
import { CHAIR, CHAIR_POS, OTHER_PLAYER, PICKAXE, TABLE_POS, VERSION, startFakeServer, type FakeServer } from './fake-server'

const PORT = 25789
const WS_PORT = 25799
const TCP_PORT = 25800

const cb = loadRegistry()
const Block = prismarineBlock(VERSION)

let server: FakeServer
let bot: Bot & { cb: any }
let bridge: ReturnType<typeof createBridge>
let socket: WebSocket
const received: any[] = []

/** Resolve once `predicate` holds, or reject after `timeout`. */
function waitFor (predicate: () => boolean, timeout = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = (): void => {
      if (predicate()) return resolve()
      if (Date.now() - start > timeout) return reject(new Error('timed out waiting for condition'))
      setTimeout(tick, 20)
    }
    tick()
  })
}

/** Send a request over the WebSocket and wait for the frame it produces. */
async function request (message: object, kind: string): Promise<any> {
  const before = received.filter(m => m.kind === kind).length
  socket.send(JSON.stringify(message))
  await waitFor(() => received.filter(m => m.kind === kind).length > before)
  return received.filter(m => m.kind === kind).pop()
}

beforeAll(async () => {
  server = await startFakeServer(PORT)

  bot = mineflayer.createBot({
    host: '127.0.0.1',
    port: PORT,
    username: 'CbTestBot',
    version: VERSION,
    auth: 'offline',
    hideErrors: false
  }) as Bot & { cb: any }

  bot.loadPlugin(cbPlugin as any)
  bridge = createBridge(bot, { port: WS_PORT, tcpPort: TCP_PORT, autoBroadcastBlockUpdates: true })

  await new Promise<void>((resolve, reject) => {
    bot.once('spawn', () => resolve())
    bot.once('error', reject)
  })

  socket = new WebSocket(`ws://127.0.0.1:${WS_PORT}`)
  socket.on('message', raw => received.push(JSON.parse(raw.toString())))
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve())
    socket.once('error', reject)
  })

  // The chunk, both set_slot packets and the other player land after spawn.
  await waitFor(() => bot.inventory.slots[36] != null && bot.blockAt(CHAIR_POS) != null)
  await waitFor(() => bot.entities[OTHER_PLAYER.entityId]?.heldItem != null)
  await waitFor(() => received.some(m => m.kind === 'hello'))
})

afterAll(() => {
  socket?.close()
  bridge?.close()
  bot?.end()
  server?.close()
})

describe('handshake', () => {
  it('answers StartHandshake with the protocol json', () => {
    expect(server.handshakeReply).toBe('{"protocol":5}')
  })

  it('records that the server supports custom blocks', () => {
    expect(bot.cb.state).toMatchObject({ serverSupportsCustomBlocks: true, handshakeSent: true })
  })
})

describe('blocks from a real chunk packet', () => {
  it('resolves the custom name through the patched registry', () => {
    expect(bot.blockAt(CHAIR_POS)).toMatchObject({ name: 'cb:oak_chair', type: CHAIR.id, metadata: 3 })
  })

  it('decodes the metadata into properties', () => {
    const desc = bot.cb.blockAt(CHAIR_POS)
    expect(desc).toMatchObject({
      key: 'cb:oak_chair',
      displayName: 'Eichenholzstuhl', // en_us.json is actually German
      replacement: 'minecraft:oak_stairs',
      position: { x: 8, y: 2, z: 8 }
    })
    expect(desc.properties.facing).toBe('east')
  })

  it('flags a neighbour-derived block as such', () => {
    expect(bot.cb.blockAt(TABLE_POS)).toMatchObject({ key: 'cb:oak_table', derivedFromNeighbours: true })
  })

  it('returns null for vanilla blocks', () => {
    expect(bot.cb.blockAt(new Vec3(0, 1, 0))).toBeNull()
    expect(bot.blockAt(new Vec3(0, 1, 0))!.name).toBe('grass')
  })

  it('finds both custom blocks nearby', () => {
    const keys = bot.cb.findBlocks({ maxDistance: 8, count: 16 }).map((f: any) => f.key).sort()
    expect(keys).toEqual(['cb:oak_chair', 'cb:oak_table'])
  })

  it('filters findBlocks by key', () => {
    const found = bot.cb.findBlocks({ maxDistance: 8, match: 'oak_chair' })
    expect(found).toHaveLength(1)
    expect(found[0].key).toBe('cb:oak_chair')
  })

  it('walks the whole column in scanLoadedChunks', () => {
    expect(bot.cb.scanLoadedChunks()).toHaveLength(2)
  })
})

describe('items from a real set_slot packet', () => {
  it('decodes the custom tool with its server-side rename', () => {
    const pick = bot.cb.inventory().find((i: any) => i.key === 'cb:pickaxe_rgb')
    expect(pick).toBeTruthy()
    expect(pick).toMatchObject({
      kind: 'item',
      slot: 36,
      itemClass: 'type.PickaxeItem',
      replacement: 'minecraft:diamond_pickaxe',
      attackDamage: 10.5,
      customName: '§bBaba Spitzhacke',
      lore: ['§7Nur für Tests', '§7Zweite Zeile'],
      unbreakable: true,
      repairCost: 7
    })
    expect(pick.enchantments).toEqual([{ id: 32, name: 'efficiency', displayName: 'Efficiency', lvl: 5 }])
  })

  it('keeps the raw NBT alongside the parsed fields', () => {
    const pick = bot.cb.inventory().find((i: any) => i.key === 'cb:pickaxe_rgb')
    expect(pick.nbt.display.Name).toBe('§bBaba Spitzhacke')
    expect(pick.nbt.RepairCost).toBe(7)
  })

  it('decodes a custom block held as an item as block-item', () => {
    const chairs = bot.cb.inventory().find((i: any) => i.key === 'cb:oak_chair')
    expect(chairs).toMatchObject({ kind: 'block-item', count: 12, slot: 37 })
  })

  it('lets mineflayer itself see the custom item name', () => {
    expect(bot.inventory.slots[36]!.name).toBe('cb:pickaxe_rgb')
  })
})

describe('items on other entities', () => {
  it('reads the custom item another player is holding', () => {
    const other = bot.entities[OTHER_PLAYER.entityId]
    const held = bot.cb.heldItem(other)
    expect(held).toMatchObject({ kind: 'item', key: 'cb:pickaxe_rgb', count: 1 })
  })

  it('resolves the name through the patched registry without any helper', () => {
    // This is what makes it work at all: entity_equipment goes through the same
    // prismarine-item path as the bot's own inventory.
    expect(bot.entities[OTHER_PLAYER.entityId]!.heldItem!.name).toBe('cb:pickaxe_rgb')
  })

  it('lists every equipped custom item with its slot', () => {
    const found = bot.cb.equipment(bot.entities[OTHER_PLAYER.entityId])
    expect(found.map((f: any) => f.slot).sort()).toEqual(['hand', 'helmet'])

    const hand = found.find((f: any) => f.slot === 'hand')!
    expect(hand).toMatchObject({ entityId: OTHER_PLAYER.entityId, username: OTHER_PLAYER.username })
    expect(hand.item.key).toBe('cb:pickaxe_rgb')
    expect(hand.distance).toBeCloseTo(OTHER_PLAYER.position.distanceTo(bot.entity.position), 5)

    // A custom block worn as a helmet still decodes as a block-item.
    expect(found.find((f: any) => f.slot === 'helmet')!.item).toMatchObject({
      kind: 'block-item',
      key: 'cb:oak_chair'
    })
  })

  it('finds those items through nearbyItems', () => {
    const found = bot.cb.nearbyItems({ maxDistance: 16 })
    expect(found.map((f: any) => f.item.key).sort()).toEqual(['cb:oak_chair', 'cb:pickaxe_rgb'])
    expect(found.every((f: any) => f.entityId === OTHER_PLAYER.entityId)).toBe(true)
  })

  it('filters nearbyItems by key', () => {
    const found = bot.cb.nearbyItems({ maxDistance: 16, match: 'pickaxe_rgb' })
    expect(found).toHaveLength(1)
    expect(found[0].item.key).toBe('cb:pickaxe_rgb')
  })

  it('respects maxDistance', () => {
    expect(bot.cb.nearbyItems({ maxDistance: 1 })).toEqual([])
  })

  it('works on the bot itself, which mineflayer equips from its own inventory', () => {
    expect(bot.cb.heldItem(bot.entity)).toMatchObject({ key: 'cb:pickaxe_rgb' })
  })

  it('returns nothing for an entity with no custom equipment', () => {
    expect(bot.cb.heldItem({ equipment: [null, null, null, null, null] })).toBeNull()
    expect(bot.cb.equipment(undefined)).toEqual([])
    expect(bot.cb.heldItem(null)).toBeNull()
  })
})

describe('prismarine compatibility', () => {
  it('behaves like a normal prismarine Block', () => {
    const block = bot.blockAt(CHAIR_POS)!
    // Hardness and material come from the replacement, as VersionBlock does.
    expect(block).toMatchObject({ hardness: 2, material: 'wood', boundingBox: 'block' })
    expect(block.shapes.length).toBeGreaterThan(0)
    expect(block.shapes).toEqual((bot.registry as any).blocksByName.oak_stairs.shapes)
    // Dig time matches the replacement exactly, which is what the server uses.
    expect(bot.digTime(block)).toBe(bot.digTime(Block.fromStateId(53 << 4, 0)))
    expect(bot.digTime(block)).toBeGreaterThan(0)
  })

  it('exposes the prismarine Block on a description', () => {
    const desc = bot.cb.blockAt(CHAIR_POS)
    expect(desc.block).toMatchObject({ name: 'cb:oak_chair', type: CHAIR.id })
    expect(desc.block.position.x).toBe(8)
  })

  it('behaves like a normal prismarine Item', () => {
    const item = bot.inventory.slots[36]! as any
    expect(item).toMatchObject({ name: 'cb:pickaxe_rgb', stackSize: 1, maxDurability: 1561 })
    // prismarine's own NBT getters work on the stack as received.
    expect(item.customName).toBe('§bBaba Spitzhacke')
    expect(item.customLore).toEqual(['§7Nur für Tests', '§7Zweite Zeile'])
    expect(item.enchants).toEqual([{ name: 'efficiency', lvl: 5 }])
  })

  it('keeps descriptions JSON-serialisable', () => {
    const desc = bot.cb.inventory().find((i: any) => i.key === 'cb:pickaxe_rgb')
    expect(desc.item.name).toBe('cb:pickaxe_rgb')

    const round = JSON.parse(JSON.stringify(desc))
    for (const hidden of ['item', 'rawNbt']) expect(round[hidden]).toBeUndefined()
    expect(round.customName).toBe('§bBaba Spitzhacke')
    expect(round.replacement).toBe('minecraft:diamond_pickaxe')
  })

})

describe('bridge transport', () => {
  it('sends a hello frame describing the registry', () => {
    const hello = received.find(m => m.kind === 'hello')
    expect(hello).toMatchObject({ v: 1, cbProtocol: 5, registryHash: cb.hash, blockIdRange: [2500, 3327] })
  })

  it('carries id, meta and properties on a block frame', async () => {
    const before = received.filter(m => m.kind === 'block').length
    bridge.sendBlock(bot.cb.blockAt(CHAIR_POS))
    await waitFor(() => received.filter(m => m.kind === 'block').length > before)

    const frame = received.filter(m => m.kind === 'block').pop()
    expect(frame.block).toMatchObject({ id: CHAIR.id, meta: 3, key: 'cb:oak_chair' })
    expect(frame.block.properties.facing).toBe('east')
    // The numeric id is the handle the receiving mod looks up.
    expect(frame.block.id).toBeGreaterThanOrEqual(2500)
    expect(frame.block.id).toBeLessThanOrEqual(3327)
  })

  it('answers a scan request with a snapshot frame', async () => {
    const snap = await request({ kind: 'scan', radius: 8, limit: 32 }, 'snapshot')
    expect(snap.count).toBe(2)
    expect(snap.blocks.every((b: any) => b.key.startsWith('cb:'))).toBe(true)
  })

  it('answers an inventory request', async () => {
    const inv = await request({ kind: 'get_inventory' }, 'inventory')
    expect(inv.items).toHaveLength(2)
  })

  it('answers a get_entity_items request', async () => {
    const frame = await request({ kind: 'get_entity_items', radius: 32 }, 'entity_items')
    expect(frame.count).toBe(2)
    expect(frame.items.map((i: any) => i.slot).sort()).toEqual(['hand', 'helmet'])
    expect(frame.items[0].username).toBe(OTHER_PLAYER.username)
    expect(frame.items.map((i: any) => i.item.key).sort()).toEqual(['cb:oak_chair', 'cb:pickaxe_rgb'])
  })

  it('answers an unknown request with an error frame', async () => {
    const err = await request({ kind: 'nonsense' }, 'error')
    expect(err.error).toContain('nonsense')
  })
})

describe('tcp line-json transport (what the Forge mod uses)', () => {
  const frames: any[] = []
  let tcp: import('net').Socket

  beforeAll(async () => {
    const net = await import('net')
    tcp = net.connect(TCP_PORT, '127.0.0.1')
    tcp.setEncoding('utf8')

    let buffer = ''
    tcp.on('data', chunk => {
      buffer += chunk
      let i: number
      while ((i = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, i)
        buffer = buffer.slice(i + 1)
        if (line.trim()) frames.push(JSON.parse(line))
      }
    })

    await new Promise<void>((resolve, reject) => {
      tcp.once('connect', () => resolve())
      tcp.once('error', reject)
    })
    await waitFor(() => frames.some(f => f.kind === 'hello'))
  })

  afterAll(() => tcp?.end())

  it('receives the hello frame', () => {
    expect(frames.find(f => f.kind === 'hello').registryHash).toBe(cb.hash)
  })

  it('can request a single block and gets it back', async () => {
    tcp.write(JSON.stringify({ kind: 'get_block', x: 8, y: 2, z: 8 }) + '\n')
    await waitFor(() => frames.some(f => f.kind === 'block'))

    const frame = frames.filter(f => f.kind === 'block').pop()
    expect(frame.block).toMatchObject({ key: 'cb:oak_chair', id: CHAIR.id, meta: 3 })
    expect(frame.block.properties.facing).toBe('east')
  })

  it('sends every frame as one line of valid JSON', () => {
    expect(frames.length).toBeGreaterThanOrEqual(2)
    expect(frames.every(f => typeof f.kind === 'string' && f.v === 1)).toBe(true)
  })

  it('resolves the pickaxe id the receiver mod would look up', () => {
    expect(PICKAXE.id).toBe(3328)
    expect(cb.item(PICKAXE.id)!.name).toBe('cb:pickaxe_rgb')
  })
})
