/**
 * A bot that joins a server, reads every `cb:` block and item it can see, and
 * re-broadcasts them for the receiver mod.
 *
 *     npx tsx examples/bridge/bot.ts <host> [port] [username]
 */

import mineflayer from 'mineflayer'
import cbPlugin from '../../src/mineflayer'
import { createBridge } from './bridge'

const [host = 'localhost', port = '25565', username = 'CbBridge'] = process.argv.slice(2)

const bot = mineflayer.createBot({
  host,
  port: parseInt(port, 10),
  username,
  version: '1.8.9', // MysteryBlocks 1.0.5 is 1.8.9 only
  auth: username.includes('@') ? 'microsoft' : 'offline'
})

bot.loadPlugin(cbPlugin as any)

const bridge = createBridge(bot, {
  port: 25599, // WebSocket, for browser and tooling consumers
  tcpPort: 25600, // line JSON, for the Forge receiver mod
  verbose: true
})

bot.on('cb_handshake' as any, () => {
  console.log('[cb] server confirmed custom-block support, cb: ids will now arrive')
})

bot.once('spawn', () => {
  console.log(`[cb] spawned as ${bot.username}`)
  setTimeout(() => bot.chat("/switch cb1"), 5000) // switch to the cb1 world //TODO: remove this line 
  setTimeout(scan, 20000)
})

function scan (): void {
  const cb = (bot as any).cb

  const blocks = cb.findBlocks({ maxDistance: 24, count: 200 })
  console.log(`[cb] ${blocks.length} custom blocks within 24 blocks`)
  for (const b of blocks.slice(0, 10)) {
    const props = Object.entries(b.properties).map(([k, v]) => `${k}=${v}`).join(',')
    const pos = `${b.position.x},${b.position.y},${b.position.z}`
    console.log(`     ${pos.padEnd(18)} ${b.key.padEnd(28)} meta=${b.meta} [${props}]` +
      (b.derivedFromNeighbours ? '  (shape depends on neighbours)' : ''))
  }
  if (blocks.length) bridge.sendSnapshot(blocks, { label: 'spawn scan', origin: bot.entity.position })

  const items = cb.inventory()
  console.log(`[cb] ${items.length} custom items in inventory`)
  for (const i of items) {
    console.log(`     slot ${String(i.slot).padEnd(3)} ${i.key.padEnd(28)} x${i.count}` +
      (i.customName ? `  name="${i.customName}"` : ''))
    bridge.sendItem(i)
  }

  const carried = cb.nearbyItems({ maxDistance: 32 })
  console.log(`[cb] ${carried.length} custom items on nearby entities`)
  for (const c of carried) {
    const who = c.username || c.entityType || `entity ${c.entityId}`
    console.log(`     ${who.padEnd(18)} ${c.slot.padEnd(11)} ${c.item.key}`)
  }
  if (carried.length) bridge.sendEntityItems(carried)
}

// Re-send equipment whenever a player changes what they are holding.
bot.on('entityEquip' as any, (entity: any) => {
  const found = (bot as any).cb.equipment(entity)
  if (found.length) bridge.sendEntityItems(found, { reason: 'entityEquip' })
})

// Report every custom block that changes while we watch.
bot.on('blockUpdate', (_oldBlock, newBlock) => {
  const cb = (bot as any).cb
  if (!newBlock || !cb.isCustomBlock(newBlock)) return
  const desc = cb.describeState(newBlock.stateId)
  console.log(`[cb] update ${desc.key} @ ${newBlock.position} meta=${desc.meta}`)
})

bot.on('kicked', reason => console.log('[cb] kicked:', reason))
bot.on('error', err => console.log('[cb] error:', err.message))
