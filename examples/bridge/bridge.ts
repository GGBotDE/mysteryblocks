/**
 * Example, not part of the library.
 *
 * Re-broadcasts what the bot learns about `cb:` blocks and items as JSON, so the
 * receiver mod in `client-mod/` can display it. The receiver is assumed to have
 * MysteryBlocks installed, so this sends the numeric id (a stable handle into
 * the mod's own registry) plus the decoded data as a readable fallback.
 *
 * See `cb-wire.schema.json` for the frame format.
 */

import * as net from 'net'
import { WebSocketServer } from 'ws'
import { loadRegistry } from '../../src'
import type { BlockDescription } from '../../src'

export const WIRE_VERSION = 1

const cb = loadRegistry()

export interface BridgeOptions {
  /** WebSocket port. Set to 0 or null to skip it. */
  port?: number | null
  /** Newline-delimited JSON port, which is what the Forge receiver uses. */
  tcpPort?: number | null
  host?: string
  /** When set, clients must present this token before anything is sent. */
  token?: string | null
  autoBroadcastBlockUpdates?: boolean
  verbose?: boolean
}

interface Client {
  kind: 'ws' | 'tcp'
  send (payload: string): void
  isOpen (): boolean
  close (): void
}

/** Serve the bot's custom-block view over a WebSocket and a plain TCP socket. */
export function createBridge (bot: any, options: BridgeOptions = {}) {
  const opts = {
    port: 25599,
    tcpPort: 25600,
    host: '127.0.0.1',
    token: null as string | null,
    autoBroadcastBlockUpdates: true,
    verbose: false,
    ...options
  }

  const clients = new Set<Client>()

  const wss = opts.port ? new WebSocketServer({ host: opts.host, port: opts.port }) : null

  wss?.on('connection', (ws, req) => {
    if (opts.token) {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (url.searchParams.get('token') !== opts.token) {
        ws.close(4001, 'bad token')
        return
      }
    }
    const client: Client = {
      kind: 'ws',
      send: str => { if (ws.readyState === ws.OPEN) ws.send(str) },
      isOpen: () => ws.readyState === ws.OPEN,
      close: () => ws.close()
    }
    clients.add(client)
    ws.on('close', () => clients.delete(client))
    ws.on('error', () => clients.delete(client))
    ws.on('message', raw => handleClientMessage(client, raw.toString()))
    send(client, hello())
    if (opts.verbose) console.log(`[cb] ws client connected (${clients.size} total)`)
  })

  // One JSON object per line, UTF-8. A Forge mod can read this with nothing more
  // than a Socket and a BufferedReader.
  const tcp = opts.tcpPort
    ? net.createServer(socket => {
      socket.setEncoding('utf8')
      let authed = !opts.token
      let buffer = ''

      const client: Client = {
        kind: 'tcp',
        send: str => { if (!socket.destroyed && authed) socket.write(str + '\n') },
        isOpen: () => !socket.destroyed,
        close: () => socket.end()
      }
      clients.add(client)

      socket.on('data', chunk => {
        buffer += chunk
        let index: number
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index).trim()
          buffer = buffer.slice(index + 1)
          if (!line) continue
          if (!authed) {
            let msg: any
            try { msg = JSON.parse(line) } catch { socket.end(); return }
            if (msg.kind !== 'auth' || msg.token !== opts.token) { socket.end(); return }
            authed = true
            send(client, hello())
            continue
          }
          handleClientMessage(client, line)
        }
      })
      socket.on('close', () => clients.delete(client))
      socket.on('error', () => clients.delete(client))

      if (authed) send(client, hello())
      if (opts.verbose) console.log(`[cb] tcp client connected (${clients.size} total)`)
    })
    : null

  if (tcp && opts.tcpPort) tcp.listen(opts.tcpPort, opts.host)

  /** The frame every client gets first, so it can check it speaks the same registry. */
  function hello (): Record<string, unknown> {
    return {
      v: WIRE_VERSION,
      kind: 'hello',
      mod: 'mysterymod_customblocks',
      modVersion: cb.data.modVersion,
      minecraftVersion: cb.data.minecraftVersion,
      cbProtocol: cb.protocol,
      registryHash: cb.hash,
      idBase: cb.idBase,
      blockIdRange: cb.blockIdRange,
      itemIdRange: cb.itemIdRange,
      bot: bot.username || null,
      handshakeSent: bot.cb ? bot.cb.state.handshakeSent : false,
      counts: { blocks: cb.blocks.length, items: cb.items.length }
    }
  }

  function send (client: Client, obj: unknown): void {
    client.send(JSON.stringify(obj))
  }

  function broadcast (obj: unknown): number {
    const payload = JSON.stringify(obj)
    let sent = 0
    for (const client of clients) {
      if (!client.isOpen()) continue
      client.send(payload)
      sent++
    }
    return sent
  }

  /** Send one block. Returns how many clients got it. */
  function sendBlock (desc: BlockDescription | null, extra: Record<string, unknown> = {}): number {
    if (!desc) return 0
    return broadcast({
      v: WIRE_VERSION,
      kind: 'block',
      ts: Date.now(),
      dimension: bot.game ? bot.game.dimension : null,
      block: desc,
      ...extra
    })
  }

  /** Send one item stack. */
  function sendItem (desc: unknown, extra: Record<string, unknown> = {}): number {
    if (!desc) return 0
    return broadcast({ v: WIRE_VERSION, kind: 'item', ts: Date.now(), item: desc, ...extra })
  }

  /**
   * Send the custom items nearby entities are holding or wearing.
   *
   * Each entry carries who is holding it, which slot, and how far away, so the
   * receiver can label it without knowing anything about the world.
   */
  function sendEntityItems (found: any[], extra: Record<string, unknown> = {}): number {
    return broadcast({
      v: WIRE_VERSION,
      kind: 'entity_items',
      ts: Date.now(),
      count: found.length,
      items: found,
      ...extra
    })
  }

  /** Send a region of blocks, so the receiver can rebuild a whole structure. */
  function sendSnapshot (blocks: BlockDescription[], meta: { origin?: unknown, label?: string } = {}): number {
    return broadcast({
      v: WIRE_VERSION,
      kind: 'snapshot',
      ts: Date.now(),
      dimension: bot.game ? bot.game.dimension : null,
      origin: meta.origin ?? null,
      label: meta.label ?? null,
      count: blocks.length,
      blocks
    })
  }

  /** Send the full registry, so a receiver without the mod can still show names. */
  function sendRegistry (client?: Client): number | void {
    const msg = {
      v: WIRE_VERSION,
      kind: 'registry',
      ts: Date.now(),
      hash: cb.hash,
      blocks: cb.blocks,
      items: cb.items,
      itemGroups: cb.itemGroups
    }
    return client ? send(client, msg) : broadcast(msg)
  }

  function handleClientMessage (client: Client, raw: string): void {
    let msg: any
    try {
      msg = JSON.parse(raw)
    } catch {
      send(client, { v: WIRE_VERSION, kind: 'error', error: 'invalid json' })
      return
    }

    switch (msg.kind) {
      case 'get_registry':
        sendRegistry(client)
        return

      case 'get_inventory':
        send(client, { v: WIRE_VERSION, kind: 'inventory', ts: Date.now(), items: bot.cb.inventory() })
        return

      case 'get_block':
        send(client, {
          v: WIRE_VERSION,
          kind: 'block',
          ts: Date.now(),
          block: bot.cb.blockAt({ x: msg.x, y: msg.y, z: msg.z })
        })
        return

      case 'get_entity_items': {
        const found = bot.cb.nearbyItems({
          maxDistance: msg.radius || 32,
          match: msg.match || null
        })
        send(client, {
          v: WIRE_VERSION,
          kind: 'entity_items',
          ts: Date.now(),
          count: found.length,
          items: found
        })
        return
      }

      case 'scan': {
        const blocks = bot.cb.findBlocks({
          maxDistance: msg.radius || 16,
          count: msg.limit || 256,
          match: msg.match || null
        })
        send(client, {
          v: WIRE_VERSION,
          kind: 'snapshot',
          ts: Date.now(),
          origin: bot.entity ? bot.entity.position : null,
          count: blocks.length,
          blocks
        })
        return
      }

      default:
        send(client, { v: WIRE_VERSION, kind: 'error', error: `unknown kind '${msg.kind}'` })
    }
  }

  if (opts.autoBroadcastBlockUpdates) {
    bot.on('blockUpdate', (_oldBlock: any, newBlock: any) => {
      if (!newBlock || !cb.isBlockId(newBlock.type)) return
      const desc = cb.describeState(newBlock.stateId)
      if (!desc) return
      desc.position = { x: newBlock.position.x, y: newBlock.position.y, z: newBlock.position.z }
      sendBlock(desc, { reason: 'blockUpdate' })
    })
  }

  bot.on('cb_handshake', () => broadcast(hello()))

  function close (): void {
    for (const client of clients) client.close()
    clients.clear()
    wss?.close()
    tcp?.close()
  }

  if (opts.verbose) {
    if (wss) console.log(`[cb] websocket  ws://${opts.host}:${opts.port}`)
    if (tcp) console.log(`[cb] tcp json   ${opts.host}:${opts.tcpPort}`)
  }

  return {
    wss, tcp, clients, broadcast,
    sendBlock, sendItem, sendSnapshot, sendEntityItems, sendRegistry,
    close, WIRE_VERSION
  }
}

export default createBridge
