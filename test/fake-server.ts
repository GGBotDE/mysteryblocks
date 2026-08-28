/**
 * A fake 1.8.9 server that behaves like a MysteryMod partner server.
 *
 * It asks for the `MM|CustomBlocks` handshake, sends a chunk containing `cb:`
 * blocks, and puts a custom item and a custom block stack in the inventory. The
 * end to end suite connects a real mineflayer bot to it.
 */

import mc from 'minecraft-protocol'
import prismarineChunk from 'prismarine-chunk'
import { Vec3 } from 'vec3'
import { loadRegistry, readMcString, writeMcString } from '../src'

export const VERSION = '1.8.9'

const cb = loadRegistry()

export const CHAIR = cb.block('cb:oak_chair')! // categories.ChairBlock, facing only
export const TABLE = cb.block('cb:oak_table')! // type.InfiniteExtensionBlock, neighbour-derived
export const PICKAXE = cb.item('cb:pickaxe_rgb')!

/** Where the chair sits in the test world. */
export const CHAIR_POS = new Vec3(8, 2, 8)
export const TABLE_POS = new Vec3(9, 2, 8)

/** Another player standing nearby, holding a custom item. */
export const OTHER_PLAYER = {
  entityId: 42,
  uuid: '00000000-0000-4000-8000-0000000000ff',
  username: 'CbNeighbour',
  position: new Vec3(11, 3, 8)
}

export interface FakeServer {
  close (): void
  /** What the bot replied on the handshake channel, once it has replied. */
  readonly handshakeReply: string | null
}

function buildChunk (): any {
  const Chunk = prismarineChunk(VERSION) as any
  const chunk = new Chunk()
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      chunk.setBlockStateId(new Vec3(x, 0, z), 7 << 4) // bedrock floor
      chunk.setBlockStateId(new Vec3(x, 1, z), 2 << 4) // grass
      chunk.setSkyLight(new Vec3(x, 2, z), 15)
    }
  }
  chunk.setBlockStateId(CHAIR_POS, (CHAIR.id << 4) | 3) // facing east
  chunk.setBlockStateId(TABLE_POS, TABLE.id << 4)
  return chunk
}

/** Start the server and resolve once it is accepting connections. */
export function startFakeServer (port: number): Promise<FakeServer> {
  const state = { handshakeReply: null as string | null }

  const server = mc.createServer({
    'online-mode': false,
    version: VERSION,
    port,
    maxPlayers: 1,
    motd: 'cb test'
  })

  server.on('login', client => {
    const chunk = buildChunk()

    client.write('login', {
      entityId: 1,
      levelType: 'default',
      gameMode: 0, // survival, so digTime is meaningful
      dimension: 0,
      difficulty: 0,
      maxPlayers: 1,
      reducedDebugInfo: false
    })

    // The server asks every joining client whether it speaks MysteryBlocks.
    client.write('custom_payload', { channel: 'MM|CustomBlocks', data: writeMcString('StartHandshake') })

    client.on('custom_payload', (packet: { channel: string, data: Buffer }) => {
      if (packet.channel !== 'MM|CustomBlocks') return
      state.handshakeReply = readMcString(packet.data)
    })

    client.write('map_chunk', { x: 0, z: 0, groundUp: true, bitMap: 0xffff, chunkData: chunk.dump() })
    client.write('position', { x: 8.5, y: 3, z: 8.5, yaw: 0, pitch: 0, flags: 0x00 })

    // mineflayer only emits 'spawn' once it has seen a positive update_health.
    client.write('update_health', { health: 20, food: 20, foodSaturation: 5 })

    // A custom tool in hotbar slot 0 (window slot 36), renamed by the server.
    client.write('set_slot', {
      windowId: 0,
      slot: 36,
      item: {
        blockId: PICKAXE.id,
        itemCount: 1,
        itemDamage: 0,
        nbtData: {
          type: 'compound',
          name: '',
          value: {
            display: {
              type: 'compound',
              value: {
                Name: { type: 'string', value: '§bBaba Spitzhacke' },
                Lore: { type: 'list', value: { type: 'string', value: ['§7Nur für Tests', '§7Zweite Zeile'] } }
              }
            },
            ench: {
              type: 'list',
              value: {
                type: 'compound',
                value: [{ id: { type: 'short', value: 32 }, lvl: { type: 'short', value: 5 } }]
              }
            },
            Unbreakable: { type: 'byte', value: 1 },
            RepairCost: { type: 'int', value: 7 }
          }
        }
      }
    })

    // A stack of custom chairs in slot 37, a custom block held as an ItemBlock.
    client.write('set_slot', {
      windowId: 0,
      slot: 37,
      item: { blockId: CHAIR.id, itemCount: 12, itemDamage: 0, nbtData: undefined }
    })

    // Another player nearby. mineflayer ignores named_entity_spawn unless it has
    // seen the uuid in player_info first, so send that too.
    client.write('player_info', {
      action: 'add_player',
      data: [{
        uuid: OTHER_PLAYER.uuid,
        name: OTHER_PLAYER.username,
        properties: [],
        gamemode: 0,
        ping: 30
      }]
    })

    client.write('named_entity_spawn', {
      entityId: OTHER_PLAYER.entityId,
      playerUUID: OTHER_PLAYER.uuid,
      x: Math.floor(OTHER_PLAYER.position.x * 32),
      y: Math.floor(OTHER_PLAYER.position.y * 32),
      z: Math.floor(OTHER_PLAYER.position.z * 32),
      yaw: 0,
      pitch: 0,
      currentItem: 0,
      metadata: []
    })

    // What that player is holding, and a custom block worn on the head. This is
    // the only equipment path the server offers for other players.
    client.write('entity_equipment', {
      entityId: OTHER_PLAYER.entityId,
      slot: 0, // hand
      item: { blockId: PICKAXE.id, itemCount: 1, itemDamage: 0, nbtData: undefined }
    })
    client.write('entity_equipment', {
      entityId: OTHER_PLAYER.entityId,
      slot: 4, // helmet
      item: { blockId: CHAIR.id, itemCount: 1, itemDamage: 0, nbtData: undefined }
    })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.once('listening', () => {
      resolve({
        close: () => server.close(),
        get handshakeReply () { return state.handshakeReply }
      })
    })
  })
}
