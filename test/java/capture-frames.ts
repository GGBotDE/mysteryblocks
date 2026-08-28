/**
 * Capture real bridge frames to a file, so the Java receiver can be checked
 * against them.
 *
 *     npx tsx test/java/capture-frames.ts [out.json]
 *
 * Boots the same fake 1.8.9 server the end to end suite uses, connects a bot,
 * and writes every frame the bridge emits. `WireContract.java` then parses that
 * file with the receiver mod's own classes, which is what proves the two sides
 * of the wire still agree.
 */

import * as fs from 'fs'
import * as path from 'path'
import mineflayer from 'mineflayer'
import WebSocket from 'ws'

import cbPlugin from '../../src/mineflayer'
import { createBridge } from '../../examples/bridge/bridge'
import { CHAIR_POS, VERSION, startFakeServer } from '../fake-server'

const PORT = 25889
const WS_PORT = 25899
const outFile = path.resolve(process.argv[2] ?? path.join(__dirname, 'frames.json'))

function waitFor (predicate: () => boolean, timeout = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = (): void => {
      if (predicate()) return resolve()
      if (Date.now() - start > timeout) return reject(new Error('timed out'))
      setTimeout(tick, 20)
    }
    tick()
  })
}

async function main (): Promise<void> {
  const server = await startFakeServer(PORT)

  const bot = mineflayer.createBot({
    host: '127.0.0.1',
    port: PORT,
    username: 'CbCapture',
    version: VERSION,
    auth: 'offline'
  }) as any

  bot.loadPlugin(cbPlugin)
  const bridge = createBridge(bot, { port: WS_PORT, tcpPort: null })

  await new Promise<void>(resolve => bot.once('spawn', resolve))

  const frames: any[] = []
  const socket = new WebSocket(`ws://127.0.0.1:${WS_PORT}`)
  socket.on('message', raw => frames.push(JSON.parse(raw.toString())))
  await new Promise<void>(resolve => socket.once('open', () => resolve()))

  await waitFor(() => bot.inventory.slots[36] != null && bot.blockAt(CHAIR_POS) != null)
  await waitFor(() => frames.some(f => f.kind === 'hello'))

  bridge.sendBlock(bot.cb.blockAt(CHAIR_POS))
  socket.send(JSON.stringify({ kind: 'scan', radius: 8, limit: 32 }))
  socket.send(JSON.stringify({ kind: 'get_inventory' }))
  socket.send(JSON.stringify({ kind: 'get_entity_items', radius: 32 }))

  await waitFor(() => ['block', 'snapshot', 'inventory', 'entity_items'].every(k => frames.some(f => f.kind === k)))

  fs.writeFileSync(outFile, JSON.stringify(frames, null, 1))
  console.log(`wrote ${frames.length} frames to ${outFile}`)
  console.log(`kinds: ${[...new Set(frames.map(f => f.kind))].join(', ')}`)

  socket.close()
  bridge.close()
  bot.end()
  server.close()
  setTimeout(() => process.exit(0), 200)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
