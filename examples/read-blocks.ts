/**
 * Join a server, read what is around the bot, print it. Nothing is sent anywhere.
 *
 *     npx tsx examples/read-blocks.ts <host> [port] [username]
 *
 * Prints three things: custom blocks placed nearby, custom items in the bot's
 * own inventory, and custom items other players are holding or wearing.
 */

import mineflayer from 'mineflayer'
import cbPlugin from '../src/mineflayer'

const [host = 'localhost', port = '25565', username = 'CbScout'] = process.argv.slice(2)

const bot = mineflayer.createBot({
  host,
  port: parseInt(port, 10),
  username,
  version: '1.8.9', // MysteryBlocks 1.0.5 is 1.8.9 only
  auth: username.includes('@') ? 'microsoft' : 'offline'
})

bot.loadPlugin(cbPlugin as any)

bot.on('cb_handshake' as any, () => {
  console.log('[cb] server confirmed custom-block support, cb: ids will now arrive')
})

bot.once('spawn', () => {
  // Give the server a moment to send the chunks and the inventory.
  setTimeout(report, 3000)
})

function report (): void {
  const cb = (bot as any).cb

  const blocks = cb.findBlocks({ maxDistance: 24, count: 200 })
  console.log(`\n${blocks.length} custom blocks within 24 blocks`)
  for (const b of blocks.slice(0, 20)) {
    const props = Object.entries(b.properties).map(([k, v]) => `${k}=${v}`).join(',')
    const pos = `${b.position.x},${b.position.y},${b.position.z}`
    console.log(`  ${pos.padEnd(18)} ${b.key.padEnd(28)} meta=${b.meta} [${props}]` +
      (b.derivedFromNeighbours ? '  (shape depends on neighbours)' : ''))
  }

  const items = cb.inventory()
  console.log(`\n${items.length} custom items in inventory`)
  for (const i of items) {
    console.log(`\n  slot ${i.slot}  ${i.key}  x${i.count}`)
    console.log(`    type          ${i.kind === 'item' ? i.itemClass : i.blockClass}`)
    console.log(`    name          ${i.customName || i.displayName}`)
    if (i.lore.length) console.log(`    lore          ${i.lore.join(' | ')}`)
    if (i.enchantments.length) {
      console.log(`    enchantments  ${i.enchantments.map((e: any) => `${e.name || e.id} ${e.lvl}`).join(', ')}`)
    }
    if (i.unbreakable) console.log('    unbreakable   yes')
    if (i.repairCost) console.log(`    repairCost    ${i.repairCost}`)
    if (i.attributeModifiers.length) {
      const mods = i.attributeModifiers.map((a: any) => `${a.attribute}${a.amount >= 0 ? '+' : ''}${a.amount}`)
      console.log(`    attributes    ${mods.join(', ')}`)
    }
    console.log(`    replacement   ${i.legacyReplacement || i.replacement}`)
  }

  // Equipment of other entities, which arrives in entity_equipment. This is the
  // only view the server gives of what other players carry.
  const carried = cb.nearbyItems({ maxDistance: 32 })
  const holders = new Set(carried.map((c: any) => c.entityId)).size
  console.log(`\n${carried.length} custom items on ${holders} nearby entities`)
  for (const c of carried) {
    const who = c.username || c.entityType || `entity ${c.entityId}`
    const away = c.distance !== null ? `${c.distance.toFixed(1)}m` : 'unknown distance'
    console.log(`  ${who.padEnd(18)} ${c.slot.padEnd(11)} ${c.item.key.padEnd(28)} ${away}` +
      (c.item.customName ? `  "${c.item.customName}"` : ''))
  }
}

bot.on('kicked', reason => console.log('[cb] kicked:', reason))
bot.on('error', err => console.log('[cb] error:', err.message))
